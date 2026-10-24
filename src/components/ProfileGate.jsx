import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { Navigate, useLocation } from "react-router-dom";

function ProfileGate({ children }) {
  const [checking, setChecking] = useState(true);
  const [complete, setComplete] = useState(true);
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        if (!auth.currentUser) return;
        const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
        const data = snap.exists() ? snap.data() : null;
        if (!cancelled) {
          setComplete(!!(data && data.profileComplete && data.emergencyContact?.phone));
        }
      } catch (err) {
        if (err?.name !== "AbortError") console.error("ProfileGate:", err);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    check();
    return () => { cancelled = true; };
  }, [location.pathname]);

  if (checking) return <h2 style={{ padding: 20 }}>Loading...</h2>;

  if (!complete && location.pathname !== "/complete-profile") {
    return <Navigate to="/complete-profile" replace state={{ incomplete: true }} />;
  }

  return children;
}

export default ProfileGate;