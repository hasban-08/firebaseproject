const { getAdminServices, verifyRequestUser, writeAuditLog } = require("./_lib/firebaseAdmin");

module.exports = async function handler(req, res) {
  const services = getAdminServices();
  if (!services) {
    return res.status(503).json({ error: "ADMIN_SDK_NOT_CONFIGURED", fallback: true });
  }
  const { db, auth, FieldValue } = services;

  if (req.method === "GET") {
    const snap = await db.collection("settings").doc("company").get();
    return res.status(200).json({ initialized: snap.exists, settings: snap.exists ? snap.data() : null });
  }

  if (req.method === "POST") {
    const snap = await db.collection("settings").doc("company").get();
    if (snap.exists) {
      return res.status(409).json({ error: "Company setup is already completed." });
    }

    const {
      companyName = "WorkPulse Technologies",
      adminName = "System Admin",
      adminEmail,
      adminPassword,
      officeStartTime = "09:00",
      officeEndTime = "18:00",
      graceMinutes = 15,
    } = req.body || {};

    if (!adminEmail || !adminPassword || adminPassword.length < 6) {
      return res.status(422).json({ error: "Valid admin email and password (min 6 chars) are required." });
    }

    const userRecord = await auth.createUser({
      email: adminEmail.trim(),
      password: adminPassword,
      displayName: adminName.trim(),
    });

    const settingsDoc = {
      companyName: companyName.trim(),
      officeStartTime,
      officeEndTime,
      graceMinutes: Number(graceMinutes) || 15,
      halfDayThresholdHours: 5,
      weekendDays: ["sat", "sun"],
      latePenaltyEnabled: true,
      latesPerHalfDay: 3,
      officeLocation: {
        lat: 24.8607,
        lng: 67.0011,
        radiusMeters: 500,
        enforceLocation: false,
      },
      createdAt: FieldValue.serverTimestamp(),
      createdBy: userRecord.uid,
    };

    await db.collection("settings").doc("company").set(settingsDoc);
    await db.collection("users").doc(userRecord.uid).set({
      name: adminName.trim(),
      email: adminEmail.trim(),
      role: "admin",
      department: "Management",
      designation: "System Administrator",
      salary: 0,
      basicSalary: 0,
      active: true,
      mustChangePassword: false,
      profileComplete: true,
      personalInfo: {
        fullName: adminName.trim(),
        phone: "0300-0000000",
        address: "Head Office",
      },
      emergencyContact: {
        name: "Office Desk",
        relation: "Other",
        phone: "0300-1111111",
      },
      createdAt: FieldValue.serverTimestamp(),
    });

    await writeAuditLog(db, FieldValue, {
      actorUid: userRecord.uid,
      actorName: adminName.trim(),
      actorRole: "admin",
      action: "FIRST_RUN_SETUP",
      entity: "settings",
      entityId: "company",
      before: null,
      after: { companyName: settingsDoc.companyName, adminEmail },
    });

    return res.status(200).json({ ok: true, uid: userRecord.uid });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
