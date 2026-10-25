import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import {
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  calculateAttendanceStatus,
  parseDateValue,
} from "../utils/attendanceHelpers";
import { recordAuditLog } from "../services/hrServer";
import "./css/ManageSchedule.css";

function ManageSchedule() {
  const [employees, setEmployees] = useState([]);
  const [selectedUid, setSelectedUid] = useState(null);
  const [selectedName, setSelectedName] = useState("");
  const [schedule, setSchedule] = useState({});
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchEmployees = async () => {
      const snap = await getDocs(collection(db, "users"));
      setEmployees(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
    };
    fetchEmployees();
  }, []);

  const selectEmployee = (emp) => {
    setSelectedUid(emp.uid);
    setSelectedName(emp.name);
    setSchedule(
      emp.schedule || {
        sun: "",
        mon: "09:00",
        tue: "09:00",
        wed: "09:00",
        thu: "09:00",
        fri: "09:00",
        sat: "",
      }
    );
  };

  const handleTimeChange = (dayKey, value) => {
    setSchedule((prev) => ({ ...prev, [dayKey]: value }));
  };

  const toggleDayOff = (dayKey) => {
    setSchedule((prev) => ({ ...prev, [dayKey]: prev[dayKey] ? "" : "09:00" }));
  };

  const saveSchedule = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", selectedUid), { schedule });

      const attQ = query(
        collection(db, "attendance"),
        where("uid", "==", selectedUid)
      );
      const attSnap = await getDocs(attQ);

      if (!attSnap.empty) {
        const batch = writeBatch(db);

        attSnap.docs.forEach((docSnap) => {
          const record = docSnap.data();
          const checkInDate = parseDateValue(record.checkInTime);
          if (!checkInDate) return;
          const { status, lateMinutes } = calculateAttendanceStatus(
            schedule,
            checkInDate
          );

          batch.update(docSnap.ref, { status, lateMinutes });
        });

        await batch.commit();
      }

      await recordAuditLog({
        actorUid: auth.currentUser?.uid,
        actorName: auth.currentUser?.displayName || "Admin/HR",
        actorRole: "admin",
        action: "EMPLOYEE_SCHEDULE_UPDATED",
        entity: "users",
        entityId: selectedUid,
        before: null,
        after: { employee: selectedName, schedule },
      });

      alert("Schedule saved - past attendance statuses updated");
    } catch (error) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sched-page">
      <header className="sched-topbar">
        <div className="sched-identity">
          <div className="sched-avatar">S</div>
          <div className="sched-identity-text">
            <span className="sched-name">Manage Schedule</span>
            <span className="sched-role-pill">Admin / HR</span>
          </div>
        </div>
        <button className="sched-back-btn" onClick={() => navigate("/")}>
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

      <section className="sched-hero">
        <div className="sched-hero-glow" />
        <p className="sched-hero-date">Weekly check-in times</p>
        <h1 className="sched-hero-title">Set each employee's schedule</h1>
        <p className="sched-hero-sub"> Pick who to configure, then set their expected time for every working day.
        </p>
      </section>

      <section className="sched-body">
        <div className="sched-emp-list">
          {employees.length === 0 && (
            <p className="sched-empty">No employees found yet.</p>
          )}
          {employees.map((emp) => (
            <button
              key={emp.uid}
              className={`sched-emp-chip ${selectedUid === emp.uid ? "active" : ""}`}
              onClick={() => selectEmployee(emp)}
            >
              <span className="sched-emp-avatar">
                {(emp.name || "U").charAt(0).toUpperCase()}
              </span>
              {emp.name}
            </button>
          ))}
        </div>

        {selectedUid && (
          <div className="sched-card">
            <div className="sched-card-header">
              <span className="sched-card-title">{selectedName}'s week</span>
              <span className="sched-card-hint"> Toggle a day off, or set its check-in time
              </span>
            </div>

            <div className="sched-days">
              {WEEKDAY_KEYS.map((dayKey) => {
                const isOff = !schedule[dayKey];
                return (
                  <div
                    className={`sched-day-row ${isOff ? "is-off" : ""}`}
                    key={dayKey}
                  >
                    <span className="sched-day-label">
                      {WEEKDAY_LABELS[dayKey]}
                    </span>

                    {isOff ? (
                      <span className="sched-off-tag">Day off</span>
                    ) : (
                      <input
                        type="time"
                        className="sched-time-input"
                        value={schedule[dayKey]}
                        onChange={(e) => handleTimeChange(dayKey, e.target.value)}
                      />
                    )}

                    <button
                      type="button"
                      className="sched-toggle-btn"
                      onClick={() => toggleDayOff(dayKey)}
                    >
                      {isOff ? "Set time" : "Mark off"}
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              className="sched-save-btn"
              onClick={saveSchedule}
              disabled={saving}
            >
              {saving ? "Saving & updating records..." : "Save Schedule"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export default ManageSchedule;
