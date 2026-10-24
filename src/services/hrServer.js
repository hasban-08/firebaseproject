import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as signOutSecondary,
  sendPasswordResetEmail,
  updatePassword,
} from "firebase/auth";
import { auth, db, getSecondaryAuth } from "../firebase";
import {
  DEFAULT_COMPANY_SETTINGS,
  DEFAULT_LEAVE_QUOTAS,
  getLocalDateStr,
  getLocalMonthStr,
  calculateAttendanceStatus,
  evaluateCheckoutStatus,
  calculateHaversineDistanceMeters,
  calculateWorkingDaysBetween,
  hasLeaveOverlap,
  computeLeaveBalances,
  calculateSalaryStats,
  buildDefaultSchedule,
  parseDateValue,
} from "../utils/attendanceHelpers";

class HttpError extends Error {
  constructor(status, message, code = "") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function getCurrentUserContext() {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new HttpError(401, "Unauthorized: Please log in first.");
  }
  const snap = await getDoc(doc(db, "users", currentUser.uid));
  const data = snap.exists() ? snap.data() : {};
  return {
    uid: currentUser.uid,
    email: currentUser.email || data.email || "",
    name:
      data.name ||
      data.personalInfo?.fullName ||
      currentUser.displayName ||
      currentUser.email?.split("@")[0] ||
      "User",
    role: data.role || "employee",
    department: data.department || "General",
    designation: data.designation || "Staff",
    ...data,
  };
}

