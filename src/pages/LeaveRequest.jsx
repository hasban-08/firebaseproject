import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import {
  getLocalDateStr,
  calculateWorkingDaysBetween,
  computeLeaveBalances,
} from "../utils/attendanceHelpers";
import {
  applyForLeave,
  cancelLeaveRequest,
  parseSmartLeavePrompt,
  checkCompanySetup,
} from "../services/hrServer";
import "./css/LeaveRequest.css";

function LeaveRequest() {
  const navigate = useNavigate();
  const user = auth.currentUser;

  const [requestType, setRequestType] = useState("leave");
  const [leaveType, setLeaveType] = useState("annual");
  const [startDate, setStartDate] = useState(getLocalDateStr());
  const [endDate, setEndDate] = useState(getLocalDateStr());
  const [earlyLeaveTime, setEarlyLeaveTime] = useState("");
  const [reason, setReason] = useState("");
  const [requests, setRequests] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [weekendDays, setWeekendDays] = useState(["sat", "sun"]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Smart Leave AI State
  const [smartPrompt, setSmartPrompt] = useState("");
  const [smartLoading, setSmartLoading] = useState(false);
  const [aiBadgeVisible, setAiBadgeVisible] = useState(false);

  const loadPage = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [setupRes, holSnap, reqSnap] = await Promise.all([
        checkCompanySetup(),
        getDocs(collection(db, "public_holidays")),
        getDocs(query(collection(db, "leaveRequests"), where("uid", "==", user.uid))),
      ]);

      setWeekendDays(setupRes.settings?.weekendDays || ["sat", "sun"]);
      setHolidays(holSnap.docs.map((d) => d.data()));

      const rows = reqSnap.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort(
          (a, b) =>
            (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
        );
      setRequests(rows);
    } catch (err) {
      setError(err.message || "Could not load leave data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    loadPage();
  }, [user]);

  const handleSmartLeaveParse = async () => {
    if (!smartPrompt.trim()) return;
    setSmartLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const parsed = await parseSmartLeavePrompt(smartPrompt);
      setRequestType("leave");
      setLeaveType(parsed.leaveType || "casual");
      setStartDate(parsed.startDate || getLocalDateStr());
      setEndDate(parsed.endDate || parsed.startDate || getLocalDateStr());
      setReason(parsed.reason || smartPrompt);
      setAiBadgeVisible(true);
      setSuccessMsg(
        "AI pre-filled your leave form below! Please review and click Submit Request to confirm."
      );
    } catch (err) {
      setError(err.message || "Smart leave parser error.");
    } finally {
      setSmartLoading(false);
    }
  };

  const handleProcessRequest = async (event) => {
    event.preventDefault();
    setError("");
    setSuccessMsg("");
    setIsProcessing(true);

    try {
      const res = await applyForLeave({
        requestType,
        leaveType,
        startDate,
        endDate,
        earlyLeaveTime,
        reason,
      });

      setReason("");
      setEarlyLeaveTime("");
      setAiBadgeVisible(false);
      await loadPage();
      setSuccessMsg(
        requestType === "leave"
          ? `Leave request submitted (${res.workingDays} working day(s)). Waiting for HR/Admin approval.`
          : "Early leave request submitted."
      );
    } catch (err) {
      setError(err.message || "Could not process your request.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm("Cancel this pending leave request?")) return;
    setError("");
    try {
      await cancelLeaveRequest(id);
      await loadPage();
      setSuccessMsg("Pending leave request cancelled.");
    } catch (err) {
      setError(err.message);
    }
  };

  const balances = computeLeaveBalances(
    requests,
    new Date().getFullYear(),
    null,
    weekendDays,
    holidays
  );

  const previewWorkingDays =
    requestType === "leave"
      ? calculateWorkingDaysBetween(startDate, endDate, weekendDays, holidays)
          .count
      : 0;

  return (
    <main className="leave-req-page">
      <header className="leave-req-topbar">
        <div className="leave-req-identity">
          <div className="leave-req-avatar">L</div>
          <div className="leave-req-identity-text">
            <span className="leave-req-name">Leave Quotas & Smart Leave</span>
            <span className="leave-req-pill">Employee Portal</span>
          </div>
        </div>
        <button className="leave-req-back-btn" onClick={() => navigate("/")}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg> Back
        </button>
      </header>

      {/* Quota Balance Cards */}
      <section className="leave-req-panel" style={{ marginBottom: "20px" }}>
        <h2 style={{ marginBottom: "14px" }}>Your Annual Leave Quotas & Balances</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))",
            gap: "12px",
          }}
        >
          {Object.values(balances).map((b) => (
            <div
              key={b.key}
              style={{
                background: "rgba(124, 58, 237, 0.12)",
                border: "1px solid rgba(124, 58, 237, 0.28)",
                borderRadius: "14px",
                padding: "14px 16px",
              }}
            >
              <div style={{ fontSize: "12px", color: "#c4b5fd", fontWeight: 600 }}>
                {b.label}
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800, margin: "6px 0" }}>
                {b.quota === null ? "" : `${b.remaining} / ${b.quota}`}
              </div>
              <div style={{ fontSize: "11.5px", color: "#94a3b8" }}> Used: {b.used}d | Pending: {b.pending}d
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Smart Leave AI Assistant Box (Brief P3 #19) */}
      <section
        className="leave-req-panel"
        style={{
          marginBottom: "20px",
          border: "1px solid rgba(139, 92, 246, 0.4)",
          background:
            "linear-gradient(135deg, rgba(124, 58, 237, 0.14), rgba(15, 23, 42, 0.9))",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <h2 style={{ margin: 0, fontSize: "17px" }}> Smart Leave Assistant (English & Roman Urdu)
          </h2>
          <span
            style={{
              fontSize: "11px",
              padding: "3px 9px",
              borderRadius: "999px",
              background: "rgba(139, 92, 246, 0.25)",
              color: "#ddd6fe",
              fontWeight: 600,
            }}
          > AI-generated Pre-fill
          </span>
        </div>
        <p style={{ fontSize: "12.5px", color: "#cbd5e1", marginBottom: "12px" }}> Type naturally - e.g. <em>"agle Monday Tuesday off chahiye, shaadi hai"</em> or{" "}
          <em>"kal bukhar ki wajah se sick leave chahiye"</em> - and AI will pre-fill the form for your confirmation.
        </p>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <input
            type="text"
            value={smartPrompt}
            onChange={(e) => setSmartPrompt(e.target.value)}
            placeholder='Try: "agle Monday Tuesday off chahiye, shaadi hai"'
            style={{
              flex: 1,
              minWidth: "240px",
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(9, 9, 11, 0.85)",
              color: "#fff",
              fontSize: "13.5px",
            }}
          />
          <button
            type="button"
            disabled={smartLoading}
            onClick={handleSmartLeaveParse}
            style={{
              padding: "10px 18px",
              borderRadius: "10px",
              border: "none",
              background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {smartLoading ? "Parsing..." : " Auto-Fill Form"}
          </button>
        </div>
      </section>

      <section className="leave-req-panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Submit Leave Request</h2>
          {aiBadgeVisible && (
            <span
              style={{
                fontSize: "11px",
                padding: "4px 10px",
                borderRadius: "999px",
                background: "rgba(16, 185, 129, 0.2)",
                color: "#6ee7b7",
                fontWeight: 700,
              }}
            > Pre-filled (AI-generated) - Please Confirm
            </span>
          )}
        </div>

        <form onSubmit={handleProcessRequest} className="leave-req-form">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <label> Request Category
              <select
                value={requestType}
                onChange={(event) => setRequestType(event.target.value)}
              >
                <option value="leave">Full-Day Leave</option>
                <option value="earlyLeave">Early Departure</option>
              </select>
            </label>

            {requestType === "leave" && (
              <label> Leave Quota Type
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                >
                  <option value="annual">Annual Leave (14 days/yr)</option>
                  <option value="sick">Sick Leave (8 days/yr)</option>
                  <option value="casual">Casual Leave (10 days/yr)</option>
                  <option value="unpaid">Unpaid Leave (Unlimited)</option>
                </select>
              </label>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <label>
              {requestType === "leave" ? "Start Date" : "Date"}
              <input
                type="date"
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  if (endDate < event.target.value) {
                    setEndDate(event.target.value);
                  }
                }}
                required
              />
            </label>

            {requestType === "leave" ? (
              <label> End Date
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  required
                />
              </label>
            ) : (
              <label> Expected Departure Time
                <input
                  type="time"
                  value={earlyLeaveTime}
                  onChange={(event) => setEarlyLeaveTime(event.target.value)}
                  required
                />
              </label>
            )}
          </div>

          {requestType === "leave" && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                background: "rgba(255,255,255,0.04)",
                fontSize: "13px",
                color: "#cbd5e1",
              }}
            > Working Days to Deduct (skipping weekends & public holidays):{" "}
              <strong style={{ color: "#a78bfa" }}>{previewWorkingDays} day(s)</strong>
            </div>
          )}

          <label> Reason
            <textarea
              rows={3}
              maxLength={1000}
              placeholder="Explain why you need leave..."
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
            />
          </label>

          {error && <p className="leave-req-error">{error}</p>}
          {successMsg && (
            <p
              style={{
                background: "rgba(16, 185, 129, 0.16)",
                border: "1px solid rgba(16, 185, 129, 0.4)",
                color: "#6ee7b7",
                padding: "10px 14px",
                borderRadius: "10px",
                fontSize: "13px",
              }}
            >
              {successMsg}
            </p>
          )}

          <button className="leave-req-send-btn" disabled={isProcessing}>
            {isProcessing ? "Validating & Submitting..." : "Confirm & Submit Request"}
          </button>
        </form>
      </section>

      <section className="leave-req-panel">
        <h2>My Leave History</h2>

        {loading ? (
          <p className="leave-req-empty">Loading requests...</p>
        ) : requests.length === 0 ? (
          <p className="leave-req-empty">You have not submitted any leave requests yet.</p>
        ) : (
          <div className="leave-req-list">
            {requests.map((item) => (
              <article className="leave-req-card" key={item.id}>
                <div className="leave-req-card-heading">
                  <strong>
                    {item.type === "earlyLeave"
                      ? "Early Leave"
                      : `${(item.leaveType || "annual").toUpperCase()} Leave (${
                          item.workingDays ?? 1
                        } working day${item.workingDays === 1 ? "" : "s"})`}
                  </strong>
                  <span
                    className={`leave-req-status leave-req-status-${
                      item.status || "pending"
                    }`}
                  >
                    {item.status || "pending"}
                  </span>
                </div>

                <p>
                  <strong>Date: </strong>
                  {item.type === "earlyLeave"
                    ? item.date
                    : `${item.startDate} to ${item.endDate}`}
                </p>

                <p>
                  <strong>Reason: </strong>
                  {item.reason}
                </p>

                {item.adminComment && (
                  <p>
                    <strong>HR / Admin Comment: </strong>
                    {item.adminComment}
                  </p>
                )}

                {item.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => handleCancel(item.id)}
                    style={{
                      marginTop: "8px",
                      padding: "6px 12px",
                      borderRadius: "8px",
                      border: "1px solid rgba(239,68,68,0.4)",
                      background: "rgba(239,68,68,0.15)",
                      color: "#fca5a5",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  > Cancel Request
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default LeaveRequest;
