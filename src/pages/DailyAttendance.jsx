import { useEffect, useState } from "react";
import {
  collection, query, where, getDocs, getDoc, setDoc, doc, serverTimestamp, Timestamp,
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
} from "../utils/attendanceHelpers";
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
  if (kind === "extreme-late") return "daily-s-extreme";
  if (kind === "late") return "daily-s-late";
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
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const myUid = auth.currentUser?.uid;
  const isToday = selectedDate === todayStr;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [usersSnap, attSnap, leaveSnap] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(query(collection(db, "attendance"), where("date", "==", selectedDate))),
          getDocs(query(collection(db, "leaveRequests"), where("status", "==", "approved"))),
        ]);
        if (cancelled) return;

        setEmployees(usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() })));

        const att = {};
        attSnap.docs.forEach((d) => { att[d.data().uid] = d.data(); });
        setAttByUid(att);

        const leaves = {};
        leaveSnap.docs.forEach((d) => {
          const data = d.data();
          (leaves[data.uid] = leaves[data.uid] || []).push(data);
        });
        setLeavesByUid(leaves);
      } catch (err) {
        if (err?.name !== "AbortError" && !cancelled) {
          setError(err.message || "Could not load attendance.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [selectedDate]);

  const markAttendance = async (emp) => {
    if (!isToday) return;
    setBusyUid(emp.uid);

    try {
      const dateStr = getLocalDateStr();
      const ref = doc(db, "attendance", `${emp.uid}_${dateStr}`);

      const existing = await getDoc(ref);
      if (existing.exists() || attByUid[emp.uid]) {
        window.alert("Is employee ki attendance pehle se lagi hui hai.");
        return;
      }

      const now = new Date();
      const { status, lateMinutes } = calculateAttendanceStatus(emp.schedule, now);

      const record = {
        uid: emp.uid,
        name: displayNameFor(emp),
        date: dateStr,
        month: getLocalMonthStr(),
        checkInTime: serverTimestamp(),
        status,
        lateMinutes,
        markedBy: auth.currentUser.uid,
      };

      await setDoc(ref, record);

      setAttByUid((prev) => ({
        ...prev,
        [emp.uid]: { ...record, checkInTime: Timestamp.fromDate(now) },
      }));
    } catch (err) {
      window.alert(err.message || "Attendance nahi lagi.");
    } finally {
      setBusyUid(null);
    }
  };

  // ---- Rows banao ----
  const weekdayKey = getWeekdayKey(new Date(selectedDate + "T00:00:00"));
  const now = new Date();

  const rows = employees.map((emp) => {
    const record = attByUid[emp.uid];
    const isScheduled = !!emp.schedule?.[weekdayKey];
    const onLeave = getApprovedLeaveDates(emp.schedule, leavesByUid[emp.uid] || []).has(selectedDate);

    const base = {
      emp,
      uid: emp.uid,
      name: displayNameFor(emp),
      emergency: emp.emergencyContact || null,
      isMe: emp.uid === myUid,
      checkedIn: false,
      time: null,
      early: (leavesByUid[emp.uid] || []).find(
        (l) => l.type === "earlyLeave" && l.date === selectedDate
      ) || null,
    };

    if (record) {
      return {
        ...base,
        checkedIn: true,
        time: formatTime12(record.checkInTime),
        displayStatus: statusLabel(record),
        statusKind: record.status,
      };
    }

    if (onLeave) {
      return { ...base, displayStatus: "On leave", statusKind: "leave" };
    }

    if (selectedDate > todayStr) {
      return { ...base, displayStatus: isScheduled ? "Upcoming" : "Day off", statusKind: "off" };
    }

    if (!isScheduled) {
      return { ...base, displayStatus: "Day off", statusKind: "off" };
    }

    if (isToday) {
      const st = calculateAttendanceStatus(emp.schedule, now);
      if (st.status === "on-time") {
        return { ...base, displayStatus: "Not checked in yet", statusKind: "pending" };
      }
      return {
        ...base,
        displayStatus: `Not in yet (${st.lateMinutes} min past grace)`,
        statusKind: st.status === "extreme-late" ? "extreme-late" : "late",
      };
    }

    return { ...base, displayStatus: "Absent", statusKind: "absent" };
  });

  const me = rows.find((r) => r.isMe);
  const others = rows.filter((r) => !r.isMe);
  const myCheckedIn = !!me?.checkedIn;

  const showContact = (r) =>
    !r.checkedIn &&
    ["absent", "late", "extreme-late"].includes(r.statusKind) &&
    r.emergency?.phone;

  const exportRows = rows.map((r) => ({
    name: r.name,
    displayStatus: r.displayStatus,
    time: r.time,
  }));

  return (
    <div className="daily-page">
      <header className="daily-topbar">
        <div className="daily-identity">
          <div className="daily-avatar">D</div>
          <div className="daily-identity-text">
            <span className="daily-name">Daily Attendance</span>
            <span className="daily-pill">Admin check-in</span>
          </div>
        </div>
        <button className="daily-back-btn" onClick={() => navigate("/")}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
      </header>

      <section className="daily-hero">
        <div className="daily-hero-glow" />
        <p className="daily-hero-date">{isToday ? "Today" : selectedDate}</p>
        <h1 className="daily-hero-title">Mark and review attendance</h1>
        <p className="daily-hero-sub">
          Pehle apna check-in karo, phir har employee ko aate hi mark karo.
        </p>
      </section>

      <section className="daily-body">
        {me && (
          <div className="daily-me-card">
            <div>
              <p className="daily-me-label">Your check-in</p>
              <p className={`daily-me-status ${statusClass(me.statusKind)}`}>
                {me.checkedIn
                  ? `${me.displayStatus} · ${me.time}`
                  : isToday
                    ? "Not checked in yet"
                    : me.displayStatus}
              </p>
            </div>
            {isToday && !me.checkedIn && (
              <button
                className="daily-checkin-btn"
                disabled={busyUid === me.uid}
                onClick={() => markAttendance(me.emp)}
              >
                {busyUid === me.uid ? "Saving..." : "Check in"}
              </button>
            )}
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
              <button onClick={() => exportDailyToCSV(exportRows, `daily-attendance-${selectedDate}`)}>CSV</button>
              <button onClick={() => exportDailyToExcel(exportRows, `daily-attendance-${selectedDate}`)}>Excel</button>
              <button onClick={() => exportDailyToPDF(exportRows, `daily-attendance-${selectedDate}`, selectedDate)}>PDF</button>
              <button onClick={() => printElement("daily-attendance-table")}>Print</button>
            </div>
          )}
        </div>

        {isToday && me && !myCheckedIn && (
          <p className="daily-hint">Employees ke buttons tab chalenge jab tum apna check-in kar loge.</p>
        )}
        {!isToday && (
          <p className="daily-hint">Purani ya aane wali date sirf dekhne ke liye hai. Check-in sirf aaj ke din hota hai.</p>
        )}

        {error && <p className="daily-error">Error: {error}</p>}

        <div className="daily-card">
          {loading ? (
            <p className="daily-loading">Loading...</p>
          ) : others.length === 0 ? (
            <p className="daily-loading">Koi aur user nahi mila.</p>
          ) : (
            <div id="daily-attendance-table" className="daily-scroll">
              <table className="daily-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Status</th>
                    <th>Check-in Time</th>
                    <th>Emergency Contact</th>
                    {isToday && <th data-no-print>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {others.map((r) => (
                    <tr key={r.uid}>
                      <td>{r.name}</td>
                      <td className={statusClass(r.statusKind)}>
                        {r.displayStatus}
                        {r.early && (
                          <small className="daily-early-note">
                            Early leave {formatHM12(r.early.earlyLeaveTime)}
                          </small>
                        )}
                      </td>
                      <td>{r.time || "—"}</td>
                      <td>
                        {showContact(r) ? (
                          <a className="daily-contact-link" href={`tel:${r.emergency.phone}`}>
                            {r.emergency.name} ({r.emergency.relation}) · {r.emergency.phone}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      {isToday && (
                        <td data-no-print>
                          {r.checkedIn ? (
                            <span className="daily-done">Marked</span>
                          ) : (
                            <button
                              className="daily-checkin-btn small"
                              disabled={!myCheckedIn || busyUid === r.uid}
                              title={!myCheckedIn ? "Pehle apna check-in karo" : ""}
                              onClick={() => markAttendance(r.emp)}
                            >
                              {busyUid === r.uid ? "Saving..." : "Check in"}
                            </button>
                          )}
                        </td>
                      )}
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