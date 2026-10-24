const { verifyRequestUser, writeAuditLog } = require("./_lib/firebaseAdmin");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { services, user, error, status } = await verifyRequestUser(req);
  if (error === "ADMIN_SDK_NOT_CONFIGURED") {
    return res.status(503).json({ error: "ADMIN_SDK_NOT_CONFIGURED", fallback: true });
  }
  if (error || !user) {
    return res.status(status || 401).json({ error: error || "Unauthorized" });
  }

  if (!["admin", "hr"].includes(user.role)) {
    return res.status(403).json({ error: "Forbidden: Only Admin or HR can manage employees." });
  }

  const { db, auth, FieldValue } = services;
  const body = req.body || {};
  const action = body.action || "create";

  try {
    if (action === "create") {
      const {
        name,
        email,
        tempPassword,
        role = "employee",
        department = "Engineering",
        designation = "Software Engineer",
        basicSalary = 50000,
        cnic = "",
        bankDetails = {},
      } = body;

      if (role === "admin" && user.role !== "admin") {
        return res.status(403).json({ error: "Only Admin can create Admin or HR accounts." });
      }
      if (role === "hr" && user.role !== "admin") {
        return res.status(403).json({ error: "Only Admin can create HR accounts." });
      }

      if (!name || !email || !tempPassword || tempPassword.length < 6) {
        return res.status(422).json({ error: "Name, email, and temporary password (min 6 chars) are required." });
      }

      const authUser = await auth.createUser({
        email: email.trim(),
        password: tempPassword,
        displayName: name.trim(),
      });

      const basic = Math.max(0, Number(basicSalary) || 0);
      const userDoc = {
        name: name.trim(),
        email: email.trim(),
        role,
        department,
        designation,
        basicSalary: basic,
        salary: basic,
        grossSalary: Math.round(basic * 1.5),
        active: true,
        mustChangePassword: true,
        profileComplete: false,
        personalInfo: {
          fullName: name.trim(),
          cnic: cnic || "",
          phone: "",
          address: "",
          dob: "",
        },
        bankDetails: {
          method: bankDetails.method || "bank",
          providerName: bankDetails.providerName || "",
          accountTitle: bankDetails.accountTitle || name.trim(),
          accountNumber: bankDetails.accountNumber || "",
          iban: bankDetails.iban || "",
        },
        emergencyContact: {
          name: "",
          relation: "",
          phone: "",
        },
        createdBy: user.uid,
        createdAt: FieldValue.serverTimestamp(),
      };

      await db.collection("users").doc(authUser.uid).set(userDoc);
      await writeAuditLog(db, FieldValue, {
        actorUid: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: "USER_CREATED",
        entity: "users",
        entityId: authUser.uid,
        before: null,
        after: { name: userDoc.name, email: userDoc.email, role, department, basicSalary: basic },
      });

      return res.status(200).json({ ok: true, uid: authUser.uid });
    }

    if (action === "toggle_status") {
      if (user.role !== "admin") {
        return res.status(403).json({ error: "Only Admin can activate/deactivate accounts." });
      }
      const { targetUid, active } = body;
      await auth.updateUser(targetUid, { disabled: !active });
      await db.collection("users").doc(targetUid).update({
        active: !!active,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await writeAuditLog(db, FieldValue, {
        actorUid: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: active ? "USER_ACTIVATED" : "USER_DEACTIVATED",
        entity: "users",
        entityId: targetUid,
        before: { active: !active },
        after: { active: !!active },
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unsupported user action" });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
};