// ==========================================
// 1. IMMUTABLE AUDIT LOGS & NOTIFICATIONS
// ==========================================
export async function recordAuditLog({
  actorUid,
  actorName,
  actorRole,
  action,
  entity,
  entityId = "",
  before = null,
  after = null,
}) {
  try {
    const uid = actorUid || auth.currentUser?.uid || "system";
    await addDoc(collection(db, "audit_logs"), {
      actorUid: uid,
      actorName: actorName || auth.currentUser?.displayName || "User",
      actorRole: actorRole || "user",
      action,
      entity,
      entityId: String(entityId || ""),
      before: before ? JSON.parse(JSON.stringify(before)) : null,
      after: after ? JSON.parse(JSON.stringify(after)) : null,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("Audit log write warning:", err.message);
  }
}

export async function createNotification({
  uid,
  title,
  message,
  type = "info",
  link = "/",
}) {
  if (!uid) return;
  try {
    await addDoc(collection(db, "notifications"), {
      uid,
      title,
      message,
      type,
      link,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("Notification write warning:", err.message);
  }
}

// ==========================================
// 2. FIRST-RUN SETUP & COMPANY SETTINGS
// ==========================================
export async function checkCompanySetup() {
  try {
    const snap = await getDoc(doc(db, "settings", "company"));
    if (snap.exists()) {
      return {
        initialized: true,
        settings: { ...DEFAULT_COMPANY_SETTINGS, ...snap.data() },
      };
    }
    return { initialized: false, settings: DEFAULT_COMPANY_SETTINGS };
  } catch (err) {
    return { initialized: true, settings: DEFAULT_COMPANY_SETTINGS };
  }
}

export async function runFirstTimeSetup({
  companyName,
  adminName,
  adminEmail,
  adminPassword,
  officeStartTime = "09:00",
  officeEndTime = "18:00",
  graceMinutes = 15,
}) {
  const existing = await getDoc(doc(db, "settings", "company"));
  if (existing.exists()) {
    throw new HttpError(409, "First-run setup has already been completed.");
  }

  if (!companyName?.trim()) {
    throw new HttpError(422, "Company name is required.");
  }
  if (!adminName?.trim()) {
    throw new HttpError(422, "Admin full name is required.");
  }
  if (!adminEmail?.trim() || !adminPassword || adminPassword.length < 6) {
    throw new HttpError(
      422,
      "Valid admin email and password (at least 6 characters) are required."
    );
  }

  const cred = await createUserWithEmailAndPassword(
    auth,
    adminEmail.trim(),
    adminPassword
  );
  await updateProfile(cred.user, { displayName: adminName.trim() });

  const settingsPayload = {
    ...DEFAULT_COMPANY_SETTINGS,
    companyName: companyName.trim(),
    officeStartTime: officeStartTime || "09:00",
    officeEndTime: officeEndTime || "18:00",
    graceMinutes: Number(graceMinutes) || 15,
    createdAt: serverTimestamp(),
    createdBy: cred.user.uid,
  };

  const defaultSchedule = buildDefaultSchedule(settingsPayload);

  const adminUserDoc = {
    name: adminName.trim(),
    email: adminEmail.trim(),
    role: "admin",
    department: "Management",
    designation: "Chief Administrator",
    basicSalary: 150000,
    salary: 150000,
    grossSalary: 225000,
    schedule: defaultSchedule,
    active: true,
    mustChangePassword: false,
    profileComplete: true,
    personalInfo: {
      fullName: adminName.trim(),
      cnic: "42101-1234567-1",
      dob: "1990-01-01",
      phone: "0300-1234567",
      address: "Head Office",
    },
    bankDetails: {
      method: "bank",
      providerName: "Meezan Bank",
      accountTitle: adminName.trim(),
      accountNumber: "01010101010101",
      iban: "",
    },
    emergencyContact: {
      name: "Admin Emergency",
      relation: "Brother",
      phone: "0300-7654321",
    },
    createdAt: serverTimestamp(),
  };

  // Seed default master data alongside company settings
  await setDoc(doc(db, "users", cred.user.uid), adminUserDoc);
  await setDoc(doc(db, "settings", "company"), settingsPayload);

  const defaultDepts = ["Engineering", "Human Resources", "Finance", "Operations", "Sales"];
  for (const dName of defaultDepts) {
    const id = dName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await setDoc(doc(db, "departments", id), {
      name: dName,
      createdAt: serverTimestamp(),
    });
  }

  const defaultDesignations = [
    { title: "Software Engineer", department: "Engineering" },
    { title: "HR Manager", department: "Human Resources" },
    { title: "Accountant", department: "Finance" },
    { title: "Operations Executive", department: "Operations" },
  ];
  for (const des of defaultDesignations) {
    const id = des.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await setDoc(doc(db, "designations", id), {
      ...des,
      createdAt: serverTimestamp(),
    });
  }

  for (const lt of Object.values(DEFAULT_LEAVE_QUOTAS)) {
    await setDoc(doc(db, "leave_types", lt.key), {
      ...lt,
      updatedAt: serverTimestamp(),
    });
  }

  await recordAuditLog({
    actorUid: cred.user.uid,
    actorName: adminName.trim(),
    actorRole: "admin",
    action: "FIRST_RUN_SETUP",
    entity: "settings/company",
    entityId: "company",
    before: null,
    after: { companyName: settingsPayload.companyName, adminEmail: adminEmail.trim() },
  });

  return { ok: true, uid: cred.user.uid };
}

export async function saveCompanySettings(newSettings) {
  const actor = await getCurrentUserContext();
  if (!["admin", "hr"].includes(actor.role)) {
    throw new HttpError(403, "Only Admin or HR can update company settings.");
  }
  const ref = doc(db, "settings", "company");
  const prevSnap = await getDoc(ref);
  const before = prevSnap.exists() ? prevSnap.data() : null;

  const payload = {
    ...DEFAULT_COMPANY_SETTINGS,
    ...before,
    ...newSettings,
    graceMinutes: Number(newSettings.graceMinutes ?? 15),
    halfDayThresholdHours: Number(newSettings.halfDayThresholdHours ?? 5),
    updatedAt: serverTimestamp(),
    updatedBy: actor.uid,
  };

  await setDoc(ref, payload, { merge: true });
  await recordAuditLog({
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    action: "COMPANY_SETTINGS_UPDATED",
    entity: "settings",
    entityId: "company",
    before,
    after: newSettings,
  });
  return payload;
}

// ==========================================
// 3. USER REGISTRATION (ADMIN / HR) & PASSWORD FLOW
// ==========================================
export async function registerEmployeeByHR({
  name,
  email,
  tempPassword,
  role = "employee",
  department = "Engineering",
  designation = "Software Engineer",
  basicSalary = 60000,
  cnic = "",
  dob = "1998-01-01",
  phone = "",
  address = "",
  bankMethod = "bank",
  providerName = "Meezan Bank",
  accountTitle = "",
  accountNumber = "",
  iban = "",
}) {
  const actor = await getCurrentUserContext();
  if (!["admin", "hr"].includes(actor.role)) {
    throw new HttpError(403, "Only Admin or HR can register users.");
  }
  if (role !== "employee" && actor.role !== "admin") {
    throw new HttpError(403, "Only Admin can create HR or Admin accounts.");
  }
  if (!name?.trim() || !email?.trim() || !tempPassword || tempPassword.length < 6) {
    throw new HttpError(
      422,
      "Name, email, and temporary password (min 6 characters) are required."
    );
  }

  // Create user via Secondary Firebase App so current Admin/HR stays logged in
  const secondaryAuth = getSecondaryAuth();
  const cred = await createUserWithEmailAndPassword(
    secondaryAuth,
    email.trim(),
    tempPassword
  );
  await updateProfile(cred.user, { displayName: name.trim() });
  const newUid = cred.user.uid;
  await signOutSecondary(secondaryAuth);

  const { settings } = await checkCompanySetup();
  const defaultSchedule = buildDefaultSchedule(settings);
  const basic = Math.max(0, Number(basicSalary) || 0);
  const gross = Math.round(basic * 1.5);

  const userDoc = {
    name: name.trim(),
    email: email.trim(),
    role,
    department: department || "General",
    designation: designation || "Staff",
    basicSalary: basic,
    salary: basic,
    grossSalary: gross,
    schedule: defaultSchedule,
    active: true,
    mustChangePassword: true,
    profileComplete: Boolean(phone && address),
    personalInfo: {
      fullName: name.trim(),
      cnic: cnic || "",
      dob: dob || "1998-01-01",
      phone: phone || "",
      address: address || "",
    },
    bankDetails: {
      method: bankMethod || "bank",
      providerName: providerName || "Bank",
      accountTitle: accountTitle || name.trim(),
      accountNumber: accountNumber || "",
      iban: iban || "",
    },
    emergencyContact: {
      name: "",
      relation: "",
      phone: "",
    },
    createdBy: actor.uid,
    createdAt: serverTimestamp(),
  };

  await setDoc(doc(db, "users", newUid), userDoc);

  await recordAuditLog({
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    action: "USER_REGISTERED",
    entity: "users",
    entityId: newUid,
    before: null,
    after: {
      name: userDoc.name,
      email: userDoc.email,
      role,
      department,
      designation,
      basicSalary: basic,
      grossSalary: gross,
      mustChangePassword: true,
    },
  });

  await createNotification({
    uid: newUid,
    title: "Welcome to " + (settings.companyName || "WorkPulse"),
    message: "Please complete your contact details and emergency contact.",
    type: "welcome",
    link: "/complete-profile",
  });

  return { ok: true, uid: newUid, user: { uid: newUid, ...userDoc } };
}

export async function completeFirstLoginPasswordChange(newPassword) {
  if (!auth.currentUser) {
    throw new HttpError(401, "Not logged in.");
  }
  if (!newPassword || newPassword.length < 6) {
    throw new HttpError(422, "New password must be at least 6 characters.");
  }
  await updatePassword(auth.currentUser, newPassword);
  await updateDoc(doc(db, "users", auth.currentUser.uid), {
    mustChangePassword: false,
    updatedAt: serverTimestamp(),
  });
  await recordAuditLog({
    actorUid: auth.currentUser.uid,
    actorName: auth.currentUser.displayName || auth.currentUser.email,
    actorRole: "employee",
    action: "FIRST_LOGIN_PASSWORD_CHANGED",
    entity: "users",
    entityId: auth.currentUser.uid,
    before: { mustChangePassword: true },
    after: { mustChangePassword: false },
  });
  return { ok: true };
}

export async function updateEmployeeByHR(targetUid, updates) {
  const actor = await getCurrentUserContext();
  if (!["admin", "hr"].includes(actor.role)) {
    throw new HttpError(403, "Only Admin or HR can update employee records.");
  }

  const ref = doc(db, "users", targetUid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new HttpError(404, "Employee not found.");
  }
  const before = snap.data();

  if (before.role === "admin" && actor.role !== "admin") {
    throw new HttpError(403, "HR cannot modify Admin accounts.");
  }
  if (updates.role === "admin" && actor.role !== "admin") {
    throw new HttpError(403, "HR cannot promote a user to Admin.");
  }

  const payload = { ...updates, updatedAt: serverTimestamp() };
  if (updates.basicSalary !== undefined || updates.salary !== undefined) {
    const basic = Math.max(0, Number(updates.basicSalary ?? updates.salary) || 0);
    payload.basicSalary = basic;
    payload.salary = basic;
    payload.grossSalary = Math.round(basic * 1.5);
  }

  await updateDoc(ref, payload);
  await recordAuditLog({
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    action: "EMPLOYEE_UPDATED_BY_HR",
    entity: "users",
    entityId: targetUid,
    before: {
      role: before.role,
      department: before.department,
      designation: before.designation,
      basicSalary: before.basicSalary ?? before.salary,
      active: before.active,
    },
    after: updates,
  });

  return { ok: true };
}

export async function sendUserPasswordReset(email) {
  const actor = await getCurrentUserContext();
  if (!["admin", "hr"].includes(actor.role)) {
    throw new HttpError(403, "Only Admin or HR can trigger password resets.");
  }
  await sendPasswordResetEmail(auth, email);
  await recordAuditLog({
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    action: "USER_PASSWORD_RESET_SENT",
    entity: "users",
    entityId: email,
    before: null,
    after: { email },
  });
  return { ok: true };
}

// ==========================================
// 4. SELF CHECK-IN / CHECK-OUT & CORRECTIONS
// ==========================================
export async function selfCheckIn({ lat = null, lng = null } = {}) {
  const actor = await getCurrentUserContext();
  if (actor.active === false) {
    throw new HttpError(403, "Your account is deactivated. Contact Admin/HR.");
  }

  const todayStr = getLocalDateStr();
  const monthStr = getLocalMonthStr();
  const attId = `${actor.uid}_${todayStr}`;
  const attRef = doc(db, "attendance", attId);

  const existing = await getDoc(attRef);
  if (existing.exists()) {
    throw new HttpError(
      409,
      "409 Conflict: You have already checked in today. Duplicate check-in is not allowed.",
      "DUPLICATE_CHECKIN"
    );
  }

  const { settings } = await checkCompanySetup();
  let distanceMeters = null;

  if (settings.officeLocation?.lat && lat !== null && lng !== null) {
    distanceMeters = calculateHaversineDistanceMeters(
      Number(lat),
      Number(lng),
      Number(settings.officeLocation.lat),
      Number(settings.officeLocation.lng)
    );
    if (
      settings.officeLocation.enforceLocation &&
      distanceMeters > (Number(settings.officeLocation.radiusMeters) || 500)
    ) {
      throw new HttpError(
        422,
        `422 Unprocessable: You are ${distanceMeters}m away from office (allowed radius: ${settings.officeLocation.radiusMeters}m).`,
        "OUTSIDE_OFFICE_RADIUS"
      );
    }
  } else if (settings.officeLocation?.enforceLocation) {
    throw new HttpError(
      422,
      "422 Unprocessable: GPS location permission is required to check in at the office.",
      "LOCATION_REQUIRED"
    );
  }

  const now = new Date();
  const { status, lateMinutes } = calculateAttendanceStatus(
    actor.schedule,
    now,
    settings
  );

  const record = {
    uid: actor.uid,
    name: actor.name,
    department: actor.department || "General",
    date: todayStr,
    month: monthStr,
    checkInTime: serverTimestamp(),
    checkOutTime: null,
    workedHours: 0,
    status, // "present" (<=09:15) or "late" (>09:15)
    lateMinutes,
    location: lat !== null && lng !== null ? { lat, lng, distanceMeters } : null,
    markedBy: actor.uid,
  };

  await setDoc(attRef, record);

  await recordAuditLog({
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    action: "SELF_CHECK_IN",
    entity: "attendance",
    entityId: attId,
    before: null,
    after: { date: todayStr, status, lateMinutes, distanceMeters },
  });

  return {
    ...record,
    checkInTime: Timestamp.fromDate(now),
  };
}

export async function selfCheckOut() {
  const actor = await getCurrentUserContext();
  const todayStr = getLocalDateStr();
  const attId = `${actor.uid}_${todayStr}`;
  const attRef = doc(db, "attendance", attId);

  const existing = await getDoc(attRef);
  if (!existing.exists()) {
    throw new HttpError(422, "422 Unprocessable: You have not checked in today.");
  }

  const data = existing.data();
  if (data.checkOutTime) {
    throw new HttpError(
      409,
      "409 Conflict: You have already checked out today.",
      "DUPLICATE_CHECKOUT"
    );
  }

  const { settings } = await checkCompanySetup();
  const now = new Date();
  const { workedHours, status } = evaluateCheckoutStatus({
    checkInTime: data.checkInTime,
    checkOutTime: now,
    initialStatus: data.status,
    halfDayThresholdHours: Number(settings.halfDayThresholdHours) || 5,
  });

  await updateDoc(attRef, {
    checkOutTime: serverTimestamp(),
    workedHours,
    status,
    updatedAt: serverTimestamp(),
  });

  await recordAuditLog({
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    action: "SELF_CHECK_OUT",
    entity: "attendance",
    entityId: attId,
    before: { status: data.status, checkOutTime: null },
    after: { status, workedHours },
  });

  return {
    ...data,
    checkOutTime: Timestamp.fromDate(now),
    workedHours,
    status,
  };
}

export async function submitAttendanceCorrection({
  date,
  requestedCheckIn = "09:00",
  requestedCheckOut = "18:00",
  reason,
}) {
  const actor = await getCurrentUserContext();
  if (!date || !reason?.trim()) {
    throw new HttpError(422, "Date and reason are required for attendance correction.");
  }

  const docData = {
    uid: actor.uid,
    employeeName: actor.name,
    department: actor.department || "General",
    date,
    requestedCheckIn,
    requestedCheckOut,
    reason: reason.trim(),
    status: "pending",
    createdAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, "attendance_corrections"), docData);
  await recordAuditLog({
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    action: "ATTENDANCE_CORRECTION_REQUESTED",
    entity: "attendance_corrections",
    entityId: ref.id,
    before: null,
    after: { date, requestedCheckIn, requestedCheckOut, reason: reason.trim() },
  });

  return { id: ref.id, ...docData };
}

export async function reviewAttendanceCorrection({
  correction,
  decision, // "approved" | "rejected"
  comment = "",
}) {
  const actor = await getCurrentUserContext();
  if (!["admin", "hr"].includes(actor.role)) {
    throw new HttpError(403, "Only Admin or HR can review attendance corrections.");
  }

  const corrRef = doc(db, "attendance_corrections", correction.id);
  await updateDoc(corrRef, {
    status: decision,
    adminComment: comment.trim(),
    reviewedBy: actor.uid,
    reviewedByName: actor.name,
    reviewedAt: serverTimestamp(),
  });

  if (decision === "approved") {
    const attId = `${correction.uid}_${correction.date}`;
    const attRef = doc(db, "attendance", attId);
    const prevSnap = await getDoc(attRef);
    const before = prevSnap.exists() ? prevSnap.data() : null;

    const inDate = new Date(`${correction.date}T${correction.requestedCheckIn || "09:00"}:00`);
    const outDate = new Date(`${correction.date}T${correction.requestedCheckOut || "18:00"}:00`);
    const { settings } = await checkCompanySetup();
    const { status: inStatus, lateMinutes } = calculateAttendanceStatus(
      null,
      inDate,
      settings
    );
    const { workedHours, status: finalStatus } = evaluateCheckoutStatus({
      checkInTime: inDate,
      checkOutTime: outDate,
      initialStatus: inStatus,
      halfDayThresholdHours: settings.halfDayThresholdHours || 5,
    });

    const newRecord = {
      uid: correction.uid,
      name: correction.employeeName,
      department: correction.department || "General",
      date: correction.date,
      month: correction.date.slice(0, 7),
      checkInTime: Timestamp.fromDate(inDate),
      checkOutTime: Timestamp.fromDate(outDate),
      workedHours,
      status: finalStatus,
      lateMinutes,
      correctedBy: actor.uid,
      correctionId: correction.id,
      updatedAt: serverTimestamp(),
    };

    await setDoc(attRef, newRecord, { merge: true });
    await recordAuditLog({
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      action: "ATTENDANCE_CORRECTION_APPROVED",
      entity: "attendance",
      entityId: attId,
      before,
      after: {
        date: correction.date,
        status: finalStatus,
        workedHours,
        lateMinutes,
      },
    });
  }

  await createNotification({
    uid: correction.uid,
    title: `Attendance Correction ${decision === "approved" ? "Approved" : "Rejected"}`,
    message: `Your attendance correction for ${correction.date} was ${decision}.${
      comment ? " Note: " + comment : ""
    }`,
    type: decision === "approved" ? "success" : "warning",
    link: "/my-attendance",
  });

  return { ok: true };
}

// ==========================================
// 5. LEAVE QUOTAS, WORKING DAYS & 422 VALIDATION
// ==========================================
export async function applyForLeave({
  requestType = "leave", // "leave" | "earlyLeave"
  leaveType = "annual", // "annual" | "sick" | "casual" | "unpaid"
  startDate,
  endDate,
  earlyLeaveTime = "",
  reason = "",
}) {
  const actor = await getCurrentUserContext();
  if (!reason?.trim()) {
    throw new HttpError(422, "422 Unprocessable: Please provide a reason for your leave.");
  }

  const [settingsRes, holidaysSnap, leavesSnap] = await Promise.all([
    checkCompanySetup(),
    getDocs(collection(db, "public_holidays")),
    getDocs(query(collection(db, "leaveRequests"), where("uid", "==", actor.uid))),
  ]);

  const weekendDays = settingsRes.settings?.weekendDays || ["sat", "sun"];
  const publicHolidays = holidaysSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const existingLeaves = leavesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (requestType === "earlyLeave") {
    if (!startDate || !earlyLeaveTime) {
      throw new HttpError(422, "Date and early departure time are required.");
    }
    const payload = {
      uid: actor.uid,
      employeeName: actor.name,
      employeeEmail: actor.email,
      department: actor.department || "General",
      type: "earlyLeave",
      leaveType: "earlyLeave",
      date: startDate,
      earlyLeaveTime,
      workingDays: 0,
      reason: reason.trim(),
      status: "pending",
      createdAt: serverTimestamp(),
    };
    const ref = await addDoc(collection(db, "leaveRequests"), payload);
    return { id: ref.id, ...payload };
  }

  if (!startDate || !endDate || endDate < startDate) {
    throw new HttpError(
      422,
      "422 Unprocessable: End date cannot be earlier than start date."
    );
  }

  // 1. Check Date Overlap -> 422
  const overlapping = hasLeaveOverlap(startDate, endDate, existingLeaves);
  if (overlapping) {
    throw new HttpError(
      422,
      `422 Unprocessable: Dates overlap with an existing ${overlapping.status} leave (${
        overlapping.startDate || overlapping.date
      } to ${overlapping.endDate || overlapping.date}).`,
      "LEAVE_OVERLAP"
    );
  }

  // 2. Count Working Days (skipping weekends and public holidays)
  const { count: workingDays, dates } = calculateWorkingDaysBetween(
    startDate,
    endDate,
    weekendDays,
    publicHolidays
  );

  if (workingDays <= 0) {
    throw new HttpError(
      422,
      "422 Unprocessable: Selected dates contain 0 working days (only weekends or public holidays).",
      "ZERO_WORKING_DAYS"
    );
  }

  // 3. Check Quota Balance -> 422
  const year = Number(startDate.slice(0, 4)) || new Date().getFullYear();
  const balances = computeLeaveBalances(
    existingLeaves,
    year,
    null,
    weekendDays,
    publicHolidays
  );
  const catBalance = balances[leaveType];

  if (catBalance && catBalance.quota !== null) {
    const availableAfterPending = Math.max(
      0,
      catBalance.quota - catBalance.used - catBalance.pending
    );
    if (workingDays > availableAfterPending) {
      throw new HttpError(
        422,
        `422 Unprocessable: Insufficient ${catBalance.label} balance. Requested ${workingDays} working day(s), but only ${availableAfterPending} day(s) available (Quota: ${catBalance.quota}, Used: ${catBalance.used}, Pending: ${catBalance.pending}).`,
        "OVER_LEAVE_BALANCE"
      );
    }
  }

  const newLeave = {
    uid: actor.uid,
    employeeName: actor.name,
    employeeEmail: actor.email,
    department: actor.department || "General",
    type: "leave",
    leaveType,
    startDate,
    endDate,
    workingDays,
    dates,
    reason: reason.trim(),
    status: "pending",
    createdAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, "leaveRequests"), newLeave);

  await recordAuditLog({
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    action: "LEAVE_APPLIED",
    entity: "leaveRequests",
    entityId: ref.id,
    before: null,
    after: { leaveType, startDate, endDate, workingDays, status: "pending" },
  });

  return { id: ref.id, ...newLeave };
}

export async function cancelLeaveRequest(leaveId) {
  const actor = await getCurrentUserContext();
  const ref = doc(db, "leaveRequests", leaveId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new HttpError(404, "Leave request not found.");
  }
  const data = snap.data();
  if (data.uid !== actor.uid && !["admin", "hr"].includes(actor.role)) {
    throw new HttpError(403, "You can only cancel your own leave request.");
  }
  if (data.status !== "pending") {
    throw new HttpError(422, "Only pending leave requests can be cancelled.");
  }

  await updateDoc(ref, {
    status: "cancelled",
    cancelledAt: serverTimestamp(),
  });

  await recordAuditLog({
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    action: "LEAVE_CANCELLED",
    entity: "leaveRequests",
    entityId: leaveId,
    before: { status: "pending" },
    after: { status: "cancelled" },
  });

  return { ok: true };
}

export async function reviewLeaveRequest({ request, status, comment = "" }) {
  const actor = await getCurrentUserContext();
  if (!["admin", "hr"].includes(actor.role)) {
    throw new HttpError(403, "Only Admin or HR can approve or reject leaves.");
  }

  const ref = doc(db, "leaveRequests", request.id);
  await updateDoc(ref, {
    status,
    adminComment: comment.trim(),
    reviewedBy: actor.uid,
    reviewedByName: actor.name,
    reviewedAt: serverTimestamp(),
  });

  await recordAuditLog({
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    action: status === "approved" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
    entity: "leaveRequests",
    entityId: request.id,
    before: { status: request.status },
    after: { status, adminComment: comment.trim() },
  });

  await createNotification({
    uid: request.uid,
    title: `Leave Request ${status === "approved" ? "Approved" : "Rejected"}`,
    message: `Your ${request.leaveType || "leave"} request (${
      request.startDate || request.date
    }${request.endDate ? " to " + request.endDate : ""}) was ${status}.${
      comment ? " Comment: " + comment : ""
    }`,
    type: status === "approved" ? "success" : "warning",
    link: "/leave-request",
  });

  return { ok: true };
}

// ==========================================
// 6. PAYROLL ENGINE: DRAFT -> FINALIZE -> LOCK
// ==========================================
export async function generatePayrollDraft(monthStr = getLocalMonthStr()) {
  const actor = await getCurrentUserContext();
  if (!["admin", "hr"].includes(actor.role)) {
    throw new HttpError(403, "Only Admin or HR can generate payroll runs.");
  }

  // Check if already locked
  const existingPayrollsSnap = await getDocs(
    query(collection(db, "payrolls"), where("month", "==", monthStr))
  );
  const existingLocked = existingPayrollsSnap.docs.some(
    (d) => d.data().status === "locked"
  );
  if (existingLocked) {
    throw new HttpError(
      409,
      `409 Conflict: Payroll for ${monthStr} is already finalized and locked.`
    );
  }

  const [usersSnap, attSnap, leavesSnap, holidaysSnap, settingsRes] =
    await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(query(collection(db, "attendance"), where("month", "==", monthStr))),
      getDocs(
        query(collection(db, "leaveRequests"), where("status", "==", "approved"))
      ),
      getDocs(collection(db, "public_holidays")),
      checkCompanySetup(),
    ]);

  const holidays = holidaysSnap.docs.map((d) => d.data());
  const latePenaltyEnabled =
    settingsRes.settings?.latePenaltyEnabled !== false;

  const attByUid = {};
  attSnap.docs.forEach((d) => {
    const r = d.data();
    (attByUid[r.uid] = attByUid[r.uid] || []).push(r);
  });

  const leavesByUid = {};
  leavesSnap.docs.forEach((d) => {
    const l = d.data();
    (leavesByUid[l.uid] = leavesByUid[l.uid] || []).push(l);
  });

  const batch = writeBatch(db);
  const results = [];

  usersSnap.docs.forEach((uDoc) => {
    const emp = { uid: uDoc.id, ...uDoc.data() };
    if (emp.active === false) return;

    const baseSalary = Number(emp.basicSalary ?? emp.salary) || 0;
    const calc = calculateSalaryStats({
      records: attByUid[emp.uid] || [],
      schedule: emp.schedule,
      baseSalary,
      month: monthStr,
      approvedLeaves: leavesByUid[emp.uid] || [],
      publicHolidays: holidays,
      latePenaltyEnabled,
    });

    const payrollId = `${emp.uid}_${monthStr}`;
    const payrollDoc = {
      id: payrollId,
      uid: emp.uid,
      employeeName: emp.name || emp.personalInfo?.fullName || "Employee",
      email: emp.email || "",
      department: emp.department || "General",
      designation: emp.designation || "Staff",
      month: monthStr,
      ...calc,
      method: emp.bankDetails?.method || "bank",
      providerName: emp.bankDetails?.providerName || "—",
      accountTitle: emp.bankDetails?.accountTitle || emp.name || "—",
      accountNumber: emp.bankDetails?.accountNumber || "—",
      iban: emp.bankDetails?.iban || "",
      status: "draft",
      generatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    };

    batch.set(doc(db, "payrolls", payrollId), payrollDoc, { merge: true });
    results.push(payrollDoc);
  });

  await batch.commit();

  await recordAuditLog({
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    action: "PAYROLL_DRAFT_GENERATED",
    entity: "payrolls",
    entityId: monthStr,
    before: null,
    after: { month: monthStr, employeeCount: results.length, status: "draft" },
  });

  return results;
}

