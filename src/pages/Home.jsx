import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
  limit,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import {
  AttendanceTrendChart,
  DepartmentAbsenteeismChart,
} from "../components/AnalyticsCharts";
import {
  getLocalDateStr,
  formatTime12,
  statusLabel,
} from "../utils/attendanceHelpers";
import {
  exportDirectoryToCSV,
  exportDirectoryToExcel,
  exportDirectoryToPDF,
  exportPayslipToPDF,
  printElement,
} from "../utils/exportAttendance";
import {
  computeDashboardAnalytics,
  askHrAiAssistant,
  selfCheckIn,
  selfCheckOut,
  recordAuditLog,
} from "../services/hrServer";
import "./css/Home.css";

function displayNameFor(emp) {
  if (emp.name && emp.name.trim() && emp.name.trim().toLowerCase() !== "user") {
    return emp.name;
  }
  if (emp.email) return emp.email.split("@")[0];
  return "Employee";
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function Home() {
  const [userData, setUserData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [employees, setEmployees] = useState([]);
  const [empLoading, setEmpLoading] = useState(true);

  // Analytics & Filters State
  const todayStr = getLocalDateStr();
  const defaultStart = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 13);
    return getLocalDateStr(d);
  })();
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(todayStr);
  const [selectedDept, setSelectedDept] = useState("ALL");
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  // AI Dashboard Summary State
  const [aiSummary, setAiSummary] = useState("");
  const [aiSummarizing, setAiSummarizing] = useState(false);

  // Announcements & Notifications
  const [announcements, setAnnouncements] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [checkBusy, setCheckBusy] = useState(false);
  const [actionAlert, setActionAlert] = useState("");

  const navigate = useNavigate();
  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const loadUserAndComms = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        setUserData({ uid, ...snap.data() });
      } else {
        setUserData({
          uid,
          name: auth.currentUser.displayName || "Employee",
          email: auth.currentUser.email,
          role: "employee",
          department: "General",
        });
      }

      const [annSnap, notifSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, "announcements"),
            orderBy("createdAt", "desc"),
            limit(5)
          )
        ),
        getDocs(
          query(collection(db, "notifications"), where("uid", "==", uid))
        ),
      ]);

      setAnnouncements(annSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setNotifications(
        notifSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort(
            (a, b) =>
              (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
          )
      );
    } catch (err) {
      if (err?.name !== "AbortError") {
        setLoadError(err.message || "Could not load dashboard.");
      }
    }
  };

  const loadAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const data = await computeDashboardAnalytics({
        startDate,
        endDate,
        department: selectedDept,
      });
      setAnalytics(data);
    } catch (err) {
      console.error("Analytics error:", err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    loadUserAndComms();
  }, []);

  useEffect(() => {
    if (!userData) return;
    loadAnalytics();

    if (["admin", "hr"].includes(userData.role)) {
      setEmpLoading(true);
      getDocs(collection(db, "users"))
        .then((snap) => {
          setEmployees(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
        })
        .finally(() => setEmpLoading(false));
    }
  }, [userData, startDate, endDate, selectedDept]);

  const handleSummarizeDashboard = async () => {
    if (!analytics) return;
    setAiSummarizing(true);
    try {
      const res = await askHrAiAssistant({
        mode: "summarize",
        message: "Summarize the current HR dashboard metrics in 3 to 5 bullet points.",
        dashboardData: analytics,
      });
      setAiSummary(res.reply);
    } catch (err) {
      setActionAlert(err.message || "AI summary failed.");
    } finally {
      setAiSummarizing(false);
    }
  };

  const handleQuickCheckIn = async () => {
    setCheckBusy(true);
    setActionAlert("");
    try {
      await selfCheckIn();
      await loadAnalytics();
      setActionAlert("✓ Checked in! Official server timestamp recorded.");
    } catch (err) {
      setActionAlert(err.message);
    } finally {
      setCheckBusy(false);
    }
  };

  const handleQuickCheckOut = async () => {
    setCheckBusy(true);
    setActionAlert("");
    try {
      const res = await selfCheckOut();
      await loadAnalytics();
      setActionAlert(`✓ Checked out! Total worked hours: ${res.workedHours}h.`);
    } catch (err) {
      setActionAlert(err.message);
    } finally {
      setCheckBusy(false);
    }
  };

  const handleAddNotice = async () => {
    const msg = window.prompt("Enter announcement message for the company:");
    if (!msg || !msg.trim()) return;
    try {
      const newNotice = {
        message: msg.trim(),
        author: userData.name || "HR / Admin",
        authorRole: userData.role || "admin",
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, "announcements"), newNotice);
      await recordAuditLog({
        actorUid: userData.uid,
        actorName: userData.name,
        actorRole: userData.role,
        action: "ANNOUNCEMENT_POSTED",
        entity: "announcements",
        entityId: ref.id,
        before: null,
        after: { message: msg.trim() },
      });
      setAnnouncements([
        {
          id: ref.id,
          ...newNotice,
          createdAt: { toDate: () => new Date() },
        },
        ...announcements,
      ]);
    } catch (err) {
      window.alert("Error posting announcement: " + err.message);
    }
  };

  const markNotifRead = async (notif) => {
    if (!notif.read) {
      await updateDoc(doc(db, "notifications", notif.id), {
        read: true,
        readAt: serverTimestamp(),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
      );
    }
    if (notif.link) navigate(notif.link);
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  if (!userData) {
    return (
      <div
        className="home-layout"
        style={{ justifyContent: "center", alignItems: "center" }}
      >
        <p style={{ color: "rgba(240, 238, 255, 0.5)" }}>
          {loadError || "Loading dashboard..."}
        </p>
      </div>
    );
  }

  const role = userData.role || "employee";
  const isAdmin = role === "admin";
  const isHR = role === "hr";
  const isPrivileged = isAdmin || isHR;
  const initial = (userData.name || "U").charAt(0).toUpperCase();
  const unreadNotifs = notifications.filter((n) => !n.read).length;

  const kpis = analytics?.kpis || {
    headcount: employees.length || 1,
    presentToday: 0,
    onLeaveToday: 0,
    lateToday: 0,
    pendingApprovals: 0,
  };
  const personal = analytics?.employeePersonal || {
    hoursThisWeek: 0,
    weeklyTargetHours: 40,
    leaveBalances: {},
    latestPayslip: null,
    todayRecord: null,
  };

  return (
    <div className="home-layout">
      {/* ── SIDEBAR (3 Roles: Admin, HR, Employee) ── */}
      <aside className="home-sidebar">
        <div className="home-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          WorkPulse
        </div>
        <nav className="home-nav">
          <p className="home-nav-heading">Employee Portal</p>
          <button
            className="home-nav-btn active"
            onClick={() => navigate("/")}
          >
            Dashboard
          </button>
          <button
            className="home-nav-btn"
            onClick={() => navigate("/mark-attendance")}
          >
            Self Check-In / Out
          </button>
          <button
            className="home-nav-btn"
            onClick={() => navigate("/my-attendance")}
          >
            My Attendance
          </button>
          <button
            className="home-nav-btn"
            onClick={() => navigate("/leave-request")}
          >
            Leaves & Smart Leave
          </button>
          <button
            className="home-nav-btn"
            onClick={() => navigate("/manage-salary")}
          >
            {isPrivileged ? "Payroll & Payslips" : "My Payslips (PDF)"}
          </button>
          <button
            className="home-nav-btn"
            onClick={() => navigate("/ai-assistant")}
          >
            ✨ AI HR Assistant
          </button>
          <button
            className="home-nav-btn"
            onClick={() => navigate("/complete-profile")}
          >
            My Contact Profile
          </button>

          {isPrivileged && (
            <>
              <p className="home-nav-heading" style={{ marginTop: "20px" }}>
                {isAdmin ? "Admin & HR Controls" : "HR Controls"}
              </p>
              <button
                className="home-nav-btn"
                onClick={() => navigate("/company-settings")}
              >
                Onboarding & Settings
              </button>
              <button
                className="home-nav-btn"
                onClick={() => navigate("/daily-attendance")}
              >
                Daily Sheet & Corrections
              </button>
              <button
                className="home-nav-btn"
                onClick={() => navigate("/employee-attendance")}
              >
                All Attendance
              </button>
              <button
                className="home-nav-btn"
                onClick={() => navigate("/manage-leaves")}
              >
                Leave Approvals
              </button>
              <button
                className="home-nav-btn"
                onClick={() => navigate("/manage-schedule")}
              >
                Manage Schedules
              </button>
              <button
                className="home-nav-btn"
                onClick={() => navigate("/audit-logs")}
              >
                Audit Trail
              </button>
            </>
          )}
        </nav>

        <div className="home-profile-sec">
          <div className="home-profile-info">
            <div className="home-profile-avatar">{initial}</div>
            <div className="home-profile-text">
              <span className="home-profile-name">{userData.name}</span>
              <span className="home-profile-role">
                {role.toUpperCase()} · {userData.department || "General"}
              </span>
            </div>
          </div>
          <button className="home-logout-btn" onClick={handleLogout}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Log out
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="home-main">
        <header className="home-header">
          <div>
            <h1>
              {getGreeting()}, {userData.name?.split(" ")[0] || "User"}!
            </h1>
            <p>
              {dateLabel} · Role:{" "}
              <strong style={{ color: "#a78bfa" }}>{role.toUpperCase()}</strong>
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleSummarizeDashboard}
              disabled={aiSummarizing || analyticsLoading}
              style={{
                padding: "9px 15px",
                borderRadius: "10px",
                border: "1px solid rgba(139, 92, 246, 0.45)",
                background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                color: "#fff",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              {aiSummarizing ? "Summarizing..." : "✨ Summarize Dashboard (AI)"}
            </button>

            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setShowNotifs((v) => !v)}
                style={{
                  padding: "9px 14px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(15, 23, 42, 0.85)",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                🔔 Alerts {unreadNotifs > 0 && `(${unreadNotifs})`}
              </button>

              {showNotifs && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "44px",
                    width: "320px",
                    maxHeight: "360px",
                    overflowY: "auto",
                    background: "#0f172a",
                    border: "1px solid rgba(255,255,255,0.16)",
                    borderRadius: "14px",
                    padding: "12px",
                    zIndex: 50,
                    boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "13px", marginBottom: "8px" }}>
                    In-App Notifications
                  </div>
                  {notifications.length === 0 ? (
                    <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0 }}>
                      No notifications yet.
                    </p>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => markNotifRead(n)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: "8px",
                          marginBottom: "6px",
                          background: n.read
                            ? "rgba(255,255,255,0.03)"
                            : "rgba(124, 58, 237, 0.18)",
                          cursor: "pointer",
                          fontSize: "12px",
                        }}
                      >
                        <div style={{ fontWeight: 600, color: "#e2e8f0" }}>
                          {n.title}
                        </div>
                        <div style={{ color: "#94a3b8", marginTop: "2px" }}>
                          {n.message}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {actionAlert && (
          <div
            style={{
              background: "rgba(124, 58, 237, 0.18)",
              border: "1px solid rgba(124, 58, 237, 0.4)",
              color: "#ddd6fe",
              padding: "11px 16px",
              borderRadius: "12px",
              marginBottom: "18px",
              fontSize: "13.5px",
            }}
          >
            {actionAlert}
          </div>
        )}

        {/* AI Dashboard Executive Summary Card */}
        {aiSummary && (
          <div
            style={{
              background:
                "linear-gradient(135deg, rgba(124, 58, 237, 0.16), rgba(15, 23, 42, 0.92))",
              border: "1px solid rgba(139, 92, 246, 0.4)",
              borderRadius: "16px",
              padding: "18px 20px",
              marginBottom: "22px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <strong style={{ color: "#ddd6fe", fontSize: "14px" }}>
                ✨ Executive Summary (Server Metrics)
              </strong>
              <span
                style={{
                  fontSize: "11px",
                  padding: "3px 9px",
                  borderRadius: "999px",
                  background: "rgba(139, 92, 246, 0.3)",
                  color: "#c4b5fd",
                  fontWeight: 700,
                }}
              >
                AI-generated
              </span>
            </div>
            <div
              style={{
                fontSize: "13.5px",
                lineHeight: 1.6,
                color: "#f1f5f9",
                whiteSpace: "pre-wrap",
              }}
            >
              {aiSummary}
            </div>
          </div>
        )}

        {/* ── ADMIN / HR ANALYTICS DASHBOARD (P2) ── */}
        {isPrivileged ? (
          <>
            {/* Filters Bar (Date Range & Department) */}
            <div
              style={{
                display: "flex",
                gap: "12px",
                flexWrap: "wrap",
                alignItems: "center",
                background: "rgba(15, 23, 42, 0.75)",
                border: "1px solid rgba(255,255,255,0.08)",
                padding: "12px 16px",
                borderRadius: "14px",
                marginBottom: "20px",
              }}
            >
              <span style={{ fontSize: "12.5px", color: "#94a3b8", fontWeight: 600 }}>
                Analytics Filters:
              </span>
              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={filterInputStyle}
              />
              <span style={{ color: "#94a3b8" }}>to</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                max={todayStr}
                onChange={(e) => setEndDate(e.target.value)}
                style={filterInputStyle}
              />
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                style={filterInputStyle}
              >
                <option value="ALL">All Departments</option>
                {(analytics?.departments || []).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
                <button
                  onClick={() => navigate("/company-settings")}
                  className="quick-btn"
                >
                  + Add Employee / HR
                </button>
                <button
                  onClick={() => navigate("/manage-leaves")}
                  className="quick-btn"
                >
                  Pending Approvals ({kpis.pendingApprovals})
                </button>
              </div>
            </div>

            {/* 5 Server-Computed KPI Cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))",
                gap: "14px",
                marginBottom: "24px",
              }}
            >
              {[
                ["Total Headcount", kpis.headcount, "#a78bfa", "Active Staff"],
                ["Present Today", kpis.presentToday, "#34d399", "Checked In"],
                ["On Leave Today", kpis.onLeaveToday, "#60a5fa", "Approved Leave"],
                ["Late Today (>09:15)", kpis.lateToday, "#fbbf24", "Past 15m Grace"],
                [
                  "Pending Approvals",
                  kpis.pendingApprovals,
                  "#f87171",
                  "Leaves & Corrections",
                ],
              ].map(([title, value, color, sub]) => (
                <div
                  key={title}
                  style={{
                    background: "rgba(15, 23, 42, 0.85)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "16px",
                    padding: "18px",
                  }}
                >
                  <div style={{ fontSize: "12px", color: "#94a3b8" }}>{title}</div>
                  <div
                    style={{
                      fontSize: "28px",
                      fontWeight: 800,
                      color,
                      margin: "6px 0 4px",
                    }}
                  >
                    {value}
                  </div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)" }}>
                    {sub}
                  </div>
                </div>
              ))}
            </div>

            {/* Recharts Row: Attendance Trend & Absenteeism by Department */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
                gap: "18px",
                marginBottom: "24px",
              }}
            >
              <div className="home-widget">
                <h3>Attendance Trend ({startDate} to {endDate})</h3>
                <div style={{ width: "100%", marginTop: "12px" }}>
                  <AttendanceTrendChart data={analytics?.attendanceTrend || []} />
                </div>
              </div>

              <div className="home-widget">
                <h3>Absenteeism & Late Arrivals by Department</h3>
                <div style={{ width: "100%", marginTop: "12px" }}>
                  <DepartmentAbsenteeismChart data={analytics?.deptAbsenteeism || []} />
                </div>
              </div>
            </div>

            {/* Top 5 Late-Comers & Notice Board */}
            <div className="home-widgets-grid" style={{ marginBottom: "28px" }}>
              <div className="home-widget">
                <h3>Top-5 Late-Comers (Selected Period)</h3>
                {(analytics?.topLateComers || []).length === 0 ? (
                  <p className="empty-text">
                    Zero late arrivals recorded in this period!
                  </p>
                ) : (
                  <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
                    {analytics.topLateComers.map((item, i) => (
                      <div
                        key={item.uid}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 14px",
                          background: "rgba(255,255,255,0.04)",
                          borderRadius: "10px",
                          fontSize: "13px",
                        }}
                      >
                        <div>
                          <strong>
                            #{i + 1} {item.name}
                          </strong>{" "}
                          <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                            ({item.department})
                          </span>
                        </div>
                        <span style={{ color: "#fbbf24", fontWeight: 700 }}>
                          {item.lateCount} lates ({item.totalLateMinutes}m)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="home-widget notice-widget">
                <div className="widget-header">
                  <h3>Company Announcements</h3>
                  <button className="add-notice-btn" onClick={handleAddNotice}>
                    + Post Announcement
                  </button>
                </div>
                <div className="notice-list">
                  {announcements.length === 0 ? (
                    <p className="empty-text">No announcements yet.</p>
                  ) : (
                    announcements.map((ann, i) => (
                      <div className="notice-card" key={ann.id || i}>
                        <div className="notice-icon">📢</div>
                        <div className="notice-content">
                          <p>{ann.message}</p>
                          <small>
                            By {ann.author} ·{" "}
                            {ann.createdAt?.toDate
                              ? ann.createdAt.toDate().toLocaleDateString()
                              : "Just now"}
                          </small>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* All Employees Directory */}
            <section className="home-section">
              <div className="home-dir-header">
                <h2 className="home-section-title" style={{ margin: 0 }}>
                  All Employees Directory ({employees.length})
                </h2>
                {employees.length > 0 && (
                  <div className="home-export-bar">
                    <button
                      onClick={() =>
                        exportDirectoryToCSV(employees, "employee-directory")
                      }
                    >
                      CSV
                    </button>
                    <button
                      onClick={() =>
                        exportDirectoryToExcel(employees, "employee-directory")
                      }
                    >
                      Excel
                    </button>
                    <button
                      onClick={() =>
                        exportDirectoryToPDF(employees, "employee-directory")
                      }
                    >
                      PDF
                    </button>
                    <button
                      onClick={() => printElement("employee-directory-table")}
                    >
                      Print
                    </button>
                  </div>
                )}
              </div>
              {empLoading ? (
                <p style={{ fontSize: "13px", color: "rgba(240,238,255,0.5)" }}>
                  Loading...
                </p>
              ) : (
                <div className="home-dir-card">
                  <div id="employee-directory-table" className="home-dir-scroll">
                    <table className="home-dir-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Role</th>
                          <th>Department</th>
                          <th>Designation</th>
                          <th>Phone</th>
                          <th>CNIC</th>
                          <th>Bank</th>
                          <th>Account</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employees.map((emp) => (
                          <tr key={emp.uid}>
                            <td>{displayNameFor(emp)}</td>
                            <td>{emp.email || "—"}</td>
                            <td>{(emp.role || "employee").toUpperCase()}</td>
                            <td>{emp.department || "General"}</td>
                            <td>{emp.designation || "Staff"}</td>
                            <td>{emp.personalInfo?.phone || "—"}</td>
                            <td>{emp.personalInfo?.cnic || "—"}</td>
                            <td>{emp.bankDetails?.providerName || "—"}</td>
                            <td>{emp.bankDetails?.accountNumber || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </>
        ) : (
          /* ── EMPLOYEE PERSONAL DASHBOARD (P2 #14) ── */
          <>
            <div className="home-widgets-grid">
              {/* Self Check-In / Out Widget */}
              <div className="home-widget">
                <h3>Today's Attendance</h3>
                {personal.todayRecord ? (
                  <div className="home-my-status">
                    <div className="status-circle status-success">✓</div>
                    <h4>{statusLabel(personal.todayRecord)}</h4>
                    <p>
                      Check-In: {formatTime12(personal.todayRecord.checkInTime)}
                      {personal.todayRecord.checkOutTime
                        ? ` · Check-Out: ${formatTime12(
                            personal.todayRecord.checkOutTime
                          )} (${personal.todayRecord.workedHours ?? 0}h)`
                        : ""}
                    </p>
                    {!personal.todayRecord.checkOutTime && (
                      <button
                        type="button"
                        disabled={checkBusy}
                        onClick={handleQuickCheckOut}
                        style={{
                          marginTop: "10px",
                          padding: "9px 18px",
                          borderRadius: "10px",
                          border: "none",
                          background: "#10b981",
                          color: "#fff",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {checkBusy ? "Saving..." : "Check Out Now"}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="home-my-status">
                    <div className="status-circle status-pending">⏱</div>
                    <h4>Not Checked In Yet</h4>
                    <p>Office hours: 09:00 AM (Grace until 09:15 AM)</p>
                    <button
                      type="button"
                      disabled={checkBusy}
                      onClick={handleQuickCheckIn}
                      style={{
                        marginTop: "10px",
                        padding: "10px 20px",
                        borderRadius: "10px",
                        border: "none",
                        background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                        color: "#fff",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {checkBusy ? "Checking in..." : "✓ Check In Now"}
                    </button>
                  </div>
                )}
              </div>

              {/* Weekly Hours Worked vs 40h Target */}
              <div className="home-widget">
                <h3>Hours Worked This Week vs 40h</h3>
                <div className="punctuality-card" style={{ marginTop: "14px" }}>
                  <div className="punctuality-info">
                    <span className="punctuality-label">Weekly Progress</span>
                    <span className="punctuality-value">
                      {personal.hoursThisWeek}h / {personal.weeklyTargetHours}h
                    </span>
                  </div>
                  <div className="punctuality-bar">
                    <div
                      className="punctuality-fill"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            (personal.hoursThisWeek /
                              (personal.weeklyTargetHours || 40)) *
                              100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                <h4 className="upcoming-title" style={{ marginTop: "18px" }}>
                  Leave Quota Balance
                </h4>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "8px",
                    marginTop: "8px",
                  }}
                >
                  {Object.values(personal.leaveBalances || {}).map((b) => (
                    <div
                      key={b.key}
                      style={{
                        padding: "8px 10px",
                        borderRadius: "8px",
                        background: "rgba(255,255,255,0.04)",
                        fontSize: "12px",
                      }}
                    >
                      <div style={{ color: "#94a3b8" }}>{b.label}</div>
                      <strong style={{ color: "#c4b5fd", fontSize: "14px" }}>
                        {b.quota === null ? "Unlimited" : `${b.remaining} / ${b.quota}d`}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>

              {/* Latest Payslip Summary & PDF Download */}
              <div className="home-widget">
                <h3>Latest Payslip ({personal.latestPayslip?.month || "Current"})</h3>
                {personal.latestPayslip ? (
                  <div style={{ display: "grid", gap: "8px", marginTop: "12px", fontSize: "13px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#94a3b8" }}>Basic Salary:</span>
                      <span>
                        Rs.{" "}
                        {Number(
                          personal.latestPayslip.basicSalary || 0
                        ).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#94a3b8" }}>Gross (1.5x):</span>
                      <span>
                        Rs.{" "}
                        {Number(
                          personal.latestPayslip.grossSalary || 0
                        ).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#94a3b8" }}>Deductions + Tax:</span>
                      <span style={{ color: "#fca5a5" }}>
                        - Rs.{" "}
                        {Number(
                          personal.latestPayslip.deduction || 0
                        ).toLocaleString()}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        paddingTop: "8px",
                        borderTop: "1px solid rgba(255,255,255,0.1)",
                        fontWeight: 700,
                        fontSize: "15px",
                      }}
                    >
                      <span>Net Pay:</span>
                      <span style={{ color: "#34d399" }}>
                        Rs.{" "}
                        {Number(
                          personal.latestPayslip.netSalary || 0
                        ).toLocaleString()}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        exportPayslipToPDF(
                          personal.latestPayslip,
                          "WorkPulse Technologies"
                        )
                      }
                      style={{
                        marginTop: "10px",
                        padding: "10px",
                        borderRadius: "10px",
                        border: "none",
                        background: "linear-gradient(135deg, #10b981, #059669)",
                        color: "#fff",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      📄 Download Payslip PDF
                    </button>
                  </div>
                ) : (
                  <p className="empty-text">No payslip available yet.</p>
                )}
              </div>

              {/* Notice Board */}
              <div className="home-widget notice-widget">
                <div className="widget-header">
                  <h3>Company Announcements</h3>
                </div>
                <div className="notice-list">
                  {announcements.length === 0 ? (
                    <p className="empty-text">No announcements yet.</p>
                  ) : (
                    announcements.map((ann, i) => (
                      <div className="notice-card" key={ann.id || i}>
                        <div className="notice-icon">📢</div>
                        <div className="notice-content">
                          <p>{ann.message}</p>
                          <small>
                            By {ann.author} ·{" "}
                            {ann.createdAt?.toDate
                              ? ann.createdAt.toDate().toLocaleDateString()
                              : "Just now"}
                          </small>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

const filterInputStyle = {
  padding: "7px 11px",
  borderRadius: "8px",
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(9, 9, 11, 0.9)",
  color: "#f8fafc",
  fontSize: "12.5px",
};

export default Home;
