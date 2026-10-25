export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const WEEKDAY_LABELS = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

// Brief-compliant defaults (09:00 start, 15m grace -> late after 09:15, half_day < 5h)
export const DEFAULT_COMPANY_SETTINGS = {
  companyName: "WorkPulse Technologies",
  officeStartTime: "09:00",
  officeEndTime: "18:00",
  graceMinutes: 15,
  halfDayThresholdHours: 5,
  weekendDays: ["sat", "sun"],
  latePenaltyEnabled: true, // Bonus: 3 lates = 0.5 day deduction
  latesPerHalfDay: 3,
  officeLocation: {
    lat: 24.8607,
    lng: 67.0011,
    radiusMeters: 500,
    enforceLocation: false,
  },
};

export const DEFAULT_LEAVE_QUOTAS = {
  annual: { key: "annual", label: "Annual Leave", quota: 14, paid: true },
  sick: { key: "sick", label: "Sick Leave", quota: 8, paid: true },
  casual: { key: "casual", label: "Casual Leave", quota: 10, paid: true },
  unpaid: { key: "unpaid", label: "Unpaid Leave", quota: null, paid: false }, // unlimited
};

export const GRACE_MINUTES = 15;
export const HALF_DAY_MIN_HOURS = 5;
export const LATES_PER_HALF_DAY = 3; // 3 lates = 0.5 day penalty

const MAX_LEAVE_RANGE_DAYS = 366;

export function getWeekdayKey(date = new Date()) {
  return WEEKDAY_KEYS[date.getDay()];
}

export function getLocalDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getLocalMonthStr(date = new Date()) {
  return getLocalDateStr(date).slice(0, 7);
}

