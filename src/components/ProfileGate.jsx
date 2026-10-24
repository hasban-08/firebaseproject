import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db, auth } from "../firebase";
import { Navigate, useLocation } from "react-router-dom";

function ProfileGate({ children }) {
  const [checking, setChecking] = useState(true);
  const [complete, setComplete] = useState(true);
  const [mustChangePass, setMustChangePass] = useState(false);
  const [deactivated, setDeactivated] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        if (!auth.currentUser) return;
        const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
        const data = snap.exists() ? snap.data() : null;
        if (!cancelled && data) {
          setDeactivated(data.active === false);
          setMustChangePass(!!data.mustChangePassword);
          setComplete(
            !!(
              data.role === "admin" ||
              (data.profileComplete && data.emergencyContact?.phone)
            )
          );
        }
      } catch (err) {
        if (err?.name !== "AbortError") console.error("ProfileGate:", err);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (checking) return <h2 style={{ padding: 20, color: "#e2e8f0" }}>Loading...</h2>;

  if (deactivated) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#09090b",
          color: "#f8fafc",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          textAlign: "center",
        }}
      >
        <h2 style={{ color: "#f87171", marginBottom: 8 }}>Account Deactivated</h2>
        <p style={{ color: "#94a3b8", maxWidth: 420, marginBottom: 20 }}>
          Your account has been deactivated by the Company Administrator. Please contact HR or Admin for assistance.
        </p>
        <button
          onClick={() => signOut(auth)}
          style={{
            padding: "10px 20px",
            borderRadius: 10,
            border: "none",
            background: "#ef4444",
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Sign Out
        </button>
      </div>
    );
  }

  if (mustChangePass && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  if (!complete && location.pathname !== "/complete-profile") {
    return (
      <Navigate to="/complete-profile" replace state={{ incomplete: true }} />
    );
  }

  return children;
}

export default ProfileGate;
