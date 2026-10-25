import { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate } from "react-router-dom";
import { getLocalMonthStr } from "../utils/attendanceHelpers";
import { buildMonthRows } from "../utils/monthattendance";
import {
  exportMonthToCSV,
  exportMonthToExcel,
  exportMonthToPDF,
  printElement,
} from "../utils/exportAttendance";
import "./css/AdminAttendance.css";

function displayNameFor(emp) {
  if (emp.name && emp.name.trim() && emp.name.trim().toLowerCase() !== "user") {
    return emp.name;
  }
  if (emp.fullName?.trim()) return emp.fullName;
  if (emp.email) return emp.email.split("@")[0];
  return "Employee";
}

function kindClass(kind) {
  if (kind === "extreme-late" || kind === "missing_checkout") return "admin-att-s-extreme";
  if (kind === "late" || kind === "half_day") return "admin-att-s-late";
  if (kind === "absent") return "admin-att-s-absent";
  if (kind === "leave") return "admin-att-s-leave";
  if (kind === "pending") return "admin-att-s-pending";
  if (kind === "off") return "admin-att-s-off";
  return "admin-att-s-ontime";
}

function AdminAttendance() {
  const currentMonth = getLocalMonthStr();
  const [employees, setEmployees] = useState([]);
  const [selectedUid, setSelectedUid] = useState(null);
  const [month, setMonth] = useState(currentMonth);
  const [records, setRecords] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const loadUsers = async () => {
      try {
        const [snap, holSnap] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "public_holidays")),
        ]);
        if (cancelled) return;
        const list = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
        setEmployees(list);
        setHolidays(holSnap.docs.map((d) => d.data()));
        if (list.length > 0) setSelectedUid((prev) => prev || list[0].uid);
      } catch (err) {
        if (err?.name !== "AbortError" && !cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    };
    loadUsers();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedUid) return;
    let cancelled = false;

    const loadData = async () => {
      setLoadingData(true);
      setError("");
      try {
        const [attSnap, leaveSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, "attendance"),
              where("uid", "==", selectedUid),
              where("month", "==", month)
            )
          ),
          getDocs(
            query(
              collection(db, "leaveRequests"),
              where("uid", "==", selectedUid),
              where("status", "==", "approved")
            )
          ),
        ]);
        if (cancelled) return;
        setRecords(attSnap.docs.map((d) => d.data()));
        setLeaves(leaveSnap.docs.map((d) => d.data()));
      } catch (err) {
        if (err?.name !== "AbortError" && !cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [selectedUid, month]);

  const selectedEmp = employees.find((e) => e.uid === selectedUid);
  const selectedName = selectedEmp ? displayNameFor(selectedEmp) : "";

  const { rows, summary } =
    selectedEmp && !loadingData
      ? buildMonthRows({
          month,
          schedule: selectedEmp.schedule,
          records,
          leaves,
          publicHolidays: holidays,
        })
      : { rows: [], summary: null };

  const stats = summary
    ? [
        ["Present", summary.present],
        ["On time", summary.onTime],
        ["Late (>09:15)", summary.late],
        ["Half-Day (<5h)", summary.halfDay],
        ["Missing Out", summary.missingCheckout],
        ["Absent", summary.absent],
        ["Leave", summary.leave],
      ]
    : [];

  const fileName = `${selectedName}-${month}`;

  return (
    <div className="admin-att-page">
      <header className="admin-att-topbar">
        <div className="admin-att-identity">
          <div className="admin-att-avatar">E</div>
          <div className="admin-att-identity-text">
            <span className="admin-att-name">Employee Monthly Attendance</span>
            <span className="admin-att-month-pill">{month}</span>
          </div>
        </div>
        <div className="admin-att-header-actions">
          <button
            className="admin-att-daily-btn"
            onClick={() => navigate("/daily-attendance")}
          > Daily Sheet & Corrections
          </button>
          <button className="admin-att-back-btn" onClick={() => navigate("/")}>
            <- Back
          </button>
        </div>
      </header>

      <section className="admin-att-hero">
        <div className="admin-att-hero-glow" />
        <p className="admin-att-hero-date">Per-employee monthly record</p>
        <h1 className="admin-att-hero-title">Review Employee Attendance</h1>
        <p className="admin-att-hero-sub"> Select an employee to view their Check-In, Check-Out, Half-Day, Late, and Leave breakdown.
        </p>
      </section>

      <section className="admin-att-body">
        {loadingUsers ? (
          <p className="admin-att-empty">Loading...</p>
        ) : (
          <div className="admin-att-emp-list">
            {employees.length === 0 && (
              <p className="admin-att-empty">No employees found yet.</p>
            )}
            {employees.map((emp) => (
              <button
                key={emp.uid}
                className={`admin-att-chip ${
                  selectedUid === emp.uid ? "active" : ""
                }`}
                onClick={() => setSelectedUid(emp.uid)}
              >
                <span className="admin-att-chip-avatar">
                  {displayNameFor(emp).charAt(0).toUpperCase()}
                </span>
                {displayNameFor(emp)}
              </button>
            ))}
          </div>
        )}

        {error && <p className="admin-att-error">Error: {error}</p>}

        {selectedEmp && (
          <>
            <div className="admin-att-controls">
              <input
                type="month"
                className="admin-att-month-input"
                value={month}
                max={currentMonth}
                onChange={(e) => setMonth(e.target.value || currentMonth)}
              />
              {rows.length > 0 && (
                <div className="admin-att-export-bar">
                  <button onClick={() => exportMonthToCSV(rows, fileName)}> CSV
                  </button>
                  <button onClick={() => exportMonthToExcel(rows, fileName)}> Excel
                  </button>
                  <button
                    onClick={() => exportMonthToPDF(
                        rows,
                        fileName,
                        `${selectedName} - ${month}`
                      )
                    }
                  > PDF
                  </button>
                  <button onClick={() => printElement("admin-attendance-table")}> Print
                  </button>
                </div>
              )}
            </div>

            {stats.length > 0 && (
              <div className="admin-att-summary">
                {stats.map(([label, value]) => (
                  <div className="admin-att-stat" key={label}>
                    <span className="admin-att-stat-value">{value}</span>
                    <span className="admin-att-stat-label">{label}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="admin-att-card">
              {loadingData ? (
                <p className="admin-att-loading">Loading...</p>
              ) : rows.length === 0 ? (
                <p className="admin-att-loading">No records for this month.</p>
              ) : (
                <div id="admin-attendance-table" className="admin-att-scroll">
                  <table className="admin-att-table">
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
          </>
        )}
      </section>
    </div>
  );
}

export default AdminAttendance;