export function parseDateValue(val) {
  if (!val) return null;
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
  if (typeof val?.toDate === "function") return val.toDate();
  if (typeof val?.seconds === "number") return new Date(val.seconds * 1000);
  const parsed = new Date(val);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatTime12(date) {
  const parsedDate = parseDateValue(date);
  if (!parsedDate) return "-";
  return parsedDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function buildDefaultSchedule(companySettings = DEFAULT_COMPANY_SETTINGS) {
  const start = companySettings?.officeStartTime || "09:00";
  const weekends = new Set(companySettings?.weekendDays || ["sat", "sun"]);
  const sched = {};
  for (const key of WEEKDAY_KEYS) {
    sched[key] = weekends.has(key) ? "" : start;
  }
  return sched;
}

/**
 * Brief Attendance Status Calculation:
 * - Checked in <= expectedTime + graceMinutes (default 09:15) -> "present"
 * - Checked in > expectedTime + graceMinutes -> "late"
 * - On check-out: if workedHours < 5 -> "half_day"
 */
export function calculateAttendanceStatus(
  schedule,
  checkInDate = new Date(),
  companySettings = DEFAULT_COMPANY_SETTINGS
) {
  const parsedCheckIn = parseDateValue(checkInDate) || new Date();
  const weekdayKey = getWeekdayKey(parsedCheckIn);
  const effectiveSchedule = schedule || buildDefaultSchedule(companySettings);
  const expectedTime =
    effectiveSchedule?.[weekdayKey] || companySettings?.officeStartTime || "09:00";

  if (!expectedTime || !/^\d{1,2}:\d{2}$/.test(expectedTime)) {
    return {
      status: "present",
      lateMinutes: 0,
      weekdayKey,
    };
  }

  const [expH, expM] = expectedTime.split(":").map(Number);
  const expectedDate = new Date(parsedCheckIn);
  expectedDate.setHours(expH, expM, 0, 0);

  const graceMins =
    typeof companySettings?.graceMinutes === "number"
      ? companySettings.graceMinutes
      : GRACE_MINUTES;

  const graceDate = new Date(expectedDate.getTime() + graceMins * 60000);

  if (parsedCheckIn <= graceDate) {
    return {
      status: "present",
      lateMinutes: 0,
      weekdayKey,
    };
  }

  const lateMinutes = Math.max(
    1,
    Math.round((parsedCheckIn.getTime() - graceDate.getTime()) / 60000)
  );

  return {
    status: "late",
    lateMinutes,
    weekdayKey,
  };
}

export function evaluateCheckoutStatus({
  checkInTime,
  checkOutTime = new Date(),
  initialStatus = "present",
  halfDayThresholdHours = HALF_DAY_MIN_HOURS,
}) {
  const inDate = parseDateValue(checkInTime);
  const outDate = parseDateValue(checkOutTime) || new Date();
  if (!inDate) {
    return { workedHours: 0, status: initialStatus };
  }
  const diffMs = Math.max(0, outDate.getTime() - inDate.getTime());
  const workedHours = Number((diffMs / (1000 * 60 * 60)).toFixed(2));
  const status =
    workedHours < halfDayThresholdHours
      ? "half_day"
      : initialStatus === "on-time"
      ? "present"
      : initialStatus;
  return { workedHours, status };
}

export function statusLabel(record) {
  if (!record) return "Absent";
  const st = record.status;
  if (st === "half_day") {
    return `Half Day (${record.workedHours ?? 0}h)`;
  }
  if (st === "missing_checkout") {
    return "Missing Checkout";
  }
  if (st === "late" || st === "extreme-late") {
    return `Late (${record.lateMinutes ?? 0} min)`;
  }
  if (st === "absent") {
    return "Absent";
  }
  if (st === "on_leave" || st === "leave") {
    return "On Leave";
  }
  return "Present";
}

/**
 * Haversine distance in meters between two GPS coordinates
 */
export function calculateHaversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function isValidDateString(value) {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseLocalDate(value);
  return getLocalDateStr(date) === value;
}

export function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Counts working days between startDate and endDate (inclusive),
 * skipping weekendDays and publicHolidays (array of YYYY-MM-DD strings or objects with .date)
 */
export function calculateWorkingDaysBetween(
  startDateStr,
  endDateStr,
  weekendDays = ["sat", "sun"],
  publicHolidays = []
) {
  if (!isValidDateString(startDateStr) || !isValidDateString(endDateStr)) {
    return { count: 0, dates: [] };
  }
  if (endDateStr < startDateStr) {
    return { count: 0, dates: [] };
  }

  const weekendSet = new Set(weekendDays || ["sat", "sun"]);
  const holidaySet = new Set(
    (publicHolidays || []).map((h) => (typeof h === "string" ? h : h?.date)).filter(Boolean)
  );

  const cursor = parseLocalDate(startDateStr);
  const end = parseLocalDate(endDateStr);
  const dates = [];
  let guard = 0;

  while (cursor <= end && guard < MAX_LEAVE_RANGE_DAYS) {
    const dStr = getLocalDateStr(cursor);
    const dayKey = getWeekdayKey(cursor);
    if (!weekendSet.has(dayKey) && !holidaySet.has(dStr)) {
      dates.push(dStr);
    }
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }

  return { count: dates.length, dates };
}

/**
 * Checks if [startDateStr, endDateStr] overlaps with any existing pending or approved leave
 */
export function hasLeaveOverlap(startDateStr, endDateStr, existingLeaves = [], excludeId = null) {
  if (!startDateStr || !endDateStr) return null;
  for (const leave of existingLeaves) {
    if (excludeId && leave.id === excludeId) continue;
    if (!["pending", "approved"].includes(leave.status)) continue;
    if (leave.type === "earlyLeave") continue;
    const exStart = leave.startDate || leave.date;
    const exEnd = leave.endDate || leave.date;
    if (!exStart || !exEnd) continue;
    if (startDateStr <= exEnd && endDateStr >= exStart) {
      return leave;
    }
  }
  return null;
}

/**
 * Computes leave balances per leave type for a user in a given year
 */
export function computeLeaveBalances(
  leaves = [],
  year = new Date().getFullYear(),
  customLeaveTypes = null,
  weekendDays = ["sat", "sun"],
  publicHolidays = []
) {
  const yearPrefix = `${year}-`;
  const quotas = customLeaveTypes || DEFAULT_LEAVE_QUOTAS;
  const balances = {};

  Object.values(quotas).forEach((lt) => {
    balances[lt.key] = {
      key: lt.key,
      label: lt.label,
      quota: lt.quota,
      used: 0,
      pending: 0,
      remaining: lt.quota === null ? Infinity : lt.quota,
      paid: lt.paid !== false,
    };
  });

  for (const leave of leaves) {
    if (leave.type === "earlyLeave") continue;
    if (!["approved", "pending"].includes(leave.status)) continue;
    const start = leave.startDate || leave.date || "";
    if (!start.startsWith(yearPrefix)) continue;

    const leaveCategory = leave.leaveType || "annual";
    if (!balances[leaveCategory]) {
      balances[leaveCategory] = {
        key: leaveCategory,
        label: leaveCategory,
        quota: 10,
        used: 0,
        pending: 0,
        remaining: 10,
        paid: leaveCategory !== "unpaid",
      };
    }

    const days =
      typeof leave.workingDays === "number"
        ? leave.workingDays
        : calculateWorkingDaysBetween(
            leave.startDate || leave.date,
            leave.endDate || leave.date,
            weekendDays,
            publicHolidays
          ).count;

    if (leave.status === "approved") {
      balances[leaveCategory].used += days;
    } else if (leave.status === "pending") {
      balances[leaveCategory].pending += days;
    }
  }

  Object.values(balances).forEach((b) => {
    b.remaining = b.quota === null ? null : Math.max(0, b.quota - b.used);
  });

  return balances;
}

export function countWorkingDaysSoFar(
  schedule,
  referenceDate = new Date(),
  publicHolidays = []
) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const todayDate = referenceDate.getDate();
  const effectiveSchedule = schedule || buildDefaultSchedule();
  const holidaySet = new Set(
    (publicHolidays || []).map((h) => (typeof h === "string" ? h : h?.date)).filter(Boolean)
  );

  let count = 0;
  for (let day = 1; day <= todayDate; day += 1) {
    const date = new Date(year, month, day);
    const dStr = getLocalDateStr(date);
    if (effectiveSchedule?.[getWeekdayKey(date)] && !holidaySet.has(dStr)) {
      count += 1;
    }
  }
  return count;
}

export function countWorkingDaysInMonth(
  schedule,
  monthStr = getLocalMonthStr(),
  publicHolidays = []
) {
  const [year, month] = monthStr.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const effectiveSchedule = schedule || buildDefaultSchedule();
  const holidaySet = new Set(
    (publicHolidays || []).map((h) => (typeof h === "string" ? h : h?.date)).filter(Boolean)
  );

  let count = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month - 1, day);
    const dStr = getLocalDateStr(date);
    if (effectiveSchedule?.[getWeekdayKey(date)] && !holidaySet.has(dStr)) {
      count += 1;
    }
  }
  return count;
}