export async function finalizeAndLockPayroll(monthStr = getLocalMonthStr()) {
  const actor = await getCurrentUserContext();
  if (actor.role !== "admin") {
    throw new HttpError(
      403,
      "Only Admin can finalize and lock the monthly payroll run."
    );
  }

  const snap = await getDocs(
    query(collection(db, "payrolls"), where("month", "==", monthStr))
  );
  if (snap.empty) {
    throw new HttpError(
      422,
      "No draft payroll found for this month. Please generate draft first."
    );
  }

  const batch = writeBatch(db);
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  docs.forEach((p) => {
    batch.update(doc(db, "payrolls", p.id), {
      status: "locked",
      finalizedBy: actor.uid,
      finalizedAt: serverTimestamp(),
    });
  });

  await batch.commit();

  for (const p of docs) {
    await createNotification({
      uid: p.uid,
      title: `Payslip Ready — ${monthStr}`,
      message: `Your salary slip for ${monthStr} (Net Pay: Rs. ${ Number(
        p.netSalary || 0
      ).toLocaleString()}) has been finalized and is ready for PDF download.`,
      type: "payslip",
      link: "/my-payslips",
    });
  }

  await recordAuditLog({
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    action: "PAYROLL_FINALIZED_LOCKED",
    entity: "payrolls",
    entityId: monthStr,
    before: { status: "draft" },
    after: { status: "locked", employeeCount: docs.length },
  });

  return { ok: true, count: docs.length };
}

