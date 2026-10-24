const { verifyRequestUser, writeAuditLog } = require("./_lib/firebaseAdmin");

const DEFAULT_QUOTAS = {
  annual: 14,
  sick: 8,
  casual: 10,
  unpaid: null,
};

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function countWorkingDays(startStr, endStr, weekendDays = ["sat", "sun"], holidays = []) {
  const [sy, sm, sd] = startStr.split("-").map(Number);
  const [ey, em, ed] = endStr.split("-").map(Number);
  const cursor = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const weekendSet = new Set(weekendDays);
  const holidaySet = new Set(holidays.map((h) => (typeof h === "string" ? h : h.date)));
  const dates = [];

  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    const dStr = `${y}-${m}-${d}`;
    const dayKey = WEEKDAY_KEYS[cursor.getDay()];
    if (!weekendSet.has(dayKey) && !holidaySet.has(dStr)) {
      dates.push(dStr);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return { count: dates.length, dates };
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

  const { db, FieldValue } = services;
  const body = req.body || {};
  const action = body.action || "apply";

  try {
    if (action === "apply") {
      const { leaveType = "annual", startDate, endDate, reason = "" } = body;
      if (!startDate || !endDate || endDate < startDate) {
        return res.status(422).json({ error: "Invalid startDate or endDate." });
      }
      if (!reason.trim()) {
        return res.status(422).json({ error: "Reason is required." });
      }

      const [settingsSnap, holidaysSnap, userLeavesSnap] = await Promise.all([
        db.collection("settings").doc("company").get(),
        db.collection("public_holidays").get(),
        db.collection("leaveRequests").where("uid", "==", user.uid).get(),
      ]);

      const settings = settingsSnap.exists ? settingsSnap.data() : {};
      const weekendDays = settings.weekendDays || ["sat", "sun"];
      const holidays = holidaysSnap.docs.map((d) => d.data());
      const existingLeaves = userLeavesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // 1. Overlap check (422)
      for (const ex of existingLeaves) {
        if (!["pending", "approved"].includes(ex.status)) continue;
        if (ex.type === "earlyLeave") continue;
        const exS = ex.startDate || ex.date;
        const exE = ex.endDate || ex.date;
        if (exS && exE && startDate <= exE && endDate >= exS) {
          return res.status(422).json({
            error: `Leave dates overlap with an existing ${ex.status} request (${exS} to ${exE}).`,
            code: "LEAVE_OVERLAP",
          });
        }
      }

      // 2. Working days calculation (skip weekends & holidays)
      const { count: workingDays, dates } = countWorkingDays(
        startDate,
        endDate,
        weekendDays,
        holidays
      );

      if (workingDays <= 0) {
        return res.status(422).json({
          error: "Selected range contains 0 working days (all weekends or public holidays).",
          code: "ZERO_WORKING_DAYS",
        });
      }

      // 3. Quota balance check (422)
      const quota = DEFAULT_QUOTAS[leaveType];
      if (typeof quota === "number") {
        const yearPrefix = startDate.slice(0, 4) + "-";
        let usedOrPending = 0;
        for (const ex of existingLeaves) {
          if (!["pending", "approved"].includes(ex.status)) continue;
          if ((ex.leaveType || "annual") !== leaveType) continue;
          if (!(ex.startDate || "").startsWith(yearPrefix)) continue;
          usedOrPending += Number(ex.workingDays) || 1;
        }
        const remaining = Math.max(0, quota - usedOrPending);
        if (workingDays > remaining) {
          return res.status(422).json({
            error: `Insufficient ${leaveType} leave balance. Requested ${workingDays} working day(s), but only ${remaining} remaining out of ${quota}.`,
            code: "INSUFFICIENT_LEAVE_BALANCE",
          });
        }
      }

      const newDoc = {
        uid: user.uid,
        employeeName: user.name,
        employeeEmail: user.email,
        department: user.department || "General",
        type: "leave",
        leaveType,
        startDate,
        endDate,
        workingDays,
        dates,
        reason: reason.trim(),
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
      };

      const ref = await db.collection("leaveRequests").add(newDoc);
      await writeAuditLog(db, FieldValue, {
        actorUid: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: "LEAVE_APPLY",
        entity: "leaveRequests",
        entityId: ref.id,
        before: null,
        after: { leaveType, startDate, endDate, workingDays, status: "pending" },
      });

      return res.status(200).json({ ok: true, id: ref.id, workingDays, dates });
    }

    return res.status(400).json({ error: "Unsupported leave action" });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
};
