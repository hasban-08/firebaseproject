import { useEffect, useState } from "react";
import { 
  collection, query, where, orderBy, getDocs, doc, getDoc, setDoc, addDoc, serverTimestamp, limit 
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import {
  calculateSalaryStats,
  getLocalMonthStr,
  getLocalDateStr,
  calculateAttendanceStatus,
  formatTime12
} from "../utils/attendanceHelpers";
import {
  exportDirectoryToCSV,
  exportDirectoryToExcel,
  exportDirectoryToPDF,
  printElement,
} from "../utils/exportAttendance";
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
  const [empStats, setEmpStats] = useState({});
  const [empLoading, setEmpLoading] = useState(true);
  
  // Dashboard Widgets State
  const [todayAtt, setTodayAtt] = useState([]);
  const [myTodayRecord, setMyTodayRecord] = useState(null);
  const [lateWarning, setLateWarning] = useState(null);
  const [pendingLeavesCount, setPendingLeavesCount] = useState(0);
  const [announcements, setAnnouncements] = useState([]);
  const [upcomingLeaves, setUpcomingLeaves] = useState([]);
  const [todayLeavesCount, setTodayLeavesCount] = useState(0);
  
  // New features state
  const [totalPayroll, setTotalPayroll] = useState(0);
  const [punctualityRate, setPunctualityRate] = useState(100);
  
  const navigate = useNavigate();
  const currentMonth = getLocalMonthStr();
  const todayStr = getLocalDateStr();
  const today = new Date();
  
  const dateLabel = today.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });

  useEffect(() => {
    let cancelled = false;
    const fetchUserAndNotices = async () => {
      try {
        const ref = doc(db, "users", auth.currentUser.uid);
        const snap = await getDoc(ref);
        if (cancelled) return;

        if (snap.exists()) {
          setUserData(snap.data());
        } else {
          const fallback = {
            name: auth.currentUser.displayName || "User",
            email: auth.currentUser.email,
            role: "employee",
            salary: 0,
            createdAt: new Date(),
          };
          await setDoc(ref, fallback);
          if (!cancelled) setUserData(fallback);
        }

        const annQ = query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(4));
        const annSnap = await getDocs(annQ);
        if (!cancelled) {
          setAnnouncements(annSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      } catch (err) {
        if (err?.name !== "AbortError" && !cancelled) {
          setLoadError(err.message || "Could not load dashboard.");
        }
      }
    };
    fetchUserAndNotices();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!userData || userData.role !== "admin") return;
    let cancelled = false;

    const fetchAdminData = async () => {
      setEmpLoading(true);
      try {
        const snap = await getDocs(collection(db, "users"));
        const emps = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
        if (cancelled) return;
        setEmployees(emps);

        const todayAttQ = query(collection(db, "attendance"), where("date", "==", todayStr));
        const todayAttSnap = await getDocs(todayAttQ);
        if (!cancelled) setTodayAtt(todayAttSnap.docs.map(d => d.data()));

        const allLeavesSnap = await getDocs(collection(db, "leaveRequests"));
        let pCount = 0;
        let tLeaves = 0;
        const leavesByUid = {};
        
        allLeavesSnap.docs.forEach((d) => {
          const data = d.data();
          if (data.status === "pending") pCount++;
          if (data.status === "approved") {
            (leavesByUid[data.uid] = leavesByUid[data.uid] || []).push(data);
            if (data.type === "leave" && data.startDate <= todayStr && data.endDate >= todayStr) tLeaves++;
            else if (data.type === "earlyLeave" && data.date === todayStr) tLeaves++;
          }
        });
        if (!cancelled) {
          setPendingLeavesCount(pCount);
          setTodayLeavesCount(tLeaves);
        }

        const statsMap = {};
        let payrollSum = 0;
        for (const emp of emps) {
          if (cancelled) return;
          const attQ = query(collection(db, "attendance"), where("uid", "==", emp.uid), where("month", "==", currentMonth), orderBy("date", "asc"));
          const attSnap = await getDocs(attQ);
          const records = attSnap.docs.map((d) => d.data());

          const empStat = calculateSalaryStats({
            records,
            schedule: emp.schedule,
            baseSalary: Number(emp.salary) || 0,
            month: currentMonth,
            approvedLeaves: leavesByUid[emp.uid] || [],
          });
          statsMap[emp.uid] = empStat;
          payrollSum += (empStat.netSalary || 0);
        }
        if (!cancelled) {
          setEmpStats(statsMap);
          setTotalPayroll(payrollSum);
        }
      } catch (err) {
        if (err?.name !== "AbortError") console.error("Home admin fetch:", err);
      } finally {
        if (!cancelled) setEmpLoading(false);
      }
    };
    fetchAdminData();
    return () => { cancelled = true; };
  }, [userData, currentMonth, todayStr]);

  useEffect(() => {
    if (!userData || userData.role === "admin") return;
    let cancelled = false;

    const fetchEmployeeStatus = async () => {
      try {
        const q = query(collection(db, "attendance"), where("uid", "==", auth.currentUser.uid), where("date", "==", todayStr));
        const snap = await getDocs(q);
        if (cancelled) return;

        if (!snap.empty) {
          setMyTodayRecord(snap.docs[0].data());
          setLateWarning(null);
        } else {
          const now = new Date();
          const { status, lateMinutes } = calculateAttendanceStatus(userData.schedule, now);
          if (status === "extreme-late") setLateWarning({ lateMinutes });
          else setLateWarning(null);
        }

        const lQ = query(collection(db, "leaveRequests"), where("uid", "==", auth.currentUser.uid), where("status", "==", "approved"));
        const lSnap = await getDocs(lQ);
        if (!cancelled) {
          const up = lSnap.docs.map(d => d.data()).filter(l => (l.startDate >= todayStr || l.date >= todayStr));
          setUpcomingLeaves(up);
        }

        const monthQ = query(collection(db, "attendance"), where("uid", "==", auth.currentUser.uid), where("month", "==", currentMonth));
        const monthSnap = await getDocs(monthQ);
        if (!cancelled) {
          let onTimeCount = 0;
          let totalCount = monthSnap.size;
          monthSnap.docs.forEach(d => { if(d.data().status === 'on-time') onTimeCount++; });
          let punctuality = totalCount > 0 ? Math.round((onTimeCount / totalCount) * 100) : 100;
          setPunctualityRate(punctuality);
        }

      } catch (err) {
        if (err?.name !== "AbortError") console.error("Home emp fetch:", err);
      }
    };
    fetchEmployeeStatus();
    return () => { cancelled = true; };
  }, [userData, todayStr, currentMonth]);

  const handleAddNotice = async () => {
    const msg = window.prompt("Enter announcement message for the team:");
    if (!msg || !msg.trim()) return;
    try {
      const newNotice = {
        message: msg.trim(),
        author: userData.name || "Admin",
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, "announcements"), newNotice);
      setAnnouncements([{ id: Date.now().toString(), ...newNotice, createdAt: { toDate: () => new Date() } }, ...announcements]);
    } catch(err) {
      window.alert("Error posting announcement: " + err.message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  if (!userData) {
    return (
      <div className="home-layout" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <p style={{ color: "rgba(240, 238, 255, 0.5)" }}>{loadError || "Loading dashboard..."}</p>
      </div>
    );
  }

  const isAdmin = userData.role === "admin";
  const initial = (userData.name || "U").charAt(0).toUpperCase();

  const totalEmps = employees.length || 1; 
  const onTimeCount = todayAtt.filter(r => r.status === "on-time").length;
  const lateCount = todayAtt.filter(r => r.status === "late" || r.status === "extreme-late").length;
  const leaveCount = todayLeavesCount;
  const absentOrPending = totalEmps - (onTimeCount + lateCount + leaveCount);

  const pOnTime = (onTimeCount / totalEmps) * 100;
  const pLate = (lateCount / totalEmps) * 100;
  const pLeave = (leaveCount / totalEmps) * 100;

  return (
    <div className="home-layout">
      {/* ── SIDEBAR ── */}
      <aside className="home-sidebar">
        <div className="home-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Portal
        </div>
        <nav className="home-nav">
          <p className="home-nav-heading">Main Menu</p>
          <button className="home-nav-btn active" onClick={() => navigate("/")}>Dashboard</button>
          <button className="home-nav-btn" onClick={() => navigate(isAdmin ? "/daily-attendance" : "/mark-attendance")}>
            {isAdmin ? "Check-in Sheet" : "Today's Status"}
          </button>
          <button className="home-nav-btn" onClick={() => navigate("/my-attendance")}>My Attendance</button>
          <button className="home-nav-btn" onClick={() => navigate("/leave-request")}>Leave / Early Leave</button>
          {isAdmin && (
            <>
              <p className="home-nav-heading" style={{ marginTop: '24px' }}>Admin Tools</p>
              <button className="home-nav-btn" onClick={() => navigate("/employee-attendance")}>All Attendance</button>
              <button className="home-nav-btn" onClick={() => navigate("/manage-schedule")}>Manage Schedule</button>
              <button className="home-nav-btn" onClick={() => navigate("/manage-salary")}>Manage Salaries</button>
              <button className="home-nav-btn" onClick={() => navigate("/manage-leaves")}>Leave Approvals</button>
            </>
          )}
        </nav>
        <div className="home-profile-sec">
          <div className="home-profile-info">
            <div className="home-profile-avatar">{initial}</div>
            <div className="home-profile-text">
              <span className="home-profile-name">{userData.name}</span>
              <span className="home-profile-role">{isAdmin ? "Admin" : "Employee"}</span>
            </div>
          </div>
          <button className="home-logout-btn" onClick={handleLogout}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Log out
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="home-main">
        <header className="home-header">
          <div>
            <h1>{getGreeting()}, {userData.name?.split(" ")[0] || "User"}!</h1>
            <p>{dateLabel}</p>
          </div>
          {isAdmin && (
            <div className="home-header-stat">
              <span className="stat-label">Estimated Payroll</span>
              <span className="stat-value">Rs. {totalPayroll.toLocaleString()}</span>
            </div>
          )}
        </header>

        {/* Quick Actions (Admin Only) */}
        {isAdmin && (
          <div className="home-quick-actions">
            <button onClick={() => navigate("/manage-leaves")} className="quick-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4M5 4h14v16H5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Leaves 
              {pendingLeavesCount > 0 && <span className="quick-badge">{pendingLeavesCount}</span>}
            </button>
            <button onClick={() => navigate("/daily-attendance")} className="quick-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              Mark Today
            </button>
            <button onClick={() => navigate("/manage-salary")} className="quick-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="2"/></svg>
              Payroll
            </button>
          </div>
        )}

        {/* Dashboard Widgets Grid */}
        <div className="home-widgets-grid">
          
          {isAdmin ? (
            <div className="home-widget chart-widget">
              <h3>Today's Overview</h3>
              <div className="chart-container">
                <div 
                  className="donut-chart" 
                  style={{
                    background: `conic-gradient(
                      #a78bfa 0% ${pOnTime}%, 
                      #6d3aff ${pOnTime}% ${pOnTime + pLate}%, 
                      rgba(255,255,255,0.3) ${pOnTime + pLate}% ${pOnTime + pLate + pLeave}%, 
                      rgba(255,255,255,0.05) ${pOnTime + pLate + pLeave}% 100%
                    )`
                  }}
                >
                  <div className="donut-inner">
                    <span>{todayAtt.length}</span>
                    <small>Marked</small>
                  </div>
                </div>
                <div className="chart-legend">
                  <div className="legend-item"><span className="dot dot-ontime"></span> On Time ({onTimeCount})</div>
                  <div className="legend-item"><span className="dot dot-late"></span> Late ({lateCount})</div>
                  <div className="legend-item"><span className="dot dot-leave"></span> On Leave ({leaveCount})</div>
                  <div className="legend-item"><span className="dot dot-absent"></span> Pending/Absent ({absentOrPending})</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="home-widget">
              <h3>Your Today's Status</h3>
              {myTodayRecord ? (
                <div className="home-my-status">
                  <div className="status-circle status-success">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <h4>You're checked in</h4>
                  <p>Marked at {formatTime12(myTodayRecord.checkInTime)}</p>
                </div>
              ) : (
                <div className="home-my-status">
                   <div className="status-circle status-pending">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  </div>
                  <h4>Not marked yet</h4>
                  <p>Your admin will mark you when you arrive.</p>
                  {lateWarning && <p className="late-alert-text">Extreme late window active ({lateWarning.lateMinutes}m past grace).</p>}
                </div>
              )}
            </div>
          )}

          <div className="home-widget notice-widget">
            <div className="widget-header">
              <h3>Notice Board</h3>
              {isAdmin && (
                <button className="add-notice-btn" onClick={handleAddNotice}>+ Add</button>
              )}
            </div>
            <div className="notice-list">
              {announcements.length === 0 ? (
                <p className="empty-text">No announcements yet.</p>
              ) : (
                announcements.map((ann, i) => (
                  <div className="notice-card" key={ann.id || i}>
                    <div className="notice-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <div className="notice-content">
                      <p>{ann.message}</p>
                      <small>By {ann.author} · {ann.createdAt?.toDate ? ann.createdAt.toDate().toLocaleDateString() : 'Just now'}</small>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {!isAdmin && (
            <div className="home-widget upcoming-widget">
              <div className="widget-header">
                <h3>Punctuality & Leaves</h3>
              </div>
              <div className="punctuality-card">
                <div className="punctuality-info">
                  <span className="punctuality-label">Month's Score</span>
                  <span className="punctuality-value">{punctualityRate}%</span>
                </div>
                <div className="punctuality-bar">
                  <div className="punctuality-fill" style={{ width: `${punctualityRate}%` }}></div>
                </div>
              </div>
              <h4 className="upcoming-title">Upcoming Approved Leaves</h4>
              <div className="upcoming-list">
                {upcomingLeaves.length === 0 ? (
                   <p className="empty-text">No upcoming leaves.</p>
                ) : (
                  upcomingLeaves.map((l, i) => (
                    <div className="upcoming-card" key={i}>
                      <span className="upcoming-type">{l.type === 'earlyLeave' ? 'Early Leave' : 'Leave'}</span>
                      <span className="upcoming-date">{l.type === 'earlyLeave' ? l.date : `${l.startDate} to ${l.endDate}`}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {isAdmin && (
          <section className="home-section" style={{ marginBottom: '40px' }}>
            <h2 className="home-section-title">Employee Salaries — {currentMonth}</h2>
            {empLoading ? (
              <p style={{ fontSize: '13px', color: 'rgba(240,238,255,0.5)' }}>Loading...</p>
            ) : employees.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'rgba(240,238,255,0.5)' }}>No employees found yet.</p>
            ) : (
              <div className="home-emp-grid">
                {employees.map((emp) => {
                  const s = empStats[emp.uid] || {};
                  const empInitial = displayNameFor(emp).charAt(0).toUpperCase();
                  return (
                    <div className="home-emp-card" key={emp.uid}>
                      <div className="home-emp-header">
                        <span className="home-emp-avatar">{empInitial}</span>
                        <span className="home-emp-name">{displayNameFor(emp)}</span>
                      </div>
                      <div className="home-emp-net">
                        <span className="home-emp-net-label">Net Salary</span>
                        <span className="home-emp-net-value">Rs. {(s.netSalary ?? 0).toLocaleString()}</span>
                      </div>
                      <div className="home-emp-stats">
                        <div className="home-emp-stat">
                          <span className="home-emp-stat-label">Base</span>
                          <span className="home-emp-stat-value">Rs. {Number(emp.salary) || 0}</span>
                        </div>
                        <div className="home-emp-stat">
                          <span className="home-emp-stat-label">Deducted</span>
                          <span className="home-emp-stat-value">Rs. {(s.deduction ?? 0).toFixed(0)}</span>
                        </div>
                        <div className="home-emp-stat">
                          <span className="home-emp-stat-label">Late/Absent</span>
                          <span className="home-emp-stat-value">{s.lateCount ?? 0} / {s.absentCount ?? 0}</span>
                        </div>
                        <div className="home-emp-stat">
                          <span className="home-emp-stat-label">Offs</span>
                          <span className="home-emp-stat-value">{s.offEquivalents ?? 0}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {isAdmin && (
          <section className="home-section">
            <div className="home-dir-header">
              <h2 className="home-section-title" style={{ margin: 0 }}>All Employees Directory</h2>
              {employees.length > 0 && (
                <div className="home-export-bar">
                  <button onClick={() => exportDirectoryToCSV(employees, "employee-directory")}>CSV</button>
                  <button onClick={() => exportDirectoryToExcel(employees, "employee-directory")}>Excel</button>
                  <button onClick={() => exportDirectoryToPDF(employees, "employee-directory")}>PDF</button>
                  <button onClick={() => printElement("employee-directory-table")}>Print</button>
                </div>
              )}
            </div>
            {empLoading ? (
              <p style={{ fontSize: '13px', color: 'rgba(240,238,255,0.5)' }}>Loading...</p>
            ) : employees.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'rgba(240,238,255,0.5)' }}>No employees found yet.</p>
            ) : (
              <div className="home-dir-card">
                <div id="employee-directory-table" className="home-dir-scroll">
                  <table className="home-dir-table">
                    <thead>
                      <tr>
                        <th>Name</th><th>Email</th><th>Phone</th><th>CNIC</th><th>DOB</th><th>Address</th><th>Payment</th><th>Bank</th><th>Acc Title</th><th>Acc Number</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((emp) => (
                        <tr key={emp.uid}>
                          <td>{displayNameFor(emp)}</td>
                          <td>{emp.email || "—"}</td>
                          <td>{emp.personalInfo?.phone || "—"}</td>
                          <td>{emp.personalInfo?.cnic || "—"}</td>
                          <td>{emp.personalInfo?.dob || "—"}</td>
                          <td>{emp.personalInfo?.address || "—"}</td>
                          <td>{emp.bankDetails?.method || "—"}</td>
                          <td>{emp.bankDetails?.providerName || "—"}</td>
                          <td>{emp.bankDetails?.accountTitle || "—"}</td>
                          <td>{emp.bankDetails?.accountNumber || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default Home;