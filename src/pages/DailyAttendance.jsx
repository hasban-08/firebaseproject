import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  setDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import {
  exportDailyToExcel,
  exportDailyToCSV,
  exportDailyToPDF,
  printElement,
} from "../utils/exportAttendance";
import {
  formatTime12,
  statusLabel,
  getWeekdayKey,
  getLocalDateStr,
  getLocalMonthStr,
  calculateAttendanceStatus,
  getApprovedLeaveDates,
  buildDefaultSchedule,
} from "../utils/attendanceHelpers";
import {
  reviewAttendanceCorrection,
  recordAuditLog,
} from "../services/hrServer";
import "./css/DailyAttendance.css";
import { formatHM12 } from "../utils/monthattendance";

function displayNameFor(emp) {
  if (emp.name && emp.name.trim() && emp.name.trim().toLowerCase() !== "user") {
    return emp.name;
  }
  if (emp.email) return emp.email.split("@")[0];
  return "Employee";
}

function statusClass(kind) {
  if (kind === "extreme-late" || kind === "missing_checkout") return "daily-s-extreme";
  if (kind === "late" || kind === "half_day") return "daily-s-late";
  if (kind === "absent") return "daily-s-absent";
  if (kind === "pending") return "daily-s-pending";
  if (kind === "leave") return "daily-s-leave";
  if (kind === "off") return "daily-s-off";
  return "daily-s-ontime";
}

