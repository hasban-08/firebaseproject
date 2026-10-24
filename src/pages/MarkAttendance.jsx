import { useEffect, useState } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import { formatTime12, statusLabel, getLocalDateStr } from "../utils/attendanceHelpers";
import "./css/MarkAttendance.css";

function MarkAttendance() {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const todayStr = getLocalDateStr();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const uid = auth.currentUser.uid;

        const userSnap = await getDoc(doc(db, "users", uid));
        if (userSnap.exists() && userSnap.data().role === "admin") {
          if (!cancelled) navigate("/daily-attendance", { replace: true });
          return;
        }

        const snap = await getDocs(
          query(
            collection(db, "attendance"),
            where("uid", "==", uid),
            where("date", "==", todayStr)
          )
        );
        if (!cancelled) setRecord(snap.empty ? null : snap.docs[0].data());
      } catch (err) {
        if (err?.name !== "AbortError" && !cancelled) {
          setError(err.message || "Could not load your attendance.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [todayStr, navigate]);

  const statusClass =
    record?.status === "extreme-late" ? "is-extreme-late" :
    record?.status === "late" ? "is-late" : "";

  return (
    <div className="mark-att-page">
      <header className="mark-att-topbar">
        <div className="mark-att-identity">
          <div className="mark-att-avatar">A</div>
          <div className="mark-att-identity-text">
            <span className="mark-att-name">Attendance</span>
            <span className="mark-att-date-pill">{todayStr}</span>
          </div>
        </div>
        <button className="mark-att-back-btn" onClick={() => navigate("/")}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
      </header>

      {loading ? (
        <p className="mark-att-loading">Loading...</p>
      ) : error ? (
        <p className="mark-att-loading" style={{ color: "#f87171" }}>Error: {error}</p>
      ) : (
        <section className="mark-att-hero">
          <div className="mark-att-hero-glow" />
          <p className="mark-att-hero-date">Today's status</p>
          <h1 className="mark-att-hero-title">
            {record ? "You're checked in" : "Not marked yet"}
          </h1>
          <p className="mark-att-hero-sub">
            {record
              ? `Your admin marked you at ${formatTime12(record.checkInTime)}.`
              : "Your admin will mark your attendance when you arrive."}
          </p>

          {record && (
            <p className={`mark-att-status ${statusClass}`}>{statusLabel(record)}</p>
          )}

          <p className="mark-att-link" onClick={() => window.location.reload()}>
            Refresh status
          </p>
          <p className="mark-att-link" onClick={() => navigate("/my-attendance")}>
            View My Attendance
          </p>
        </section>
      )}
    </div>
  );
}

export default MarkAttendance;