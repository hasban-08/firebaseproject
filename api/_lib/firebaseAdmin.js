const admin = require("firebase-admin");

function initAdmin() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountJson) {
    try {
      const parsed = JSON.parse(serviceAccountJson);
      return admin.initializeApp({
        credential: admin.credential.cert(parsed),
      });
    } catch (err) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:", err.message);
    }
  }

  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  }

  return null;
}

function getAdminServices() {
  const app = initAdmin();
  if (!app) return null;
  return {
    admin,
    db: admin.firestore(),
    auth: admin.auth(),
    FieldValue: admin.firestore.FieldValue,
  };
}

async function verifyRequestUser(req) {
  const services = getAdminServices();
  if (!services) {
    return { services: null, user: null, error: "ADMIN_SDK_NOT_CONFIGURED" };
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return { services, user: null, error: "Missing Bearer token", status: 401 };
  }

  try {
    const decoded = await services.auth.verifyIdToken(token);
    const userSnap = await services.db.collection("users").doc(decoded.uid).get();
    const userData = userSnap.exists ? userSnap.data() : {};
    return {
      services,
      user: {
        uid: decoded.uid,
        email: decoded.email || userData.email || "",
        role: userData.role || "employee",
        name: userData.name || userData.personalInfo?.fullName || "User",
        department: userData.department || "General",
        ...userData,
      },
      error: null,
    };
  } catch (err) {
    return { services, user: null, error: err.message || "Invalid token", status: 401 };
  }
}

async function writeAuditLog(db, FieldValue, { actorUid, actorName, actorRole, action, entity, entityId, before, after }) {
  try {
    await db.collection("audit_logs").add({
      actorUid: actorUid || "system",
      actorName: actorName || "System",
      actorRole: actorRole || "system",
      action,
      entity,
      entityId: entityId || "",
      before: before ? JSON.parse(JSON.stringify(before)) : null,
      after: after ? JSON.parse(JSON.stringify(after)) : null,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("Audit log error:", err.message);
  }
}

module.exports = {
  getAdminServices,
  verifyRequestUser,
  writeAuditLog,
};
