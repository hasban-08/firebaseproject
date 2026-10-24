const { verifyRequestUser, writeAuditLog } = require("./_lib/firebaseAdmin");

function calculateMonthlyTax(monthlyGross = 0) {
  const annual = Math.max(0, Number(monthlyGross) || 0) * 12;
  let tax = 0;
  if (annual <= 600000) tax = 0;
  else if (annual <= 1200000) tax = (annual - 600000) * 0.05;
  else if (annual <= 2200000) tax = 30000 + (annual - 1200000) * 0.15;
  else if (annual <= 3200000) tax = 180000 + (annual - 2200000) * 0.25;
  else tax = 430000 + (annual - 3200000) * 0.3;
  return Math.round(tax / 12);
}

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
    return res.status(403).json({ error: "Only Admin or HR can run payroll." });
  }

  const { db, FieldValue } = services;
  const { action = "generate_draft", month } = req.body || {};

  try {
    if (action === "finalize") {
      if (user.role !== "admin") {
        return res.status(403).json({ error: "Only Admin can finalize and lock monthly payroll." });
      }
      const snap = await db.collection("payrolls").where("month", "==", month).get();
      if (snap.empty) {
        return res.status(422).json({ error: "Generate draft payroll first before finalizing." });
      }

      const batch = db.batch();
      snap.docs.forEach((docSnap) => {
        batch.update(docSnap.ref, {
          status: "locked",
          finalizedBy: user.uid,
          finalizedAt: FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();

      await writeAuditLog(db, FieldValue, {
        actorUid: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: "PAYROLL_FINALIZED_LOCKED",
        entity: "payrolls",
        entityId: month,
        before: { status: "draft" },
        after: { status: "locked", count: snap.size },
      });

      return res.status(200).json({ ok: true, lockedCount: snap.size });
    }

    return res.status(200).json({ ok: true, fallback: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
};
