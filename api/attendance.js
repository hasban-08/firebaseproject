const { verifyRequestUser, writeAuditLog } = require("./_lib/firebaseAdmin");

function calcHaversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
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
  const action = body.action || "check_in";

  try {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const todayStr = `${y}-${m}-${d}`;
    const monthStr = `${y}-${m}`;

    const settingsSnap = await db.collection("settings").doc("company").get();
    const settings = settingsSnap.exists
      ? settingsSnap.data()
      : { officeStartTime: "09:00", graceMinutes: 15, halfDayThresholdHours: 5 };

    if (action === "check_in") {
      const attId = `${user.uid}_${todayStr}`;
      const attRef = db.collection("attendance").doc(attId);
      const existing = await attRef.get();

      if (existing.exists) {
        return res.status(409).json({
          error: "Duplicate Check-In: You have already checked in today.",
          code: "DUPLICATE_CHECKIN",
        });
      }

      if (settings.officeLocation?.enforceLocation && settings.officeLocation?.lat) {
        if (typeof body.lat !== "number" || typeof body.lng !== "number") {
          return res.status(422).json({
            error: "GPS location is required for office check-in.",
          });
        }
        const dist = calcHaversineMeters(
          body.lat,
          body.lng,
          Number(settings.officeLocation.lat),
          Number(settings.officeLocation.lng)
        );
        const maxRadius = Number(settings.officeLocation.radiusMeters) || 500;
        if (dist > maxRadius) {
          return res.status(422).json({
            error: `Outside office radius (${dist}m away, max allowed ${maxRadius}m).`,
          });
        }
      }

      const [expH, expM] = (settings.officeStartTime || "09:00").split(":").map(Number);
      const expected = new Date(now);
      expected.setHours(expH, expM, 0, 0);
      const graceMins = typeof settings.graceMinutes === "number" ? settings.graceMinutes : 15;
      const graceCutoff = new Date(expected.getTime() + graceMins * 60000);

      const isLate = now > graceCutoff;
      const lateMinutes = isLate
        ? Math.max(1, Math.round((now.getTime() - graceCutoff.getTime()) / 60000))
        : 0;
      const attStatus = isLate ? "late" : "present";

      const record = {
        uid: user.uid,
        name: user.name,
        department: user.department || "General",
        date: todayStr,
        month: monthStr,
        checkInTime: FieldValue.serverTimestamp(),
        checkOutTime: null,
        workedHours: 0,
        status: attStatus,
        lateMinutes,
        location: body.lat ? { lat: body.lat, lng: body.lng } : null,
        markedBy: user.uid,
      };

      await attRef.set(record);
      await writeAuditLog(db, FieldValue, {
        actorUid: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: "ATTENDANCE_CHECK_IN",
        entity: "attendance",
        entityId: attId,
        before: null,
        after: { date: todayStr, status: attStatus, lateMinutes },
      });

      return res.status(200).json({ ok: true, record: { ...record, checkInTime: now.toISOString() } });
    }

    if (action === "check_out") {
      const attId = `${user.uid}_${todayStr}`;
      const attRef = db.collection("attendance").doc(attId);
      const existing = await attRef.get();

      if (!existing.exists) {
        return res.status(422).json({ error: "You have not checked in today." });
      }
      const data = existing.data();
      if (data.checkOutTime) {
        return res.status(409).json({ error: "You have already checked out today." });
      }

      const checkInDate = data.checkInTime?.toDate ? data.checkInTime.toDate() : new Date();
      const workedHours = Number(
        Math.max(0, (now.getTime() - checkInDate.getTime()) / 3600000).toFixed(2)
      );
      const minHalfDay = Number(settings.halfDayThresholdHours) || 5;
      const newStatus = workedHours < minHalfDay ? "half_day" : data.status;

      await attRef.update({
        checkOutTime: FieldValue.serverTimestamp(),
        workedHours,
        status: newStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });

      await writeAuditLog(db, FieldValue, {
        actorUid: user.uid,
        actorName: user.name,
        actorRole: user.role,
        action: "ATTENDANCE_CHECK_OUT",
        entity: "attendance",
        entityId: attId,
        before: { status: data.status, checkOutTime: null },
        after: { status: newStatus, workedHours },
      });

      return res.status(200).json({
        ok: true,
        workedHours,
        status: newStatus,
        checkOutTime: now.toISOString(),
      });
    }

    return res.status(400).json({ error: "Unsupported attendance action" });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
};