// ==========================================
// 7. SERVER ANALYTICS & ROLE DASHBOARDS (P2)
// ==========================================
export async function computeDashboardAnalytics({
  startDate = "",
  endDate = "",
  department = "ALL",
} = {}) {
  const actor = await getCurrentUserContext();
  const todayStr = getLocalDateStr();
  const currentMonth = getLocalMonthStr();

  // Default 14-day range if not provided
  const endD = endDate || todayStr;
  const startObj = new Date();
  startObj.setDate(startObj.getDate() - 13);
  const startD = startDate || getLocalDateStr(startObj);

  const [usersSnap, attSnap, leavesSnap, payrollsSnap, holidaysSnap, corrSnap] =
    await Promise.all([
      getDocs(
        ["admin", "hr"].includes(actor.role)
          ? collection(db, "users")
          : query(collection(db, "users"), where("__name__", "==", actor.uid))
      ),
      getDocs(
        ["admin", "hr"].includes(actor.role)
          ? collection(db, "attendance")
          : query(collection(db, "attendance"), where("uid", "==", actor.uid))
      ),
      getDocs(
        ["admin", "hr"].includes(actor.role)
          ? collection(db, "leaveRequests")
          : query(collection(db, "leaveRequests"), where("uid", "==", actor.uid))
      ),
      getDocs(
        ["admin", "hr"].includes(actor.role)
          ? collection(db, "payrolls")
          : query(collection(db, "payrolls"), where("uid", "==", actor.uid))
      ),
      getDocs(collection(db, "public_holidays")),
      getDocs(
        ["admin", "hr"].includes(actor.role)
          ? collection(db, "attendance_corrections")
          : query(
              collection(db, "attendance_corrections"),
              where("uid", "==", actor.uid)
            )
      ),
    ]);

  const holidays = holidaysSnap.docs.map((d) => d.data());
  const allUsers = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  const departments = Array.from(
    new Set(["Engineering", "Human Resources", "Finance", "Operations", "Sales", ...allUsers.map((u) => u.department || "General")])
  );

  const filteredUsers =
    department && department !== "ALL"
      ? allUsers.filter((u) => (u.department || "General") === department)
      : allUsers;
  const allowedUids = new Set(filteredUsers.map((u) => u.uid));
  const userByUid = {};
  allUsers.forEach((u) => {
    userByUid[u.uid] = u;
  });

  const allAtt = attSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => allowedUids.has(r.uid));

  const rangeAtt = allAtt.filter(
    (r) => r.date >= startD && r.date <= endD
  );

  const allLeaves = leavesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((l) => allowedUids.has(l.uid));

  const allCorrections = corrSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => allowedUids.has(c.uid));

  // Today's KPIs
  const todayAtt = allAtt.filter((r) => r.date === todayStr);
  const presentToday = todayAtt.length;
  const lateToday = todayAtt.filter(
    (r) => r.status === "late" || r.status === "extreme-late"
  ).length;
  const onLeaveToday = allLeaves.filter(
    (l) =>
      l.status === "approved" &&
      l.type !== "earlyLeave" &&
      (l.startDate || l.date) <= todayStr &&
      (l.endDate || l.date) >= todayStr
  ).length;
  const pendingLeaves = allLeaves.filter((l) => l.status === "pending").length;
  const pendingCorrections = allCorrections.filter(
    (c) => c.status === "pending"
  ).length;

  // Attendance Trend (Date range)
  const trendMap = {};
  const cursor = new Date(startD + "T00:00:00");
  const endCursor = new Date(endD + "T00:00:00");
  let guard = 0;
  while (cursor <= endCursor && guard < 62) {
    const dStr = getLocalDateStr(cursor);
    trendMap[dStr] = {
      date: dStr.slice(5),
      fullDate: dStr,
      Present: 0,
      Late: 0,
      HalfDay: 0,
      Absent: 0,
    };
    cursor.setDate(cursor.getDate() + 1);
    guard++;
  }

  rangeAtt.forEach((r) => {
    if (!trendMap[r.date]) return;
    if (r.status === "late" || r.status === "extreme-late") {
      trendMap[r.date].Late += 1;
      trendMap[r.date].Present += 1;
    } else if (r.status === "half_day") {
      trendMap[r.date].HalfDay += 1;
      trendMap[r.date].Present += 1;
    } else {
      trendMap[r.date].Present += 1;
    }
  });

  const headcount = filteredUsers.length || 1;
  Object.values(trendMap).forEach((dayObj) => {
    const dObj = new Date(dayObj.fullDate + "T00:00:00");
    const isWeekend = dObj.getDay() === 0 || dObj.getDay() === 6;
    dayObj.Absent = isWeekend
      ? 0
      : Math.max(0, headcount - dayObj.Present);
  });

  const attendanceTrend = Object.values(trendMap);

  // Absenteeism by Department
  const deptStatsMap = {};
  filteredUsers.forEach((u) => {
    const dept = u.department || "General";
    if (!deptStatsMap[dept]) {
      deptStatsMap[dept] = {
        department: dept,
        employees: 0,
        presentRecords: 0,
        lateRecords: 0,
        absentDays: 0,
      };
    }
    deptStatsMap[dept].employees += 1;
  });

  rangeAtt.forEach((r) => {
    const dept = userByUid[r.uid]?.department || r.department || "General";
    if (!deptStatsMap[dept]) {
      deptStatsMap[dept] = {
        department: dept,
        employees: 1,
        presentRecords: 0,
        lateRecords: 0,
        absentDays: 0,
      };
    }
    deptStatsMap[dept].presentRecords += 1;
    if (r.status === "late" || r.status === "extreme-late") {
      deptStatsMap[dept].lateRecords += 1;
    }
  });

  const workingDaysInRange = Math.max(
    1,
    calculateWorkingDaysBetween(startD, endD, ["sat", "sun"], holidays).count
  );
  const deptAbsenteeism = Object.values(deptStatsMap).map((d) => {
    const expected = d.employees * workingDaysInRange;
    const absences = Math.max(0, expected - d.presentRecords);
    return {
      ...d,
      absentDays: absences,
      absentRate: expected > 0 ? Math.round((absences / expected) * 100) : 0,
    };
  });

  // Top 5 Late-Comers
  const lateMap = {};
  rangeAtt.forEach((r) => {
    if (r.status === "late" || r.status === "extreme-late") {
      if (!lateMap[r.uid]) {
        lateMap[r.uid] = {
          uid: r.uid,
          name: userByUid[r.uid]?.name || r.name || "Employee",
          department: userByUid[r.uid]?.department || r.department || "General",
          lateCount: 0,
          totalLateMinutes: 0,
        };
      }
      lateMap[r.uid].lateCount += 1;
      lateMap[r.uid].totalLateMinutes += Number(r.lateMinutes) || 0;
    }
  });

  const topLateComers = Object.values(lateMap)
    .sort(
      (a, b) =>
        b.lateCount - a.lateCount || b.totalLateMinutes - a.totalLateMinutes
    )
    .slice(0, 5);

  // Employee Personal Metrics (Hours this week vs 40h, Leave Balance, Latest Payslip)
  const myAtt = allAtt.filter((r) => r.uid === actor.uid);
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 Sun .. 6 Sat
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  const mondayStr = getLocalDateStr(monday);

  let hoursThisWeek = 0;
  myAtt
    .filter((r) => r.date >= mondayStr && r.date <= todayStr)
    .forEach((r) => {
      if (typeof r.workedHours === "number" && r.workedHours > 0) {
        hoursThisWeek += r.workedHours;
      } else if (r.checkInTime && !r.checkOutTime && r.date === todayStr) {
        const inTime = parseDateValue(r.checkInTime);
        if (inTime) {
          hoursThisWeek += Math.max(
            0,
            (Date.now() - inTime.getTime()) / 3600000
          );
        }
      } else if (r.checkInTime) {
        hoursThisWeek += 8; // historical completed day fallback
      }
    });
  hoursThisWeek = Number(hoursThisWeek.toFixed(1));

  const myLeaves = allLeaves.filter((l) => l.uid === actor.uid);
  const myLeaveBalances = computeLeaveBalances(
    myLeaves,
    now.getFullYear(),
    null,
    ["sat", "sun"],
    holidays
  );

  const myPayrolls = payrollsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p.uid === actor.uid)
    .sort((a, b) => (b.month || "").localeCompare(a.month || ""));

  let latestPayslip = myPayrolls[0] || null;
  if (!latestPayslip) {
    const calc = calculateSalaryStats({
      records: myAtt.filter((r) => r.month === currentMonth),
      schedule: actor.schedule,
      baseSalary: Number(actor.basicSalary ?? actor.salary) || 0,
      month: currentMonth,
      approvedLeaves: myLeaves.filter((l) => l.status === "approved"),
      publicHolidays: holidays,
    });
    latestPayslip = {
      uid: actor.uid,
      employeeName: actor.name,
      department: actor.department || "General",
      designation: actor.designation || "Staff",
      month: currentMonth,
      status: "estimated",
      ...calc,
    };
  }

  return {
    computedAt: new Date().toISOString(),
    filters: { startDate: startD, endDate: endD, department },
    departments,
    kpis: {
      headcount: filteredUsers.length,
      presentToday,
      onLeaveToday,
      lateToday,
      absentToday: Math.max(
        0,
        filteredUsers.length - (presentToday + onLeaveToday)
      ),
      pendingApprovals: pendingLeaves + pendingCorrections,
      pendingLeaves,
      pendingCorrections,
    },
    attendanceTrend,
    deptAbsenteeism,
    topLateComers,
    employeePersonal: {
      hoursThisWeek,
      weeklyTargetHours: 40,
      leaveBalances: myLeaveBalances,
      latestPayslip,
      todayRecord: todayAtt.find((r) => r.uid === actor.uid) || null,
    },
  };
}

