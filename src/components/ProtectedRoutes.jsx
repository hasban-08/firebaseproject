import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { Navigate } from "react-router-dom";

function ProtectedRoute({ children, adminOnly = false }) {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        if (!auth.currentUser) return;
        const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (!cancelled) setIsAdmin(snap.exists() && snap.data().role === "admin");
      } catch (err) {
        if (err?.name !== "AbortError") console.error("ProtectedRoute:", err);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    check();
    return () => { cancelled = true; };
  }, []);

  if (checking) return <h2 style={{ padding: 20 }}>Loading...</h2>;

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default ProtectedRoute;