export function getApprovedLeaveDates(
  schedule,
  approvedLeaves = [],
  publicHolidays = []
) {
  const leaveDates = new Set();
  const effectiveSchedule = schedule || buildDefaultSchedule();
  const holidaySet = new Set(
    (publicHolidays || []).map((h) => (typeof h === "string" ? h : h?.date)).filter(Boolean)
  );

  for (const leave of approvedLeaves) {
    if (leave?.status !== "approved") continue;
    if (String(leave?.type || "").toLowerCase() === "earlyleave") continue;

    if (Array.isArray(leave.dates) && leave.dates.length > 0) {
      for (const dateString of leave.dates) {
        if (!isValidDateString(dateString)) continue;
        const date = parseLocalDate(dateString);
        if (effectiveSchedule?.[getWeekdayKey(date)] && !holidaySet.has(dateString)) {
          leaveDates.add(dateString);
        }
      }
      continue;
    }

    const startStr = leave.startDate || leave.date;
    const endStr = leave.endDate || leave.date;
    if (!startStr || !endStr) continue;
    if (!isValidDateString(startStr) || !isValidDateString(endStr)) continue;
    if (endStr < startStr) continue;

    const cursor = parseLocalDate(startStr);
    const endDate = parseLocalDate(endStr);
    let guard = 0;

    while (cursor <= endDate && guard < MAX_LEAVE_RANGE_DAYS) {
      const dStr = getLocalDateStr(cursor);
      if (effectiveSchedule?.[getWeekdayKey(cursor)] && !holidaySet.has(dStr)) {
        leaveDates.add(dStr);
      }
      cursor.setDate(cursor.getDate() + 1);
      guard += 1;
    }
  }

  return leaveDates;
}

export function getApprovedUnpaidLeaveDates(
  schedule,
  approvedLeaves = [],
  publicHolidays = []
) {
  const unpaidLeaves = (approvedLeaves || []).filter(
    (l) => l?.status === "approved" && l?.leaveType === "unpaid"
  );
  return getApprovedLeaveDates(schedule, unpaidLeaves, publicHolidays);
}

export function getApprovedEarlyLeaveDates(schedule, approvedLeaves = []) {
  const earlyDates = new Set();
  const effectiveSchedule = schedule || buildDefaultSchedule();

  for (const leave of approvedLeaves) {
    if (leave?.status !== "approved") continue;
    if (String(leave?.type || "").toLowerCase() !== "earlyleave") continue;

    if (leave.date && isValidDateString(leave.date)) {
      const d = parseLocalDate(leave.date);
      if (effectiveSchedule?.[getWeekdayKey(d)]) {
        earlyDates.add(getLocalDateStr(d));
      }
    }
  }
  return earlyDates;
}

