import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { Navigate } from "react-router-dom";

function ProtectedRoute({
  children,
  adminOnly = false,
  hrOrAdmin = false,
  allowedRoles = null,
}) {
  const [checking, setChecking] = useState(true);
  const [role, setRole] = useState("employee");

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        if (!auth.currentUser) return;
        const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (!cancelled) {
          setRole(snap.exists() ? snap.data().role || "employee" : "employee");
        }
      } catch (err) {
        if (err?.name !== "AbortError") console.error("ProtectedRoute:", err);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (checking) return <h2 style={{ padding: 20, color: "#e2e8f0" }}>Loading...</h2>;

  if (adminOnly && role !== "admin") {
    return <Navigate to="/" replace />;
  }

  if (hrOrAdmin && !["admin", "hr"].includes(role)) {
    return <Navigate to="/" replace />;
  }

  if (Array.isArray(allowedRoles) && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default ProtectedRoute;
