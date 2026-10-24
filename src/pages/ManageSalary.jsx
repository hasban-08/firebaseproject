
import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate } from "react-router-dom";
import {
  calculateSalaryStats,
  getLocalMonthStr,
} from "../utils/attendanceHelpers";
import { exportPayrollToExcel } from "../utils/exportAttendance";
import "./css/ManageSalary.css";

function displayNameFor(emp) {
  if (
    emp.name &&
    emp.name.trim() &&
    emp.name.trim().toLowerCase() !== "user"
  ) {
    return emp.name;
  }

  if (emp.fullName?.trim()) return emp.fullName;
  if (emp.email) return emp.email.split("@")[0];

  return "Employee";
}

function ManageSalary() {
  const [employees, setEmployees] = useState([]);
  const [stats, setStats] = useState({});
  const [selectedUid, setSelectedUid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const currentMonth = getLocalMonthStr();

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      setLoading(true);
      setError("");

      try {
        const usersSnap = await getDocs(collection(db, "users"));
        const emps = usersSnap.docs.map((item) => ({
          uid: item.id,
          ...item.data(),
        }));

        if (cancelled) return;

        setEmployees(emps);

        if (emps.length > 0) {
          setSelectedUid((previous) => previous || emps[0].uid);
        }

        const statsMap = {};

        for (const emp of emps) {
          const attendanceQuery = query(
            collection(db, "attendance"),
            where("uid", "==", emp.uid),
            where("month", "==", currentMonth),
            orderBy("date", "asc")
          );

          const leaveQuery = query(
            collection(db, "leaveRequests"),
            where("uid", "==", emp.uid),
            where("status", "==", "approved")
          );

          const [attendanceSnap, leaveSnap] = await Promise.all([
            getDocs(attendanceQuery),
            getDocs(leaveQuery),
          ]);

          const records = attendanceSnap.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }));

          const approvedLeaves = leaveSnap.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }));

          statsMap[emp.uid] = calculateSalaryStats({
            records,
            schedule: emp.schedule,
            baseSalary: Number(emp.salary) || 0,
            month: currentMonth,
            approvedLeaves,
          });
        }

        if (!cancelled) setStats(statsMap);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Could not load salary information.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();

    return () => {
      cancelled = true;
    };
  }, [currentMonth]);

  const handleFieldChange = (uid, value) => {
    setEmployees((previous) =>
      previous.map((employee) =>
        employee.uid === uid
          ? { ...employee, salary: value }
          : employee
      )
    );
  };

  async function saveSalary(uid, salary) {
    const baseSalary = Number(salary);

    if (!Number.isFinite(baseSalary) || baseSalary < 0) {
      window.alert("Enter a valid non-negative salary.");
      return;
    }

    setSaving(true);

    try {
      await updateDoc(doc(db, "users", uid), {
        salary: baseSalary,
      });

      setEmployees((previous) =>
        previous.map((employee) =>
          employee.uid === uid
            ? { ...employee, salary: baseSalary }
            : employee
        )
      );

      setStats((previous) => ({
        ...previous,
        [uid]: {
          ...previous[uid],
          netSalary: Math.max(
            baseSalary - (previous[uid]?.deduction || 0),
            0
          ),
          perDayRate:
            previous[uid]?.workingDaysInMonth > 0
              ? baseSalary / previous[uid].workingDaysInMonth
              : 0,
          deduction:
            previous[uid]?.workingDaysInMonth > 0
              ? (previous[uid]?.deductibleOffs || 0) *
                (baseSalary / previous[uid].workingDaysInMonth)
              : 0,
        },
      }));

      window.alert("Base salary saved.");
    } catch (err) {
      window.alert(err.message || "Could not save base salary.");
    } finally {
      setSaving(false);
    }
  }

  const totalPayroll = employees.reduce(
    (sum, employee) =>
      sum + (stats[employee.uid]?.netSalary ?? 0),
    0
  );

  function handleExportPayroll() {
    const rows = employees.map((employee) => ({
      name: displayNameFor(employee),
      netSalary: stats[employee.uid]?.netSalary ?? 0,
      method: employee.bankDetails?.method || "—",
      providerName: employee.bankDetails?.providerName || "—",
      accountTitle: employee.bankDetails?.accountTitle || "—",
      accountNumber: employee.bankDetails?.accountNumber || "—",
      iban: employee.bankDetails?.iban || "",
    }));

    exportPayrollToExcel(rows, `payroll-${currentMonth}`);
  }

  const selectedEmp = employees.find(
    (employee) => employee.uid === selectedUid
  );

  const selectedStats = stats[selectedUid] || {};

  return (
    <div className="salary-page">
      <header className="salary-topbar">
        <div className="salary-identity">
          <div className="salary-avatar">₨</div>

          <div className="salary-identity-text">
            <span className="salary-name">Manage Salaries</span>
            <span className="salary-month-pill">{currentMonth}</span>
          </div>
        </div>

        <button
          className="salary-back-btn"
          onClick={() => navigate("/")}
        >
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

      <section className="salary-hero">
        <div className="salary-hero-glow" />
        <p className="salary-hero-date">Payroll for {currentMonth}</p>
        <h1 className="salary-hero-title">Total this month</h1>

        <p className="salary-hero-amount">
          Rs. {totalPayroll.toLocaleString()}
        </p>

        <p className="salary-hero-sub">
          Across {employees.length}{" "}
          {employees.length === 1 ? "person" : "people"}, based on attendance
          and approved leave.
        </p>

        {employees.length > 0 && (
          <button
            className="salary-payroll-export-btn"
            onClick={handleExportPayroll}
          >
            Export Full Payroll (with bank details)
          </button>
        )}
      </section>

      <section className="salary-body">
        {error && <p role="alert">{error}</p>}

        {loading ? (
          <p className="salary-loading">Loading...</p>
        ) : employees.length === 0 ? (
          <p className="salary-loading">No employees found yet.</p>
        ) : (
          <>
            <div className="salary-emp-list">
              {employees.map((employee) => (
                <button
                  key={employee.uid}
                  className={`salary-chip ${
                    selectedUid === employee.uid ? "active" : ""
                  }`}
                  onClick={() => setSelectedUid(employee.uid)}
                >
                  <span className="salary-chip-avatar">
                    {displayNameFor(employee).charAt(0).toUpperCase()}
                  </span>
                  {displayNameFor(employee)}
                </button>
              ))}
            </div>

            {selectedEmp && (
              <div className="salary-card">
                <div className="salary-card-header">
                  <span className="salary-emp-name">
                    {displayNameFor(selectedEmp)}
                  </span>

                  <span className="salary-emp-stats">
                    Present: {selectedStats.presentCount ?? 0} · Late:{" "}
                    {selectedStats.lateCount ?? 0} · Extreme Late:{" "}
                    {selectedStats.extremeLateCount ?? 0} · Absent:{" "}
                    {selectedStats.absentCount ?? 0}
                  </span>
                </div>

                <div className="salary-breakdown">
                  <div className="salary-breakdown-row">
                    <span>Approved leave days</span>
                    <span>{selectedStats.approvedLeaveCount ?? 0}</span>
                  </div>

                  <div className="salary-breakdown-row">
                    <span>Off-equivalents this month</span>
                    <span>{selectedStats.offEquivalents ?? 0}</span>
                  </div>

                  <div className="salary-breakdown-row">
                    <span>Free offs allowed</span>
                    <span>2</span>
                  </div>

                  <div className="salary-breakdown-row">
                    <span>Deductible offs</span>
                    <span>{selectedStats.deductibleOffs ?? 0}</span>
                  </div>

                  <div className="salary-breakdown-row">
                    <span>Per-day rate</span>
                    <span>
                      Rs. {(selectedStats.perDayRate ?? 0).toFixed(0)}
                    </span>
                  </div>

                  <div className="salary-breakdown-row">
                    <span>Total deduction</span>
                    <span>
                      Rs. {(selectedStats.deduction ?? 0).toFixed(0)}
                    </span>
                  </div>
                </div>

                <div className="salary-fields">
                  <label>
                    Base Salary
                    <input
                      type="number"
                      min="0"
                      value={selectedEmp.salary ?? ""}
                      onChange={(event) =>
                        handleFieldChange(
                          selectedEmp.uid,
                          event.target.value
                        )
                      }
                    />
                  </label>
                </div>

                <div className="salary-net-row">
                  <span>Salary so far this month:</span>
                  <span className="salary-net-amount">
                    Rs. {(selectedStats.netSalary ?? 0).toLocaleString()}
                  </span>
                </div>

                <button
                  className="salary-save-btn"
                  disabled={saving}
                  onClick={() =>
                    saveSalary(selectedEmp.uid, selectedEmp.salary)
                  }
                >
                  {saving ? "Saving..." : "Save Base Salary"}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default ManageSalary;