function getReferenceDateForMonth(monthStr) {
  const currentMonth = getLocalMonthStr();
  if (monthStr === currentMonth) return new Date();
  if (monthStr > currentMonth) return null;
  const [year, month] = monthStr.split("-").map(Number);
  return new Date(year, month, 0);
}

function getScheduledDatesUpTo(
  schedule,
  monthStr,
  referenceDate,
  publicHolidays = []
) {
  if (!referenceDate) return [];
  const [year, month] = monthStr.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const referenceStr = getLocalDateStr(referenceDate);
  const effectiveSchedule = schedule || buildDefaultSchedule();
  const holidaySet = new Set(
    (publicHolidays || []).map((h) => (typeof h === "string" ? h : h?.date)).filter(Boolean)
  );

  const dates = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month - 1, day);
    const dateStr = getLocalDateStr(date);
    if (dateStr > referenceStr) break;
    if (effectiveSchedule?.[getWeekdayKey(date)] && !holidaySet.has(dateStr)) {
      dates.push(dateStr);
    }
  }
  return dates;
}

/**
 * Progressive Monthly Income Tax Calculation (Pakistan FBR Slabs)
 * - Annual <= 600,000: 0
 * - 600,001 - 1,200,000: 5% of excess over 600,000
 * - 1,200,001 - 2,200,000: 30,000 + 15% of excess over 1,200,000
 * - 2,200,001 - 3,200,000: 180,000 + 25% of excess over 2,200,000
 * - > 3,200,000: 430,000 + 30% of excess over 3,200,000
 */
export function calculateMonthlyTax(monthlyGrossSalary = 0) {
  const annualGross = Math.max(0, Number(monthlyGrossSalary) || 0) * 12;
  let annualTax = 0;

  if (annualGross <= 600000) {
    annualTax = 0;
  } else if (annualGross <= 1200000) {
    annualTax = (annualGross - 600000) * 0.05;
  } else if (annualGross <= 2200000) {
    annualTax = 30000 + (annualGross - 1200000) * 0.15;
  } else if (annualGross <= 3200000) {
    annualTax = 180000 + (annualGross - 2200000) * 0.25;
  } else {
    annualTax = 430000 + (annualGross - 3200000) * 0.3;
  }

  return Math.round(annualTax / 12);
}

/**
 * Brief Payroll Formula:
 * - Basic Salary -> Allowances = 0.5 * Basic (HRA 30%, Medical 10%, Conveyance 10%)
 * - Gross Salary = 1.5 * Basic Salary
 * - Per-Day Rate = Gross Salary / Working Days in Month
 * - Deductions:
 *   - Absent days * Per-Day Rate
 *   - Unpaid leave days * Per-Day Rate
 *   - Half-days * 0.5 * Per-Day Rate
 *   - Late penalty (bonus): floor(lateCount / 3) * 0.5 * Per-Day Rate
 * - Income Tax: Progressive Slab
 * - Net Salary = Gross - Total Attendance Deductions - Income Tax
 */
