import { useEffect, useState } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import { getLocalMonthStr } from "../utils/attendanceHelpers";
import { buildMonthRows } from "../utils/monthattendance";
import {
  exportMonthToCSV,
  exportMonthToExcel,
  exportMonthToPDF,
  printElement,
} from "../utils/exportAttendance";
import "./css/MyAttendance.css";

function kindClass(kind) {
  if (kind === "extreme-late" || kind === "missing_checkout") return "status-extreme-late";
  if (kind === "late" || kind === "half_day") return "status-late";
  if (kind === "absent") return "status-absent";
  if (kind === "leave") return "status-leave";
  if (kind === "pending") return "status-pending";
  if (kind === "off") return "status-off";
  return "status-ontime";
}

function MyAttendance() {
  const currentMonth = getLocalMonthStr();
  const [userName, setUserName] = useState("");
  const [schedule, setSchedule] = useState(null);
  const [records, setRecords] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError("");
      try {
        const uid = auth.currentUser.uid;

        const [userSnap, attSnap, leaveSnap, holSnap] = await Promise.all([
          getDoc(doc(db, "users", uid)),
          getDocs(
            query(
              collection(db, "attendance"),
              where("uid", "==", uid),
              where("month", "==", selectedMonth)
            )
          ),
          getDocs(
            query(
              collection(db, "leaveRequests"),
              where("uid", "==", uid),
              where("status", "==", "approved")
            )
          ),
          getDocs(collection(db, "public_holidays")),
        ]);
        if (cancelled) return;

        const userData = userSnap.exists() ? userSnap.data() : {};
        setUserName(userData.name || auth.currentUser.displayName || "");
        setSchedule(userData.schedule || null);
        setRecords(attSnap.docs.map((d) => d.data()));
        setLeaves(leaveSnap.docs.map((d) => d.data()));
        setHolidays(holSnap.docs.map((d) => d.data()));
      } catch (err) {
        if (err?.name !== "AbortError" && !cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [selectedMonth]);

  const { rows, summary } = loading
    ? { rows: [], summary: null }
    : buildMonthRows({
        month: selectedMonth,
        schedule,
        records,
        leaves,
        publicHolidays: holidays,
      });

  const stats = summary
    ? [
        ["Present", summary.present],
        ["On time", summary.onTime],
        ["Late (>09:15)", summary.late],
        ["Half-Day (<5h)", summary.halfDay],
        ["Missing Out", summary.missingCheckout],
        ["Absent", summary.absent],
        ["On Leave", summary.leave],
      ]
    : [];

  const fileName = `my-attendance-${selectedMonth}`;

  return (
    <div className="my-attendance-page">
      <header className="my-attendance-topbar">
        <div className="my-attendance-identity">
          <div className="my-attendance-avatar">
            {(userName || "U").charAt(0).toUpperCase()}
          </div>
          <div className="my-attendance-identity-text">
            <span className="my-attendance-name">
              {userName ? `${userName}'s Attendance` : "My Attendance"}
            </span>
            <span className="my-attendance-month-pill">{selectedMonth}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            className="my-attendance-back-btn"
            onClick={() => navigate("/mark-attendance")}
          > Self Check-In / Correction
          </button>
          <button className="my-attendance-back-btn" onClick={() => navigate("/")}>
            <- Back
          </button>
        </div>
      </header>

      <section className="my-attendance-hero">
        <div className="my-attendance-hero-glow" />
        <p className="my-attendance-hero-date">Monthly Attendance Record</p>
        <h1 className="my-attendance-hero-title">Your Attendance History</h1>
        <p className="my-attendance-hero-sub"> Present, Late (&gt;09:15), Half-Day (&lt;5h), Missing Checkout, Absent & Approved Leaves.
        </p>
      </section>

      {error ? (
        <p className="my-attendance-error">Error: {error}</p>
      ) : (
        <section className="my-attendance-body">
          <div className="my-attendance-controls">
            <input
              type="month"
              className="my-attendance-month-input"
              value={selectedMonth}
              max={currentMonth}
              onChange={(e) => setSelectedMonth(e.target.value || currentMonth)}
            />
            {rows.length > 0 && (
              <div className="my-attendance-export-bar">
                <button onClick={() => exportMonthToCSV(rows, fileName)}>CSV</button>
                <button onClick={() => exportMonthToExcel(rows, fileName)}> Excel
                </button>
                <button
                  onClick={() => exportMonthToPDF(
                      rows,
                      fileName,
                      `${userName || "My"} attendance - ${selectedMonth}`
                    )
                  }
                > PDF
                </button>
                <button onClick={() => printElement("my-attendance-table")}> Print
                </button>
              </div>
            )}
          </div>

          {stats.length > 0 && (
            <div className="my-attendance-summary">
              {stats.map(([label, value]) => (
                <div className="my-attendance-stat" key={label}>
                  <span className="my-attendance-stat-value">{value}</span>
                  <span className="my-attendance-stat-label">{label}</span>
                </div>
              ))}
            </div>
          )}

          <div className="my-attendance-card">
            {loading ? (
              <p className="my-attendance-loading">Loading...</p>
            ) : rows.length === 0 ? (
              <p className="my-attendance-loading">No records for this month.</p>
            ) : (
              <div id="my-attendance-table">
                <table className="my-attendance-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Day</th>
                      <th>Check-In</th>
                      <th>Check-Out</th>
                      <th>Status</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.date}>
                        <td>{r.date}</td>
                        <td>{r.day}</td>
                        <td>{r.time || "-"}</td>
                        <td>{r.checkOut || "-"}</td>
                        <td className={kindClass(r.kind)}>{r.label}</td>
                        <td>{r.note || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export default MyAttendance;
