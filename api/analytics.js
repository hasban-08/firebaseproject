const { verifyRequestUser } = require("./_lib/firebaseAdmin");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { services, user, error, status } = await verifyRequestUser(req);
  if (error === "ADMIN_SDK_NOT_CONFIGURED") {
    return res.status(503).json({ error: "ADMIN_SDK_NOT_CONFIGURED", fallback: true });
  }
  if (error || !user) {
    return res.status(status || 401).json({ error: error || "Unauthorized" });
  }

  const { db } = services;
  const { startDate = "", endDate = "", department = "ALL" } = req.query || {};

  try {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    if (["admin", "hr"].includes(user.role)) {
      const [usersSnap, attSnap, leavesSnap] = await Promise.all([
        db.collection("users").get(),
        db.collection("attendance").get(),
        db.collection("leaveRequests").get(),
      ]);

      let users = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
      if (department && department !== "ALL") {
        users = users.filter((u) => (u.department || "General") === department);
      }
      const allowedUids = new Set(users.map((u) => u.uid));

      const att = attSnap.docs
        .map((d) => d.data())
        .filter((r) => allowedUids.has(r.uid))
        .filter((r) => (!startDate || r.date >= startDate) && (!endDate || r.date <= endDate));

      const leaves = leavesSnap.docs
        .map((d) => d.data())
        .filter((l) => allowedUids.has(l.uid));

      const todayAtt = att.filter((r) => r.date === todayStr);
      const presentToday = todayAtt.length;
      const lateToday = todayAtt.filter((r) => r.status === "late" || r.status === "extreme-late").length;
      const onLeaveToday = leaves.filter(
        (l) => l.status === "approved" && (l.startDate || l.date) <= todayStr && (l.endDate || l.date) >= todayStr
      ).length;
      const pendingApprovals = leaves.filter((l) => l.status === "pending").length;

      // Top 5 late comers
      const lateByUid = {};
      att.forEach((r) => {
        if (r.status === "late" || r.status === "extreme-late") {
          if (!lateByUid[r.uid]) {
            lateByUid[r.uid] = { uid: r.uid, name: r.name || "Employee", count: 0, totalMinutes: 0 };
          }
          lateByUid[r.uid].count += 1;
          lateByUid[r.uid].totalMinutes += Number(r.lateMinutes) || 0;
        }
      });
      const topLateComers = Object.values(lateByUid)
        .sort((a, b) => b.count - a.count || b.totalMinutes - a.totalMinutes)
        .slice(0, 5);

      return res.status(200).json({
        role: user.role,
        kpis: {
          headcount: users.length,
          presentToday,
          onLeaveToday,
          lateToday,
          pendingApprovals,
        },
        topLateComers,
      });
    }

    return res.status(200).json({ role: "employee", fallback: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Analytics error" });
  }
};