// ==========================================
// 8. AI ASSISTANT: 7 TOOLS, SUMMARIZER & SMART LEAVE (P3)
// ==========================================
export async function executeAiTool(toolName, args = {}, actorContext = null) {
  const actor = actorContext || (await getCurrentUserContext());
  const isPrivileged = ["admin", "hr"].includes(actor.role);
  const todayStr = getLocalDateStr();
  const currentMonth = getLocalMonthStr();

  switch (toolName) {
    case "get_headcount": {
      if (!isPrivileged) {
        return {
          scope: "employee",
          department: actor.department || "General",
          message: "Employee scope: You belong to " + (actor.department || "General"),
        };
      }
      const snap = await getDocs(collection(db, "users"));
      const byDept = {};
      snap.docs.forEach((d) => {
        const dept = d.data().department || "General";
        byDept[dept] = (byDept[dept] || 0) + 1;
      });
      return { totalHeadcount: snap.size, byDepartment: byDept };
    }

    case "get_attendance_summary": {
      const q = isPrivileged
        ? query(collection(db, "attendance"), where("month", "==", args.month || currentMonth))
        : query(
            collection(db, "attendance"),
            where("uid", "==", actor.uid),
            where("month", "==", args.month || currentMonth)
          );
      const snap = await getDocs(q);
      const docs = snap.docs.map((d) => d.data());
      return {
        scope: isPrivileged ? "company" : "self",
        month: args.month || currentMonth,
        totalRecords: docs.length,
        presentOnTime: docs.filter((r) => r.status === "present" || r.status === "on-time").length,
        late: docs.filter((r) => r.status === "late" || r.status === "extreme-late").length,
        halfDay: docs.filter((r) => r.status === "half_day").length,
        missingCheckout: docs.filter((r) => !r.checkOutTime && r.date < todayStr).length,
      };
    }

    case "get_late_comers": {
      const q = isPrivileged
        ? query(collection(db, "attendance"), where("month", "==", currentMonth))
        : query(
            collection(db, "attendance"),
            where("uid", "==", actor.uid),
            where("month", "==", currentMonth)
          );
      const snap = await getDocs(q);
      const counts = {};
      snap.docs.forEach((d) => {
        const r = d.data();
        if (r.status === "late" || r.status === "extreme-late") {
          if (!counts[r.uid]) {
            counts[r.uid] = { name: r.name || "Employee", lateCount: 0, lateMinutes: 0 };
          }
          counts[r.uid].lateCount += 1;
          counts[r.uid].lateMinutes += Number(r.lateMinutes) || 0;
        }
      });
      return Object.values(counts)
        .sort((a, b) => b.lateCount - a.lateCount)
        .slice(0, 5);
    }

    case "get_leave_summary": {
      const q = isPrivileged
        ? collection(db, "leaveRequests")
        : query(collection(db, "leaveRequests"), where("uid", "==", actor.uid));
      const snap = await getDocs(q);
      const docs = snap.docs.map((d) => d.data());
      return {
        scope: isPrivileged ? "company" : "self",
        totalRequests: docs.length,
        pending: docs.filter((l) => l.status === "pending").length,
        approved: docs.filter((l) => l.status === "approved").length,
        rejected: docs.filter((l) => l.status === "rejected").length,
      };
    }

    case "get_my_leave_balance": {
      const snap = await getDocs(
        query(collection(db, "leaveRequests"), where("uid", "==", actor.uid))
      );
      const docs = snap.docs.map((d) => d.data());
      return computeLeaveBalances(docs);
    }

    case "get_payroll_summary": {
      const q = isPrivileged
        ? query(collection(db, "payrolls"), where("month", "==", args.month || currentMonth))
        : query(
            collection(db, "payrolls"),
            where("uid", "==", actor.uid),
            where("month", "==", args.month || currentMonth)
          );
      const snap = await getDocs(q);
      const docs = snap.docs.map((d) => d.data());
      const totalNet = docs.reduce((s, r) => s + (Number(r.netSalary) || 0), 0);
      const totalGross = docs.reduce((s, r) => s + (Number(r.grossSalary) || 0), 0);
      const totalTax = docs.reduce((s, r) => s + (Number(r.taxDeduction) || 0), 0);
      return {
        scope: isPrivileged ? "company" : "self",
        month: args.month || currentMonth,
        slipsCount: docs.length,
        totalGross,
        totalTax,
        totalNet,
      };
    }

    case "search_employees": {
      if (!isPrivileged) {
        return [{ name: actor.name, email: actor.email, department: actor.department, role: actor.role }];
      }
      const snap = await getDocs(collection(db, "users"));
      const term = String(args.query || "").toLowerCase();
      return snap.docs
        .map((d) => d.data())
        .filter(
          (u) =>
            !term ||
            (u.name || "").toLowerCase().includes(term) ||
            (u.department || "").toLowerCase().includes(term) ||
            (u.designation || "").toLowerCase().includes(term)
        )
        .slice(0, 10)
        .map((u) => ({
          name: u.name,
          email: u.email,
          role: u.role,
          department: u.department || "General",
          designation: u.designation || "Staff",
        }));
    }

    default:
      return {};
  }
}