function DailyAttendance() {
  const todayStr = getLocalDateStr();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [employees, setEmployees] = useState([]);
  const [attByUid, setAttByUid] = useState({});
  const [leavesByUid, setLeavesByUid] = useState({});
  const [corrections, setCorrections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const isToday = selectedDate === todayStr;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [usersSnap, attSnap, leaveSnap, corrSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(query(collection(db, "attendance"), where("date", "==", selectedDate))),
        getDocs(query(collection(db, "leaveRequests"), where("status", "==", "approved"))),
        getDocs(query(collection(db, "attendance_corrections"), where("status", "==", "pending"))).catch(() => ({ docs: [] })),
      ]);

      setEmployees(usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() })));

      const att = {};
      attSnap.docs.forEach((d) => {
        att[d.data().uid] = d.data();
      });
      setAttByUid(att);

      const leaves = {};
      leaveSnap.docs.forEach((d) => {
        const data = d.data();
        (leaves[data.uid] = leaves[data.uid] || []).push(data);
      });
      setLeavesByUid(leaves);

      setCorrections(corrSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      if (err?.name !== "AbortError") {
        setError(err.message || "Could not load attendance.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [selectedDate]);

  const overrideAttendance = async (emp, customStatus = null) => {
    setBusyUid(emp.uid);
    try {
      const dateStr = selectedDate;
      const ref = doc(db, "attendance", `${emp.uid}_${dateStr}`);
      const existing = await getDoc(ref);
      const before = existing.exists() ? existing.data() : null;

      const now = new Date();
      const calc = calculateAttendanceStatus(emp.schedule, now);
      const finalStatus = customStatus || calc.status;

      const record = {
        uid: emp.uid,
        name: displayNameFor(emp),
        department: emp.department || "General",
        date: dateStr,
        month: dateStr.slice(0, 7),
        checkInTime: existing.exists() ? existing.data().checkInTime : serverTimestamp(),
        checkOutTime: existing.exists() ? existing.data().checkOutTime || null : null,
        workedHours: existing.exists() ? existing.data().workedHours || 0 : 0,
        status: finalStatus,
        lateMinutes: finalStatus === "late" ? calc.lateMinutes || 15 : 0,
        markedBy: auth.currentUser?.uid,
        overrideByAdmin: true,
      };

      await setDoc(ref, record, { merge: true });
      await recordAuditLog({
        actorUid: auth.currentUser?.uid,
        actorName: auth.currentUser?.displayName || "Admin/HR",
        actorRole: "admin",
        action: "ATTENDANCE_ADMIN_OVERRIDE",
        entity: "attendance",
        entityId: `${emp.uid}_${dateStr}`,
        before,
        after: { status: finalStatus, date: dateStr },
      });

      setAttByUid((prev) => ({
        ...prev,
        [emp.uid]: {
          ...record,
          checkInTime: before?.checkInTime || Timestamp.fromDate(now),
        },
      }));
    } catch (err) {
      window.alert(err.message || "Could not override attendance.");
    } finally {
      setBusyUid(null);
    }
  };

  const handleCorrectionReview = async (corr, decision) => {
    const comment =
      window.prompt(
        `Optional HR comment for ${decision} correction (${corr.employeeName} on ${corr.date}):`
      ) || "";
    try {
      await reviewAttendanceCorrection({ correction: corr, decision, comment });
      await load();
    } catch (err) {
      window.alert(err.message);
    }
  };

  const weekdayKey = getWeekdayKey(new Date(selectedDate + "T00:00:00"));
  const now = new Date();

  const rows = employees.map((emp) => {
    const record = attByUid[emp.uid];
    const effectiveSchedule = emp.schedule || buildDefaultSchedule();
    const isScheduled = !!effectiveSchedule?.[weekdayKey];
    const onLeave = getApprovedLeaveDates(
      effectiveSchedule,
      leavesByUid[emp.uid] || []
    ).has(selectedDate);

    const base = {
      emp,
      uid: emp.uid,
      name: displayNameFor(emp),
      department: emp.department || "General",
      emergency: emp.emergencyContact || null,
      checkedIn: false,
      time: null,
      checkOut: null,
      workedHours: null,
      early:
        (leavesByUid[emp.uid] || []).find(
          (l) => l.type === "earlyLeave" && l.date === selectedDate
        ) || null,
    };

    if (record) {
      const isMissingCheckout =
        !record.checkOutTime && selectedDate < todayStr && record.status !== "half_day";
      const effStatus = isMissingCheckout ? "missing_checkout" : record.status;
      return {
        ...base,
        checkedIn: true,
        time: formatTime12(record.checkInTime),
        checkOut: record.checkOutTime ? formatTime12(record.checkOutTime) : "-",
        workedHours: record.workedHours ?? 0,
        displayStatus: statusLabel({ ...record, status: effStatus }),
        statusKind: effStatus,
      };
    }

    if (onLeave) {
      return { ...base, displayStatus: "On leave", statusKind: "leave" };
    }

    if (selectedDate > todayStr) {
      return {
        ...base,
        displayStatus: isScheduled ? "Upcoming" : "Day off",
        statusKind: "off",
      };
    }

    if (!isScheduled) {
      return { ...base, displayStatus: "Weekend / Off", statusKind: "off" };
    }

    if (isToday) {
      const st = calculateAttendanceStatus(effectiveSchedule, now);
      if (st.status === "present") {
        return {
          ...base,
          displayStatus: "Not checked in yet",
          statusKind: "pending",
        };
      }
      return {
        ...base,
        displayStatus: `Not in yet (${st.lateMinutes} min past grace)`,
        statusKind: "late",
      };
    }

    return { ...base, displayStatus: "Absent", statusKind: "absent" };
  });

  const exportRows = rows.map((r) => ({
    name: r.name,
    displayStatus: r.displayStatus,
    time: r.time,
    checkOut: r.checkOut,
  }));

  return (
    <div className="daily-page">
      <header className="daily-topbar">
        <div className="daily-identity">
          <div className="daily-avatar">D</div>
          <div className="daily-identity-text">
            <span className="daily-name">Daily Attendance & Corrections</span>
            <span className="daily-pill">Admin / HR Control</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            className="daily-back-btn"
            onClick={() => navigate("/mark-attendance")}
          > My Self Check-In
          </button>
          <button className="daily-back-btn" onClick={() => navigate("/")}>
            <- Back
          </button>
        </div>
      </header>

      <section className="daily-hero">
        <div className="daily-hero-glow" />
        <p className="daily-hero-date">{isToday ? "Today" : selectedDate}</p>
        <h1 className="daily-hero-title">Attendance Sheet & HR Overrides</h1>
        <p className="daily-hero-sub"> Employees check in themselves from their portal. HR/Admin can review statuses, approve correction requests, or override records here.
        </p>
      </section>

      <section className="daily-body">
        {/* Pending Attendance Correction Requests Panel */}
        {corrections.length > 0 && (
          <div
            style={{
              background: "rgba(124, 58, 237, 0.12)",
              border: "1px solid rgba(124, 58, 237, 0.35)",
              borderRadius: "16px",
              padding: "18px",
              marginBottom: "22px",
            }}
          >
            <h3 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "12px", color: "#ddd6fe" }}> Pending Attendance Correction Requests ({corrections.length})
            </h3>
            <div style={{ display: "grid", gap: "10px" }}>
              {corrections.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "10px",
                    background: "rgba(15, 23, 42, 0.85)",
                    padding: "12px 16px",
                    borderRadius: "10px",
                  }}
                >
                  <div>
                    <strong>{c.employeeName}</strong> ({c.department || "General"}) - Date:{" "}
                    <strong>{c.date}</strong> | Requested: {c.requestedCheckIn} to{" "}
                    {c.requestedCheckOut}
                    <div style={{ fontSize: "12.5px", color: "#cbd5e1", marginTop: "3px" }}> Reason: "{c.reason}"
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      className="daily-checkin-btn small"
                      onClick={() => handleCorrectionReview(c, "approved")}
                    > Approve
                    </button>
                    <button
                      onClick={() => handleCorrectionReview(c, "rejected")}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "8px",
                        border: "1px solid rgba(239,68,68,0.4)",
                        background: "rgba(239,68,68,0.15)",
                        color: "#fca5a5",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                    > Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="daily-controls">
          <input
            type="date"
            className="daily-date-input"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value || todayStr)}
          />
          {rows.length > 0 && (
            <div className="daily-export-bar">
              <button
                onClick={() => exportDailyToCSV(exportRows, `daily-attendance-${selectedDate}`)
                }
              > CSV
              </button>
              <button
                onClick={() => exportDailyToExcel(
                    exportRows,
                    `daily-attendance-${selectedDate}`
                  )
                }
              > Excel
              </button>
              <button
                onClick={() => exportDailyToPDF(
                    exportRows,
                    `daily-attendance-${selectedDate}`,
                    selectedDate
                  )
                }
              > PDF
              </button>
              <button onClick={() => printElement("daily-attendance-table")}> Print
              </button>
            </div>
          )}
        </div>

        {error && <p className="daily-error">Error: {error}</p>}

        <div className="daily-card">
          {loading ? (
            <p className="daily-loading">Loading...</p>
          ) : rows.length === 0 ? (
            <p className="daily-loading">No employees found.</p>
          ) : (
            <div id="daily-attendance-table" className="daily-scroll">
              <table className="daily-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Dept</th>
                    <th>Status</th>
                    <th>Check-In</th>
                    <th>Check-Out</th>
                    <th>Hours</th>
                    <th data-no-print>HR Override</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.uid}>
                      <td>{r.name}</td>
                      <td>{r.department}</td>
                      <td className={statusClass(r.statusKind)}>
                        {r.displayStatus}
                        {r.early && (
                          <small className="daily-early-note"> Early leave {formatHM12(r.early.earlyLeaveTime)}
                          </small>
                        )}
                      </td>
                      <td>{r.time || "-"}</td>
                      <td>{r.checkOut || "-"}</td>
                      <td>{r.workedHours !== null ? `${r.workedHours}h` : "-"}</td>
                      <td data-no-print>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          <button
                            className="daily-checkin-btn small"
                            disabled={busyUid === r.uid}
                            onClick={() => overrideAttendance(r.emp, "present")}
                          > Mark Present
                          </button>
                          <button
                            className="daily-checkin-btn small"
                            style={{ background: "rgba(245,158,11,0.25)", color: "#fcd34d" }}
                            disabled={busyUid === r.uid}
                            onClick={() => overrideAttendance(r.emp, "late")}
                          > Late
                          </button>
                          <button
                            className="daily-checkin-btn small"
                            style={{ background: "rgba(59,130,246,0.25)", color: "#93c5fd" }}
                            disabled={busyUid === r.uid}
                            onClick={() => overrideAttendance(r.emp, "half_day")}
                          > Half-Day
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default DailyAttendance;