export function calculateSalaryStats({
  records = [],
  schedule,
  baseSalary = 0,
  month = getLocalMonthStr(),
  approvedLeaves = [],
  publicHolidays = [],
  latePenaltyEnabled = true,
}) {
  const monthStr =
    typeof month === "string" && /^\d{4}-\d{2}$/.test(month)
      ? month
      : getLocalMonthStr();

  const basicSalary = Math.max(0, Number(baseSalary) || 0);
  const houseRentAllowance = Math.round(basicSalary * 0.3);
  const medicalAllowance = Math.round(basicSalary * 0.1);
  const conveyanceAllowance = Math.round(basicSalary * 0.1);
  const allowances = houseRentAllowance + medicalAllowance + conveyanceAllowance;
  const grossSalary = Math.round(basicSalary * 1.5);

  const effectiveSchedule = schedule || buildDefaultSchedule();
  const presentCount = records.length;

  const lateCount = records.filter(
    (r) => r.status === "late" || r.status === "extreme-late"
  ).length;

  const halfDayCount = records.filter((r) => r.status === "half_day").length;
  const missingCheckoutCount = records.filter(
    (r) => r.status === "missing_checkout"
  ).length;

  const scheduledDates = getScheduledDatesUpTo(
    effectiveSchedule,
    monthStr,
    getReferenceDateForMonth(monthStr),
    publicHolidays
  );

  const presentDates = new Set(records.map((r) => r.date).filter(Boolean));
  const approvedLeaveDates = getApprovedLeaveDates(
    effectiveSchedule,
    approvedLeaves,
    publicHolidays
  );
  const unpaidLeaveDates = getApprovedUnpaidLeaveDates(
    effectiveSchedule,
    approvedLeaves,
    publicHolidays
  );
  const approvedEarlyLeaveDates = getApprovedEarlyLeaveDates(
    effectiveSchedule,
    approvedLeaves
  );

  let absentCount = 0;
  let approvedLeaveCount = 0;
  let unpaidLeaveCount = 0;
  let earlyLeaveCount = 0;

  const todayStr = getLocalDateStr();

  for (const dateStr of scheduledDates) {
    if (presentDates.has(dateStr)) {
      if (approvedEarlyLeaveDates.has(dateStr)) {
        earlyLeaveCount += 1;
      }
      continue;
    }

    if (approvedLeaveDates.has(dateStr)) {
      approvedLeaveCount += 1;
      if (unpaidLeaveDates.has(dateStr)) {
        unpaidLeaveCount += 1;
      }
      continue;
    }

    // Do not count today as absent while the day is still in progress
    if (dateStr === todayStr) continue;

    absentCount += 1;
  }

  const workingDaysSoFar = scheduledDates.length;
  const workingDaysInMonth =
    countWorkingDaysInMonth(effectiveSchedule, monthStr, publicHolidays) || 22;

  const perDayRate = workingDaysInMonth > 0 ? grossSalary / workingDaysInMonth : 0;

  // Penalty days:
  // 1. Absent days (1.0 day each)
  // 2. Unpaid leave days (1.0 day each)
  // 3. Half days (0.5 day each)
  // 4. Bonus late penalty: 3 lates = 0.5 day
  const latePenaltyDays = latePenaltyEnabled
    ? Math.floor(lateCount / LATES_PER_HALF_DAY) * 0.5
    : 0;
  const halfDayPenaltyDays = halfDayCount * 0.5;
  const deductibleDays =
    absentCount + unpaidLeaveCount + halfDayPenaltyDays + latePenaltyDays;

  const attendanceDeduction = Math.round(deductibleDays * perDayRate);
  const taxDeduction = calculateMonthlyTax(grossSalary);
  const totalDeduction = attendanceDeduction + taxDeduction;
  const netSalary = Math.max(0, Math.round(grossSalary - totalDeduction));

  return {
    basicSalary,
    houseRentAllowance,
    medicalAllowance,
    conveyanceAllowance,
    allowances,
    grossSalary,
    presentCount,
    lateCount,
    extremeLateCount: 0,
    halfDayCount,
    missingCheckoutCount,
    absentCount,
    approvedLeaveCount,
    paidLeaveCount: Math.max(0, approvedLeaveCount - unpaidLeaveCount),
    unpaidLeaveCount,
    earlyLeaveCount,
    latePenaltyDays,
    halfDayPenaltyDays,
    offEquivalents: deductibleDays,
    deductibleOffs: deductibleDays,
    perDayRate: Math.round(perDayRate),
    attendanceDeduction,
    taxDeduction,
    deduction: totalDeduction,
    netSalary,
    workingDaysInMonth,
    workingDaysSoFar,
  };
}

export const digitsOnly = (s = "") => String(s).replace(/\D/g, "");

export function formatCnic(value) {
  const d = digitsOnly(value).slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

export function isValidCnic(value) {
  const d = digitsOnly(value);
  return d.length === 13 && d[0] !== "0";
}

export function normalizePkMobile(value) {
  let d = digitsOnly(value);
  if (d.startsWith("92") && d.length === 12) d = "0" + d.slice(2);
  if (!/^03\d{9}$/.test(d)) return null;
  return `${d.slice(0, 4)}-${d.slice(4)}`;
}

export function isValidIban(value) {
  const iban = String(value).replace(/\s+/g, "").toUpperCase();
  if (!/^PK\d{2}[A-Z]{4}[A-Z0-9]{16}$/.test(iban)) return false;

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));

  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }
  return remainder === 1;
}

export function isValidDob(value, minAge = 16) {
  if (!value) return false;
  const dob = new Date(value + "T00:00:00");
  if (Number.isNaN(dob.getTime())) return false;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;

  return age >= minAge && age <= 90;
}