async function checkAndLogAiRateLimit(actor, mode, prompt, reply, toolsUsed = []) {
  const logsSnap = await getDocs(
    query(collection(db, "ai_logs"), where("uid", "==", actor.uid))
  );
  const oneHourAgo = Date.now() - 3600 * 1000;
  const recentCount = logsSnap.docs.filter((d) => {
    const dt = parseDateValue(d.data().createdAt);
    return dt && dt.getTime() >= oneHourAgo;
  }).length;

  if (recentCount >= 20) {
    throw new HttpError(
      429,
      "Rate limit reached: Maximum 20 AI requests per hour allowed."
    );
  }

  await addDoc(collection(db, "ai_logs"), {
    uid: actor.uid,
    userName: actor.name,
    role: actor.role,
    mode,
    toolsUsed,
    prompt: String(prompt || "").slice(0, 500),
    reply: String(reply || "").slice(0, 1500),
    aiGenerated: true,
    createdAt: serverTimestamp(),
  });
}

export async function askHrAiAssistant({ message, mode = "chat", dashboardData = null }) {
  const actor = await getCurrentUserContext();
  const text = String(message || "").trim();

  // Gather authoritative tool data based on intent
  const lower = text.toLowerCase();
  const toolsUsed = [];
  const toolResults = {};

  if (mode === "chat") {
    if (lower.includes("headcount") || lower.includes("kitne employee") || lower.includes("total employee") || lower.includes("staff")) {
      toolsUsed.push("get_headcount");
      toolResults.headcount = await executeAiTool("get_headcount", {}, actor);
    }
    if (lower.includes("late") || lower.includes("der") || lower.includes("punctual")) {
      toolsUsed.push("get_late_comers");
      toolResults.lateComers = await executeAiTool("get_late_comers", {}, actor);
    }
    if (lower.includes("attendance") || lower.includes("present") || lower.includes("hazri") || lower.includes("absent")) {
      toolsUsed.push("get_attendance_summary");
      toolResults.attendanceSummary = await executeAiTool("get_attendance_summary", {}, actor);
    }
    if (lower.includes("balance") || lower.includes("meri chutti") || lower.includes("my leave") || lower.includes("quota")) {
      toolsUsed.push("get_my_leave_balance");
      toolResults.myLeaveBalance = await executeAiTool("get_my_leave_balance", {}, actor);
    }
    if (lower.includes("leave") || lower.includes("chutti") || lower.includes("off")) {
      toolsUsed.push("get_leave_summary");
      toolResults.leaveSummary = await executeAiTool("get_leave_summary", {}, actor);
    }
    if (lower.includes("payroll") || lower.includes("salary") || lower.includes("tankhwah") || lower.includes("tax") || lower.includes("payslip")) {
      toolsUsed.push("get_payroll_summary");
      toolResults.payrollSummary = await executeAiTool("get_payroll_summary", {}, actor);
    }
    if (lower.includes("search") || lower.includes("find") || lower.includes("kon") || lower.includes("department") || lower.includes("who")) {
      toolsUsed.push("search_employees");
      toolResults.employees = await executeAiTool("search_employees", { query: "" }, actor);
    }
    if (toolsUsed.length === 0) {
      toolsUsed.push("get_my_leave_balance", "get_attendance_summary");
      toolResults.myLeaveBalance = await executeAiTool("get_my_leave_balance", {}, actor);
      toolResults.attendanceSummary = await executeAiTool("get_attendance_summary", {}, actor);
      if (["admin", "hr"].includes(actor.role)) {
        toolsUsed.push("get_headcount");
        toolResults.headcount = await executeAiTool("get_headcount", {}, actor);
      }
    }
  }

  // Try calling /api/ai-chat first
  try {
    const token = await auth.currentUser.getIdToken();
    const res = await fetch("/api/ai-chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        mode,
        prompt: text,
        contextData: mode === "summarize" ? dashboardData : toolResults,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.ok && json.reply) {
        return {
          reply: json.reply,
          toolsUsed,
          aiGenerated: true,
          label: "AI-generated",
        };
      }
    }
  } catch (_) {
    // Fallback to client-side Gemini or deterministic synthesis below
  }

  // Fallback intelligent synthesis (works even without server env or offline, and uses exact tool numbers)
  let reply = "";
  if (mode === "summarize" && dashboardData) {
    const k = dashboardData.kpis || {};
    const p = dashboardData.employeePersonal || {};
    const topLate = dashboardData.topLateComers?.[0];
    if (["admin", "hr"].includes(actor.role)) {
      reply = [
        `• **Workforce Overview**: Total active headcount is **${k.headcount ?? 0}** employee(s), with **${k.presentToday ?? 0}** checked in today and **${k.onLeaveToday ?? 0}** on approved leave.`,
        `• **Punctuality Alert**: **${k.lateToday ?? 0}** employee(s) arrived past the 09:15 AM grace window today${topLate ? `; top late-comer in this period is **${topLate.name}** (${topLate.lateCount} late arrivals, ${topLate.totalLateMinutes} mins)` : ""}.`,
        `• **Pending Actions**: There are **${k.pendingApprovals ?? 0}** pending HR approval item(s) (**${k.pendingLeaves ?? 0}** leave requests and **${k.pendingCorrections ?? 0}** attendance corrections).`,
        `• **Absenteeism**: **${k.absentToday ?? 0}** scheduled employee(s) have not checked in yet today.`,
      ].join("\n");
    } else {
      const ann = p.leaveBalances?.annual?.remaining ?? 14;
      const sick = p.leaveBalances?.sick?.remaining ?? 8;
      const cas = p.leaveBalances?.casual?.remaining ?? 10;
      reply = [
        `• **Weekly Hours**: You have logged **${p.hoursThisWeek ?? 0}h** out of your **${p.weeklyTargetHours ?? 40}h** weekly target.`,
        `• **Today's Attendance**: Status is **${p.todayRecord ? p.todayRecord.status.toUpperCase() : "Not Checked In"}**.`,
        `• **Leave Balances**: **${ann}** Annual, **${sick}** Sick, and **${cas}** Casual leave days remaining this year.`,
        `• **Latest Payslip (${p.latestPayslip?.month || getLocalMonthStr()})**: Net pay is **Rs. ${Number(p.latestPayslip?.netSalary || 0).toLocaleString()}** (Gross: Rs. ${Number(p.latestPayslip?.grossSalary || 0).toLocaleString()}).`,
      ].join("\n");
    }
  } else {
    const parts = [];
    if (
      lower.includes("policy") ||
      lower.includes("rule") ||
      lower.includes("grace") ||
      lower.includes("qanoon") ||
      lower.includes("timing")
    ) {
      parts.push(
        `**Company HR & Payroll Policy**:\n• **Office Hours**: 09:00 AM – 06:00 PM (Grace: 15 mins → Late after 09:15 AM, Half-day < 5 hours).\n• **Leave Quotas**: Annual: 14, Sick: 8, Casual: 10, Unpaid: Unlimited (Weekends & Public Holidays skipped).\n• **Payroll Formula**: Gross = 1.5 × Basic. Deductions apply for Absent, Unpaid Leave, Half-Day (0.5d), and Late Penalty (3 lates = 0.5d) + FBR Progressive Income Tax.`
      );
    }
    if (toolResults.headcount) {
      parts.push(
        `**Headcount (` +
          `get_headcount` +
          `)**: Total employees = **${toolResults.headcount.totalHeadcount ?? 1}**. Breakdown: ${JSON.stringify(
            toolResults.headcount.byDepartment || {}
          )}`
      );
    }
    if (toolResults.attendanceSummary) {
      const a = toolResults.attendanceSummary;
      parts.push(
        `**Attendance Summary (${a.month})**: Total check-ins: **${a.totalRecords}**, On-time: **${a.presentOnTime}**, Late: **${a.late}**, Half-days: **${a.halfDay}**, Missing check-outs: **${a.missingCheckout}**.`
      );
    }
    if (toolResults.lateComers) {
      const list = toolResults.lateComers;
      parts.push(
        list.length > 0
          ? `**Top Late-Comers**: ${list
              .map((l) => `${l.name} (${l.lateCount}x, ${l.lateMinutes}m)`)
              .join(", ")}.`
          : `**Top Late-Comers**: Zero late arrivals recorded in this scope!`
      );
    }
    if (toolResults.myLeaveBalance) {
      const b = toolResults.myLeaveBalance;
      parts.push(
        `**Your Leave Balance**: Annual: **${b.annual?.remaining}/${b.annual?.quota}**, Sick: **${b.sick?.remaining}/${b.sick?.quota}**, Casual: **${b.casual?.remaining}/${b.casual?.quota}**, Unpaid: **Unlimited** (Used: ${b.unpaid?.used || 0}).`
      );
    }
    if (toolResults.leaveSummary) {
      const ls = toolResults.leaveSummary;
      parts.push(
        `**Leave Requests (${ls.scope})**: Pending: **${ls.pending}**, Approved: **${ls.approved}**, Rejected: **${ls.rejected}**.`
      );
    }
    if (toolResults.payrollSummary) {
      const ps = toolResults.payrollSummary;
      parts.push(
        `**Payroll Summary (${ps.month})**: Slips: **${ps.slipsCount}**, Total Gross: **Rs. ${ps.totalGross.toLocaleString()}**, Tax: **Rs. ${ps.totalTax.toLocaleString()}**, Total Net: **Rs. ${ps.totalNet.toLocaleString()}**.`
      );
    }
    if (toolResults.employees) {
      parts.push(
        `**Employees Found (${toolResults.employees.length})**: ${toolResults.employees
          .map((e) => `${e.name} (${e.role} - ${e.department})`)
          .join(", ")}.`
      );
    }
    reply =
      parts.join("\n\n") ||
      "Main aapki Attendance, Leave Balance, Payroll, aur Company Policies mein madad kar sakta hoon. Aap English ya Roman Urdu mein pooch sakte hain!";
  }

  await checkAndLogAiRateLimit(actor, mode, text, reply, toolsUsed);

  return {
    reply,
    toolsUsed,
    aiGenerated: true,
    label: "AI-generated",
  };
}

