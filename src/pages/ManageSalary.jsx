import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import {
  calculateSalaryStats,
  getLocalMonthStr,
} from "../utils/attendanceHelpers";
import {
  exportPayrollToExcel,
  exportPayslipToPDF,
} from "../utils/exportAttendance";
import {
  generatePayrollDraft,
  finalizeAndLockPayroll,
  checkCompanySetup,
} from "../services/hrServer";
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
  const currentMonth = getLocalMonthStr();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [myRole, setMyRole] = useState("employee");
  const [companyName, setCompanyName] = useState("WorkPulse Technologies");
  const [employees, setEmployees] = useState([]);
  const [stats, setStats] = useState({});
  const [payrollDocs, setPayrollDocs] = useState({});
  const [selectedUid, setSelectedUid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  const fetchAll = async () => {
    setLoading(true);
    setError("");
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const [meSnap, setupRes, holidaysSnap] = await Promise.all([
        getDoc(doc(db, "users", uid)),
        checkCompanySetup(),
        getDocs(collection(db, "public_holidays")),
      ]);

      const role = meSnap.exists() ? meSnap.data().role || "employee" : "employee";
      setMyRole(role);
      setCompanyName(setupRes.settings?.companyName || "WorkPulse Technologies");
      const holidays = holidaysSnap.docs.map((d) => d.data());
      const latePenaltyEnabled = setupRes.settings?.latePenaltyEnabled !== false;

      let emps = [];
      if (["admin", "hr"].includes(role)) {
        const usersSnap = await getDocs(collection(db, "users"));
        emps = usersSnap.docs.map((item) => ({
          uid: item.id,
          ...item.data(),
        }));
      } else if (meSnap.exists()) {
        emps = [{ uid, ...meSnap.data() }];
      }

      setEmployees(emps);
      if (emps.length > 0) {
        setSelectedUid((prev) => prev || emps[0].uid);
      }

      // Load existing payroll run docs for selectedMonth
      const pQuery = ["admin", "hr"].includes(role)
        ? query(collection(db, "payrolls"), where("month", "==", selectedMonth))
        : query(
            collection(db, "payrolls"),
            where("uid", "==", uid),
            where("month", "==", selectedMonth)
          );
      const pSnap = await getDocs(pQuery);
      const pMap = {};
      pSnap.docs.forEach((d) => {
        const data = d.data();
        pMap[data.uid] = { id: d.id, ...data };
      });
      setPayrollDocs(pMap);

      const statsMap = {};
      for (const emp of emps) {
        if (pMap[emp.uid] && pMap[emp.uid].status === "locked") {
          statsMap[emp.uid] = pMap[emp.uid];
          continue;
        }

        const [attSnap, leaveSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, "attendance"),
              where("uid", "==", emp.uid),
              where("month", "==", selectedMonth)
            )
          ),
          getDocs(
            query(
              collection(db, "leaveRequests"),
              where("uid", "==", emp.uid),
              where("status", "==", "approved")
            )
          ),
        ]);

        const records = attSnap.docs.map((item) => ({
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
          baseSalary: Number(emp.basicSalary ?? emp.salary) || 0,
          month: selectedMonth,
          approvedLeaves,
          publicHolidays: holidays,
          latePenaltyEnabled,
        });
      }

      setStats(statsMap);
    } catch (err) {
      setError(err.message || "Could not load payroll information.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [selectedMonth]);

  const isMonthLocked = Object.values(payrollDocs).some(
    (p) => p.status === "locked"
  );
  const hasDraft = Object.values(payrollDocs).length > 0;
  const isPrivileged = ["admin", "hr"].includes(myRole);

  const handleFieldChange = (uid, value) => {
    setEmployees((previous) =>
      previous.map((employee) =>
        employee.uid === uid
          ? { ...employee, basicSalary: value, salary: value }
          : employee
      )
    );
  };

  async function saveSalary(uid, salaryValue) {
    if (isMonthLocked) {
      window.alert("This month's payroll is locked and cannot be edited.");
      return;
    }
    const basicSalary = Number(salaryValue);
    if (!Number.isFinite(basicSalary) || basicSalary < 0) {
      window.alert("Enter a valid non-negative Basic Salary.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      await updateDoc(doc(db, "users", uid), {
        basicSalary,
        salary: basicSalary,
        grossSalary: Math.round(basicSalary * 1.5),
      });
      await fetchAll();
      setMessage("Basic Salary & Gross (1.5x) structure updated.");
    } catch (err) {
      setError(err.message || "Could not save basic salary.");
    } finally {
      setSaving(false);
    }
  }

  const handleGenerateDraft = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const draftList = await generatePayrollDraft(selectedMonth);
      await fetchAll();
      setMessage(
        `Draft payroll generated for ${draftList.length} employee(s) for ${selectedMonth}.`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFinalizeLock = async () => {
    if (
      !window.confirm(
        `Finalize and permanently LOCK payroll for ${selectedMonth}? Once locked, records cannot be modified and employees will receive their Payslip notifications.`
      )
    ) {
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await finalizeAndLockPayroll(selectedMonth);
      await fetchAll();
      setMessage(
        `Payroll for ${selectedMonth} is now FINALIZED & LOCKED (${res.count} payslips issued).`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const totalPayroll = employees.reduce(
    (sum, emp) => sum + (stats[emp.uid]?.netSalary ?? 0),
    0
  );

  function handleExportPayroll() {
    const rows = employees.map((emp) => {
      const s = stats[emp.uid] || {};
      return {
        name: displayNameFor(emp),
        department: emp.department || "General",
        basicSalary: s.basicSalary ?? 0,
        allowances: s.allowances ?? 0,
        grossSalary: s.grossSalary ?? 0,
        attendanceDeduction: s.attendanceDeduction ?? 0,
        taxDeduction: s.taxDeduction ?? 0,
        netSalary: s.netSalary ?? 0,
        status: payrollDocs[emp.uid]?.status || "draft",
        method: emp.bankDetails?.method || "—",
        providerName: emp.bankDetails?.providerName || "—",
        accountTitle: emp.bankDetails?.accountTitle || "—",
        accountNumber: emp.bankDetails?.accountNumber || "—",
        iban: emp.bankDetails?.iban || "",
      };
    });

    exportPayrollToExcel(rows, `payroll-${selectedMonth}`);
  }

  const selectedEmp = employees.find((emp) => emp.uid === selectedUid);
  const selectedStats = stats[selectedUid] || {};
  const selectedPayrollDoc = payrollDocs[selectedUid] || null;

  const handleDownloadPayslipPdf = () => {
    if (!selectedEmp) return;
    exportPayslipToPDF(
      {
        employeeName: displayNameFor(selectedEmp),
        department: selectedEmp.department || "General",
        designation: selectedEmp.designation || "Staff",
        month: selectedMonth,
        status: selectedPayrollDoc?.status || "draft",
        providerName: selectedEmp.bankDetails?.providerName || "Bank",
        accountNumber: selectedEmp.bankDetails?.accountNumber || "—",
        ...selectedStats,
      },
      companyName
    );
  };

  return (
    <div className="salary-page">
      <header className="salary-topbar">
        <div className="salary-identity">
          <div className="salary-avatar">₨</div>
          <div className="salary-identity-text">
            <span className="salary-name">
              {isPrivileged ? "Payroll Engine & Payslips" : "My Monthly Payslips"}
            </span>
            <span className="salary-month-pill">
              {selectedMonth} ·{" "}
              {isMonthLocked ? "🔒 LOCKED" : hasDraft ? "DRAFT" : "LIVE PREVIEW"}
            </span>
          </div>
        </div>

        <button className="salary-back-btn" onClick={() => navigate("/")}>
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
        <p className="salary-hero-date">
          Formula: Gross = 1.5 × Basic · Progressive Tax Slabs · Absent / Unpaid / Half-Day / 3-Lates Penalty
        </p>
        <h1 className="salary-hero-title">
          {isPrivileged ? `Total Net Payroll (${selectedMonth})` : `My Net Pay (${selectedMonth})`}
        </h1>

        <p className="salary-hero-amount">Rs. {totalPayroll.toLocaleString()}</p>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            marginTop: "14px",
          }}
        >
          <input
            type="month"
            value={selectedMonth}
            max={currentMonth}
            onChange={(e) => setSelectedMonth(e.target.value || currentMonth)}
            style={{
              padding: "9px 14px",
              borderRadius: "10px",
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(15, 23, 42, 0.9)",
              color: "#fff",
            }}
          />

          {isPrivileged && !isMonthLocked && (
            <button
              className="salary-payroll-export-btn"
              disabled={saving}
              onClick={handleGenerateDraft}
            >
              {saving ? "Running..." : "1. Generate / Refresh Draft"}
            </button>
          )}

          {myRole === "admin" && !isMonthLocked && (
            <button
              className="salary-payroll-export-btn"
              style={{
                background: "linear-gradient(135deg, #10b981, #059669)",
                borderColor: "transparent",
              }}
              disabled={saving}
              onClick={handleFinalizeLock}
            >
              🔒 2. Finalize & Lock Month
            </button>
          )}

          {isPrivileged && employees.length > 0 && (
            <button
              className="salary-payroll-export-btn"
              onClick={handleExportPayroll}
            >
              Export Payroll Excel
            </button>
          )}
        </div>
      </section>

      <section className="salary-body">
        {error && (
          <p
            role="alert"
            style={{
              background: "rgba(239,68,68,0.16)",
              border: "1px solid rgba(239,68,68,0.4)",
              color: "#fca5a5",
              padding: "12px",
              borderRadius: "10px",
            }}
          >
            {error}
          </p>
        )}
        {message && (
          <p
            style={{
              background: "rgba(16,185,129,0.16)",
              border: "1px solid rgba(16,185,129,0.4)",
              color: "#6ee7b7",
              padding: "12px",
              borderRadius: "10px",
            }}
          >
            {message}
          </p>
        )}

        {loading ? (
          <p className="salary-loading">Calculating server payroll...</p>
        ) : employees.length === 0 ? (
          <p className="salary-loading">No employees found.</p>
        ) : (
          <>
            {isPrivileged && (
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
            )}

            {selectedEmp && (
              <div className="salary-card">
                <div className="salary-card-header">
                  <div>
                    <span className="salary-emp-name">
                      {displayNameFor(selectedEmp)}
                    </span>
                    <div style={{ fontSize: "12px", color: "#a78bfa" }}>
                      {selectedEmp.department || "General"} —{" "}
                      {selectedEmp.designation || "Staff"} · Status:{" "}
                      <strong>
                        {(selectedPayrollDoc?.status || "draft").toUpperCase()}
                      </strong>
                    </div>
                  </div>

                  <span className="salary-emp-stats">
                    Present: {selectedStats.presentCount ?? 0} · Late:{" "}
                    {selectedStats.lateCount ?? 0} · Half-Day:{" "}
                    {selectedStats.halfDayCount ?? 0} · Absent:{" "}
                    {selectedStats.absentCount ?? 0}
                  </span>
                </div>

                <div className="salary-breakdown">
                  <div className="salary-breakdown-row">
                    <span>Basic Salary</span>
                    <span>
                      Rs. {(selectedStats.basicSalary ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="salary-breakdown-row">
                    <span>
                      Allowances (HRA 30% + Medical 10% + Conveyance 10%)
                    </span>
                    <span>
                      + Rs. {(selectedStats.allowances ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="salary-breakdown-row">
                    <strong>Gross Salary (1.5 × Basic)</strong>
                    <strong>
                      Rs. {(selectedStats.grossSalary ?? 0).toLocaleString()}
                    </strong>
                  </div>
                  <div className="salary-breakdown-row">
                    <span>
                      Working Days in Month / Per-Day Rate
                    </span>
                    <span>
                      {selectedStats.workingDaysInMonth ?? 22} days · Rs.{" "}
                      {(selectedStats.perDayRate ?? 0).toLocaleString()}/day
                    </span>
                  </div>
                  <div className="salary-breakdown-row">
                    <span>
                      Paid Leave / Unpaid Leave Days
                    </span>
                    <span>
                      {selectedStats.paidLeaveCount ?? 0} paid /{" "}
                      {selectedStats.unpaidLeaveCount ?? 0} unpaid
                    </span>
                  </div>
                  <div className="salary-breakdown-row">
                    <span>
                      Deductible Days (Absent + Unpaid + Half-Days + 3-Lates Penalty)
                    </span>
                    <span>{selectedStats.deductibleOffs ?? 0} days</span>
                  </div>
                  <div className="salary-breakdown-row">
                    <span>Attendance & Leave Deduction</span>
                    <span style={{ color: "#fca5a5" }}>
                      - Rs.{" "}
                      {(selectedStats.attendanceDeduction ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="salary-breakdown-row">
                    <span>Income Tax (Progressive FBR Slab)</span>
                    <span style={{ color: "#fca5a5" }}>
                      - Rs. {(selectedStats.taxDeduction ?? 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                {isPrivileged && !isMonthLocked && (
                  <div className="salary-fields">
                    <label>
                      Update Basic Salary (PKR)
                      <input
                        type="number"
                        min="0"
                        value={
                          selectedEmp.basicSalary ?? selectedEmp.salary ?? ""
                        }
                        onChange={(event) =>
                          handleFieldChange(
                            selectedEmp.uid,
                            event.target.value
                          )
                        }
                      />
                    </label>
                  </div>
                )}

                <div className="salary-net-row">
                  <span>Net Payable Salary ({selectedMonth}):</span>
                  <span className="salary-net-amount">
                    Rs. {(selectedStats.netSalary ?? 0).toLocaleString()}
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    flexWrap: "wrap",
                    marginTop: "12px",
                  }}
                >
                  <button
                    type="button"
                    className="salary-save-btn"
                    style={{
                      flex: 1,
                      background: "linear-gradient(135deg, #10b981, #059669)",
                    }}
                    onClick={handleDownloadPayslipPdf}
                  >
                    📄 Download Official Payslip PDF
                  </button>

                  {isPrivileged && !isMonthLocked && (
                    <button
                      type="button"
                      className="salary-save-btn"
                      style={{ flex: 1 }}
                      disabled={saving}
                      onClick={() =>
                        saveSalary(
                          selectedEmp.uid,
                          selectedEmp.basicSalary ?? selectedEmp.salary
                        )
                      }
                    >
                      {saving ? "Saving..." : "Save Basic Salary"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default ManageSalary;
