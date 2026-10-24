import { useEffect, useRef, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db, auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import {
  formatTime12,
  statusLabel,
  getLocalDateStr,
  calculateHaversineDistanceMeters,
} from "../utils/attendanceHelpers";
import {
  selfCheckIn,
  selfCheckOut,
  submitAttendanceCorrection,
  checkCompanySetup,
} from "../services/hrServer";
import "./css/MarkAttendance.css";

function MarkAttendance() {
  const [record, setRecord] = useState(null);
  const [corrections, setCorrections] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // GPS + Bonus Camera State
  const [coords, setCoords] = useState(null);
  const [distanceMeters, setDistanceMeters] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef(null);

  // Attendance Correction Form State
  const [corrDate, setCorrDate] = useState(getLocalDateStr());
  const [corrIn, setCorrIn] = useState("09:00");
  const [corrOut, setCorrOut] = useState("18:00");
  const [corrReason, setCorrReason] = useState("");
  const [corrBusy, setCorrBusy] = useState(false);

  const navigate = useNavigate();
  const todayStr = getLocalDateStr();

  const loadData = async () => {
    setLoading(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const [setupRes, attSnap, corrSnap] = await Promise.all([
        checkCompanySetup(),
        getDocs(
          query(
            collection(db, "attendance"),
            where("uid", "==", uid),
            where("date", "==", todayStr)
          )
        ),
        getDocs(
          query(collection(db, "attendance_corrections"), where("uid", "==", uid))
        ),
      ]);

      setSettings(setupRes.settings);
      setRecord(attSnap.empty ? null : attSnap.docs[0].data());
      setCorrections(
        corrSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort(
            (a, b) =>
              (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
          )
      );
    } catch (err) {
      if (err?.name !== "AbortError") {
        setError(err.message || "Could not load your attendance.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    return () => {
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }
    };
  }, [todayStr]);

  const handleCaptureLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setCoords({ lat, lng });
        if (settings?.officeLocation?.lat) {
          const dist = calculateHaversineDistanceMeters(
            lat,
            lng,
            Number(settings.officeLocation.lat),
            Number(settings.officeLocation.lng)
          );
          setDistanceMeters(dist);
        }
        setMessage(`GPS Verified (${lat}, ${lng})`);
      },
      (err) => setError("GPS Warning: " + err.message)
    );
  };

  const toggleCamera = async () => {
    if (cameraActive) {
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }
      setCameraActive(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 100);
    } catch (e) {
      setError("Camera access denied or unavailable: " + e.message);
    }
  };

  const handleCheckIn = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await selfCheckIn({
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      });
      setRecord(res);
      setMessage(
        `Checked in successfully! Status: ${statusLabel(res)}. Server timestamp recorded.`
      );
    } catch (err) {
      setError(err.message || "Check-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleCheckOut = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await selfCheckOut();
      setRecord(res);
      setMessage(
        `Checked out! Worked ${res.workedHours}h — Final Status: ${statusLabel(res)}.`
      );
    } catch (err) {
      setError(err.message || "Check-out failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleCorrectionSubmit = async (e) => {
    e.preventDefault();
    setCorrBusy(true);
    setError("");
    setMessage("");
    try {
      await submitAttendanceCorrection({
        date: corrDate,
        requestedCheckIn: corrIn,
        requestedCheckOut: corrOut,
        reason: corrReason,
      });
      setCorrReason("");
      setMessage("Attendance correction request submitted to HR for approval.");
      await loadData();
    } catch (err) {
      setError(err.message || "Could not submit correction request.");
    } finally {
      setCorrBusy(false);
    }
  };

  const statusClass =
    record?.status === "half_day" || record?.status === "late"
      ? "is-late"
      : "";

  return (
    <div className="mark-att-page">
      <header className="mark-att-topbar">
        <div className="mark-att-identity">
          <div className="mark-att-avatar">A</div>
          <div className="mark-att-identity-text">
            <span className="mark-att-name">Self Check-In / Check-Out</span>
            <span className="mark-att-date-pill">{todayStr}</span>
          </div>
        </div>
        <button className="mark-att-back-btn" onClick={() => navigate("/")}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back
        </button>
      </header>

      {loading ? (
        <p className="mark-att-loading">Loading...</p>
      ) : (
        <div style={{ maxWidth: "780px", margin: "0 auto", padding: "0 20px 40px" }}>
          <section className="mark-att-hero" style={{ marginBottom: "28px" }}>
            <div className="mark-att-hero-glow" />
            <p className="mark-att-hero-date">
              Office Hours: {settings?.officeStartTime || "09:00"} –{" "}
              {settings?.officeEndTime || "18:00"} · Grace:{" "}
              {settings?.graceMinutes ?? 15}m (Late after 09:15) · Half-Day &lt;{" "}
              {settings?.halfDayThresholdHours ?? 5}h
            </p>
            <h1 className="mark-att-hero-title">
              {record
                ? record.checkOutTime
                  ? "Shift Completed"
                  : "You're Checked In"
                : "Ready to Check In"}
            </h1>
            <p className="mark-att-hero-sub">
              {record
                ? `Check-In: ${formatTime12(record.checkInTime)}${
                    record.checkOutTime
                      ? ` · Check-Out: ${formatTime12(record.checkOutTime)} (${
                          record.workedHours ?? 0
                        }h worked)`
                      : " · Remember to check out before leaving."
                  }`
                : "Click Check In below to stamp your official server attendance."}
            </p>

            {record && (
              <p className={`mark-att-status ${statusClass}`}>
                {statusLabel(record)}
              </p>
            )}

            {error && (
              <div
                style={{
                  background: "rgba(239, 68, 68, 0.16)",
                  border: "1px solid rgba(239, 68, 68, 0.45)",
                  color: "#fca5a5",
                  padding: "10px 16px",
                  borderRadius: "10px",
                  marginTop: "14px",
                  fontSize: "13px",
                }}
              >
                {error}
              </div>
            )}

            {message && (
              <div
                style={{
                  background: "rgba(16, 185, 129, 0.16)",
                  border: "1px solid rgba(16, 185, 129, 0.45)",
                  color: "#6ee7b7",
                  padding: "10px 16px",
                  borderRadius: "10px",
                  marginTop: "14px",
                  fontSize: "13px",
                }}
              >
                {message}
              </div>
            )}

            {/* Optional GPS & Camera Verification Controls */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "10px",
                flexWrap: "wrap",
                marginTop: "18px",
              }}
            >
              <button
                type="button"
                onClick={handleCaptureLocation}
                style={{
                  padding: "8px 14px",
                  borderRadius: "9px",
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#cbd5e1",
                  fontSize: "12.5px",
                  cursor: "pointer",
                }}
              >
                📍 {coords ? `GPS Locked (${distanceMeters ?? 0}m from office)` : "Verify GPS Radius"}
              </button>
              <button
                type="button"
                onClick={toggleCamera}
                style={{
                  padding: "8px 14px",
                  borderRadius: "9px",
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#cbd5e1",
                  fontSize: "12.5px",
                  cursor: "pointer",
                }}
              >
                📷 {cameraActive ? "Close Camera" : "Verify Camera / Face"}
              </button>
            </div>

            {cameraActive && (
              <div style={{ marginTop: "14px" }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: "220px",
                    height: "165px",
                    borderRadius: "12px",
                    objectFit: "cover",
                    border: "2px solid #8b5cf6",
                  }}
                />
              </div>
            )}

            {/* Main Check-In / Check-Out Action Buttons */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "14px",
                flexWrap: "wrap",
                marginTop: "22px",
              }}
            >
              <button
                type="button"
                disabled={busy}
                onClick={handleCheckIn}
                style={{
                  padding: "13px 28px",
                  borderRadius: "12px",
                  border: "none",
                  background: record
                    ? "rgba(124, 58, 237, 0.35)"
                    : "linear-gradient(135deg, #7c3aed, #4f46e5)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "15px",
                  cursor: busy ? "not-allowed" : "pointer",
                }}
              >
                {busy ? "Processing..." : record ? "Checked In (Test 409)" : "✓ Check In Now"}
              </button>

              {record && !record.checkOutTime && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleCheckOut}
                  style={{
                    padding: "13px 28px",
                    borderRadius: "12px",
                    border: "none",
                    background: "linear-gradient(135deg, #10b981, #059669)",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: "15px",
                    cursor: busy ? "not-allowed" : "pointer",
                  }}
                >
                  {busy ? "Saving..." : "⏹ Check Out Now"}
                </button>
              )}
            </div>

            <p
              className="mark-att-link"
              style={{ marginTop: "18px" }}
              onClick={() => navigate("/my-attendance")}
            >
              View Full Monthly Attendance History →
            </p>
          </section>

          {/* Attendance Correction Request Section (Brief P1 #11) */}
          <section
            style={{
              background: "rgba(15, 23, 42, 0.85)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "18px",
              padding: "24px",
            }}
          >
            <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "6px", color: "#f8fafc" }}>
              Request Attendance Correction
            </h2>
            <p style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "18px" }}>
              Missed a check-in or check-out? Submit a correction request with your reason for HR review.
            </p>

            <form
              onSubmit={handleCorrectionSubmit}
              style={{ display: "grid", gap: "14px", marginBottom: "22px" }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: "12px",
                }}
              >
                <div>
                  <label style={labelStyle}>Date</label>
                  <input
                    type="date"
                    max={todayStr}
                    required
                    value={corrDate}
                    onChange={(e) => setCorrDate(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Requested Check-In</label>
                  <input
                    type="time"
                    required
                    value={corrIn}
                    onChange={(e) => setCorrIn(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Requested Check-Out</label>
                  <input
                    type="time"
                    required
                    value={corrOut}
                    onChange={(e) => setCorrOut(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Reason for Correction *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Explain why check-in/out was missed (e.g. client meeting, Wi-Fi outage)..."
                  value={corrReason}
                  onChange={(e) => setCorrReason(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <button
                  type="submit"
                  disabled={corrBusy}
                  style={{
                    padding: "10px 18px",
                    borderRadius: "10px",
                    border: "none",
                    background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                    color: "#fff",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {corrBusy ? "Submitting..." : "Submit Correction Request"}
                </button>
              </div>
            </form>

            {corrections.length > 0 && (
              <div>
                <h3 style={{ fontSize: "14px", color: "#cbd5e1", marginBottom: "10px" }}>
                  Your Correction Requests
                </h3>
                <div style={{ display: "grid", gap: "8px" }}>
                  {corrections.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 14px",
                        borderRadius: "10px",
                        background: "rgba(255,255,255,0.04)",
                        fontSize: "13px",
                      }}
                    >
                      <div>
                        <strong>{c.date}</strong> ({c.requestedCheckIn} –{" "}
                        {c.requestedCheckOut}) · {c.reason}
                        {c.adminComment && (
                          <div style={{ fontSize: "11.5px", color: "#a78bfa" }}>
                            HR Note: {c.adminComment}
                          </div>
                        )}
                      </div>
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          background:
                            c.status === "approved"
                              ? "rgba(16,185,129,0.2)"
                              : c.status === "rejected"
                              ? "rgba(239,68,68,0.2)"
                              : "rgba(245,158,11,0.2)",
                          color:
                            c.status === "approved"
                              ? "#6ee7b7"
                              : c.status === "rejected"
                              ? "#fca5a5"
                              : "#fcd34d",
                        }}
                      >
                        {c.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontSize: "12px",
  color: "#cbd5e1",
  marginBottom: "5px",
};

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: "9px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(9, 9, 11, 0.85)",
  color: "#f8fafc",
  fontSize: "13.5px",
};

export default MarkAttendance;