/**
 * Smart Leave Natural Language / Roman Urdu Parser (P3 #19)
 * Example: "agle Monday Tuesday off chahiye, shaadi hai" ->
 * { leaveType: "casual", startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD", reason: "..." }
 */
export async function parseSmartLeavePrompt(promptText) {
  const actor = await getCurrentUserContext();
  const text = String(promptText || "").trim();
  if (!text) {
    throw new HttpError(422, "Please enter a natural language leave description.");
  }

  const lower = text.toLowerCase();

  // Detect leave type from English + Roman Urdu keywords
  let leaveType = "casual";
  if (
    lower.includes("sick") ||
    lower.includes("bukhar") ||
    lower.includes("bimar") ||
    lower.includes("tabiyat") ||
    lower.includes("doctor") ||
    lower.includes("hospital") ||
    lower.includes("medical") ||
    lower.includes("flu")
  ) {
    leaveType = "sick";
  } else if (
    lower.includes("annual") ||
    lower.includes("vacation") ||
    lower.includes("trip") ||
    lower.includes("holiday") ||
    lower.includes("family tour")
  ) {
    leaveType = "annual";
  } else if (lower.includes("unpaid") || lower.includes("without pay")) {
    leaveType = "unpaid";
  }

  // Parse dates from weekday names, "kal" (tomorrow), "parso", or explicit YYYY-MM-DD
  const today = new Date();
  let start = new Date(today);
  start.setDate(today.getDate() + 1);
  let end = new Date(start);

  const isoMatches = text.match(/\b(\d{4}-\d{2}-\d{2})\b/g);
  if (isoMatches && isoMatches.length >= 1) {
    start = new Date(isoMatches[0] + "T00:00:00");
    end = new Date((isoMatches[1] || isoMatches[0]) + "T00:00:00");
  } else {
    const dayMap = {
      monday: 1,
      pir: 1,
      tuesday: 2,
      mangal: 2,
      wednesday: 3,
      budh: 3,
      thursday: 4,
      jumerat: 4,
      friday: 5,
      juma: 5,
    };

    const matchedDays = [];
    Object.entries(dayMap).forEach(([word, dow]) => {
      if (lower.includes(word)) matchedDays.push(dow);
    });

    if (matchedDays.length > 0) {
      const firstDow = matchedDays[0];
      const currentDow = today.getDay();
      let daysAhead = (firstDow - currentDow + 7) % 7;
      if (daysAhead === 0 || lower.includes("agle") || lower.includes("next")) {
        if (daysAhead === 0) daysAhead = 7;
      }
      start = new Date(today);
      start.setDate(today.getDate() + daysAhead);

      if (matchedDays.length > 1) {
        const span = Math.max(0, matchedDays[matchedDays.length - 1] - firstDow);
        end = new Date(start);
        end.setDate(start.getDate() + span);
      } else {
        end = new Date(start);
      }
    } else if (lower.includes("parso")) {
      start = new Date(today);
      start.setDate(today.getDate() + 2);
      end = new Date(start);
    } else if (lower.includes("kal") || lower.includes("tomorrow")) {
      start = new Date(today);
      start.setDate(today.getDate() + 1);
      end = new Date(start);
    }

    // Check if user mentioned "2 days", "3 din", "do din", "teen din"
    const numDaysMatch = lower.match(/(\d+)\s*(day|days|din)/);
    if (numDaysMatch) {
      const extra = Math.max(1, Number(numDaysMatch[1])) - 1;
      end = new Date(start);
      end.setDate(start.getDate() + extra);
    } else if (lower.includes("do din")) {
      end = new Date(start);
      end.setDate(start.getDate() + 1);
    } else if (lower.includes("teen din")) {
      end = new Date(start);
      end.setDate(start.getDate() + 2);
    }
  }

  const parsed = {
    leaveType,
    startDate: getLocalDateStr(start),
    endDate: getLocalDateStr(end),
    reason: text,
    aiGenerated: true,
    label: "AI-generated",
  };

  await checkAndLogAiRateLimit(
    actor,
    "smart_leave",
    text,
    JSON.stringify(parsed),
    ["smart_leave_parser"]
  );

  return parsed;
}
