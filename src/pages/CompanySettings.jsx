import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../firebase";
import {
  checkCompanySetup,
  saveCompanySettings,
  registerEmployeeByHR,
  updateEmployeeByHR,
  sendUserPasswordReset,
} from "../services/hrServer";
import {
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  DEFAULT_LEAVE_QUOTAS,
  formatCnic,
} from "../utils/attendanceHelpers";

function CompanySettings() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("users");
  const [myRole, setMyRole] = useState("admin");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Settings State
  const [settings, setSettings] = useState({
    companyName: "WorkPulse Technologies",
    officeStartTime: "09:00",
    officeEndTime: "18:00",
    graceMinutes: 15,
    halfDayThresholdHours: 5,
    weekendDays: ["sat", "sun"],
    latePenaltyEnabled: true,
    officeLocation: {
      lat: 24.8607,
      lng: 67.0011,
      radiusMeters: 500,
      enforceLocation: false,
    },
  });

  // Users State
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    tempPassword: "",
    role: "employee",
    department: "Engineering",
    designation: "Software Engineer",
    basicSalary: 60000,
    cnic: "",
    providerName: "Meezan Bank",
    accountNumber: "",
  });
  const [editingUser, setEditingUser] = useState(null);

  // Master Data State
  const [departments, setDepartments] = useState([]);
  const [newDept, setNewDept] = useState("");
  const [designations, setDesignations] = useState([]);
  const [newDesig, setNewDesig] = useState({ title: "", department: "Engineering" });
  const [holidays, setHolidays] = useState([]);
  const [newHoliday, setNewHoliday] = useState({ name: "", date: "" });

  const loadAll = async () => {
    setLoading(true);
    try {
      if (auth.currentUser) {
        const meSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (meSnap.exists()) setMyRole(meSnap.data().role || "employee");
      }

      const [setupRes, uSnap, dSnap, desSnap, hSnap] = await Promise.all([
        checkCompanySetup(),
        getDocs(collection(db, "users")),
        getDocs(collection(db, "departments")),
        getDocs(collection(db, "designations")),
        getDocs(collection(db, "public_holidays")),
      ]);

      setSettings(setupRes.settings);
      setUsers(uSnap.docs.map((d) => ({ uid: d.id, ...d.data() })));
      setDepartments(dSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setDesignations(desSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setHolidays(hSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      setErr(e.message || "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setMsg("");
    setErr("");
    try {
      await saveCompanySettings(settings);
      setMsg("Company settings saved and logged in Audit Trail.");
    } catch (e) {
      setErr(e.message);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setMsg("");
    setErr("");
    try {
      await registerEmployeeByHR(newUser);
      setMsg(
        `Account created for ${newUser.name} (${newUser.email}) with temporary password. They will be prompted to change password on first login.`
      );
      setNewUser({
        name: "",
        email: "",
        tempPassword: "",
        role: "employee",
        department: departments[0]?.name || "Engineering",
        designation: designations[0]?.title || "Software Engineer",
        basicSalary: 60000,
        cnic: "",
        providerName: "Meezan Bank",
        accountNumber: "",
      });
      await loadAll();
    } catch (e) {
      setErr(e.message);
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    setMsg("");
    setErr("");
    try {
      await updateEmployeeByHR(editingUser.uid, {
        name: editingUser.name,
        role: editingUser.role,
        department: editingUser.department,
        designation: editingUser.designation,
        basicSalary: Number(editingUser.basicSalary) || 0,
        active: editingUser.active !== false,
        personalInfo: {
          ...(editingUser.personalInfo || {}),
          fullName: editingUser.name,
          cnic: formatCnic(editingUser.cnic || editingUser.personalInfo?.cnic || ""),
        },
        bankDetails: {
          ...(editingUser.bankDetails || {}),
          method: editingUser.bankMethod || "bank",
          providerName: editingUser.providerName || "",
          accountTitle: editingUser.accountTitle || editingUser.name,
          accountNumber: editingUser.accountNumber || "",
        },
      });
      setMsg(`Updated record for ${editingUser.name}.`);
      setEditingUser(null);
      await loadAll();
    } catch (e) {
      setErr(e.message);
    }
  };

  const handleToggleWeekend = (dayKey) => {
    setSettings((prev) => {
      const current = new Set(prev.weekendDays || ["sat", "sun"]);
      if (current.has(dayKey)) current.delete(dayKey);
      else current.add(dayKey);
      return { ...prev, weekendDays: Array.from(current) };
    });
  };

  const handleUseCurrentGps = () => {
    if (!navigator.geolocation) {
      setErr("Geolocation is not supported by your browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSettings((prev) => ({
          ...prev,
          officeLocation: {
            ...prev.officeLocation,
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
          },
        }));
        setMsg("Captured current GPS coordinates for Office Location.");
      },
      (geoErr) => setErr("Could not get GPS: " + geoErr.message)
    );
  };

  const handleAddDepartment = async (e) => {
    e.preventDefault();
    if (!newDept.trim()) return;
    await addDoc(collection(db, "departments"), {
      name: newDept.trim(),
      createdAt: serverTimestamp(),
    });
    setNewDept("");
    await loadAll();
  };

  const handleAddDesignation = async (e) => {
    e.preventDefault();
    if (!newDesig.title.trim()) return;
    await addDoc(collection(db, "designations"), {
      title: newDesig.title.trim(),
      department: newDesig.department,
      createdAt: serverTimestamp(),
    });
    setNewDesig({ ...newDesig, title: "" });
    await loadAll();
  };

  const handleAddHoliday = async (e) => {
    e.preventDefault();
    if (!newHoliday.name.trim() || !newHoliday.date) return;
    await addDoc(collection(db, "public_holidays"), {
      name: newHoliday.name.trim(),
      date: newHoliday.date,
      createdAt: serverTimestamp(),
    });
    setNewHoliday({ name: "", date: "" });
    await loadAll();
  };

  const deptList =
    departments.length > 0
      ? departments.map((d) => d.name)
      : ["Engineering", "Human Resources", "Finance", "Operations", "Sales"];

  return (
    <div style={pageStyle}>
      <header style={topbarStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={avatarBadge}>⚙</div>
          <div>
            <h1 style={{ fontSize: "19px", fontWeight: 700, margin: 0 }}>
              HR & Company Configuration
            </h1>
            <span style={{ fontSize: "12px", color: "#a78bfa" }}>
              User Provisioning · Office Rules · Departments · Holidays · Quotas
            </span>
          </div>
        </div>
        <button onClick={() => navigate("/")} style={backBtnStyle}>
          ← Back to Dashboard
        </button>
      </header>

      <div style={{ maxWidth: "1160px", margin: "0 auto", padding: "24px" }}>
        {/* Navigation Tabs */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "22px" }}>
          {[
            ["users", "👥 Employee & HR Onboarding"],
            ["company", "🏢 Office Timings, Grace & GPS"],
            ["master", "📅 Departments, Holidays & Leave Quotas"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setActiveTab(key);
                setMsg("");
                setErr("");
              }}
              style={{
                padding: "10px 18px",
                borderRadius: "10px",
                border:
                  activeTab === key
                    ? "1px solid #8b5cf6"
                    : "1px solid rgba(255,255,255,0.12)",
                background:
                  activeTab === key
                    ? "linear-gradient(135deg, #7c3aed, #4f46e5)"
                    : "rgba(15, 23, 42, 0.8)",
                color: "#fff",
                fontWeight: 600,
                fontSize: "13.5px",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {msg && (
          <div style={successBanner}>{msg}</div>
        )}
        {err && (
          <div style={errorBanner}>{err}</div>
        )}

        {loading ? (
          <p style={{ color: "#94a3b8" }}>Loading configuration...</p>
        ) : activeTab === "users" ? (
          <div style={{ display: "grid", gap: "24px" }}>
            {/* Register Employee / HR Form */}
            <section style={cardStyle}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "6px" }}>
                Register New Employee {myRole === "admin" ? "or HR / Admin" : ""}
              </h2>
              <p style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "18px" }}>
                Creates Firebase Auth login with a temporary password (`mustChangePassword: true`). HR fills official CNIC, Bank, and Basic Salary (`Gross = 1.5 × Basic`).
              </p>

              <form
                onSubmit={handleCreateUser}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "14px",
                }}
              >
                <div>
                  <label style={labelStyle}>Full Name *</label>
                  <input
                    required
                    style={inputStyle}
                    placeholder="e.g. Ali Raza"
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Company Email *</label>
                  <input
                    required
                    type="email"
                    style={inputStyle}
                    placeholder="ali@company.com"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Temporary Password (min 6) *</label>
                  <input
                    required
                    type="text"
                    minLength={6}
                    style={inputStyle}
                    placeholder="TempPass123"
                    value={newUser.tempPassword}
                    onChange={(e) =>
                      setNewUser({ ...newUser, tempPassword: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label style={labelStyle}>System Role *</label>
                  <select
                    style={inputStyle}
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  >
                    <option value="employee">Employee</option>
                    {myRole === "admin" && <option value="hr">HR Manager (hr)</option>}
                    {myRole === "admin" && <option value="admin">Admin (admin)</option>}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Department</label>
                  <select
                    style={inputStyle}
                    value={newUser.department}
                    onChange={(e) =>
                      setNewUser({ ...newUser, department: e.target.value })
                    }
                  >
                    {deptList.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Designation</label>
                  <input
                    style={inputStyle}
                    placeholder="Software Engineer"
                    value={newUser.designation}
                    onChange={(e) =>
                      setNewUser({ ...newUser, designation: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label style={labelStyle}>
                    Basic Salary (Gross = Rs. {Math.round((Number(newUser.basicSalary) || 0) * 1.5).toLocaleString()})
                  </label>
                  <input
                    type="number"
                    min="0"
                    style={inputStyle}
                    value={newUser.basicSalary}
                    onChange={(e) =>
                      setNewUser({ ...newUser, basicSalary: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label style={labelStyle}>CNIC (HR Managed)</label>
                  <input
                    style={inputStyle}
                    placeholder="42101-1234567-1"
                    value={newUser.cnic}
                    onChange={(e) =>
                      setNewUser({ ...newUser, cnic: formatCnic(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <label style={labelStyle}>Bank Name</label>
                  <input
                    style={inputStyle}
                    placeholder="Meezan Bank"
                    value={newUser.providerName}
                    onChange={(e) =>
                      setNewUser({ ...newUser, providerName: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label style={labelStyle}>Bank Account Number</label>
                  <input
                    style={inputStyle}
                    placeholder="010203040506"
                    value={newUser.accountNumber}
                    onChange={(e) =>
                      setNewUser({ ...newUser, accountNumber: e.target.value })
                    }
                  />
                </div>
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <button type="submit" style={primaryBtnStyle}>
                    + Provision User Account
                  </button>
                </div>
              </form>
            </section>

            {/* Existing Users Table */}
            <section style={cardStyle}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "14px" }}>
                Directory & Account Controls ({users.length} Users)
              </h2>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", textAlign: "left" }}>
                      <th style={{ padding: "10px" }}>Name & Email</th>
                      <th style={{ padding: "10px" }}>Role</th>
                      <th style={{ padding: "10px" }}>Dept / Designation</th>
                      <th style={{ padding: "10px" }}>Basic / Gross (1.5x)</th>
                      <th style={{ padding: "10px" }}>CNIC & Bank</th>
                      <th style={{ padding: "10px" }}>Status</th>
                      <th style={{ padding: "10px" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const basic = Number(u.basicSalary ?? u.salary) || 0;
                      const gross = Math.round(basic * 1.5);
                      return (
                        <tr
                          key={u.uid}
                          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                        >
                          <td style={{ padding: "10px" }}>
                            <div style={{ fontWeight: 600 }}>{u.name || "User"}</div>
                            <div style={{ fontSize: "11.5px", color: "#94a3b8" }}>{u.email}</div>
                          </td>
                          <td style={{ padding: "10px" }}>
                            <span
                              style={{
                                padding: "3px 9px",
                                borderRadius: "999px",
                                fontSize: "11px",
                                fontWeight: 700,
                                textTransform: "uppercase",
                                background:
                                  u.role === "admin"
                                    ? "rgba(239,68,68,0.2)"
                                    : u.role === "hr"
                                    ? "rgba(59,130,246,0.2)"
                                    : "rgba(16,185,129,0.2)",
                                color:
                                  u.role === "admin"
                                    ? "#fca5a5"
                                    : u.role === "hr"
                                    ? "#93c5fd"
                                    : "#6ee7b7",
                              }}
                            >
                              {u.role || "employee"}
                            </span>
                          </td>
                          <td style={{ padding: "10px" }}>
                            <div>{u.department || "General"}</div>
                            <div style={{ fontSize: "11.5px", color: "#94a3b8" }}>
                              {u.designation || "Staff"}
                            </div>
                          </td>
                          <td style={{ padding: "10px" }}>
                            <div>Basic: Rs. {basic.toLocaleString()}</div>
                            <div style={{ fontSize: "11.5px", color: "#a78bfa" }}>
                              Gross: Rs. {gross.toLocaleString()}
                            </div>
                          </td>
                          <td style={{ padding: "10px" }}>
                            <div>{u.personalInfo?.cnic || "—"}</div>
                            <div style={{ fontSize: "11.5px", color: "#94a3b8" }}>
                              {u.bankDetails?.providerName || "—"} ({u.bankDetails?.accountNumber || "—"})
                            </div>
                          </td>
                          <td style={{ padding: "10px" }}>
                            {u.active === false ? (
                              <span style={{ color: "#f87171", fontWeight: 600 }}>Deactivated</span>
                            ) : u.mustChangePassword ? (
                              <span style={{ color: "#fbbf24" }}>Temp Password</span>
                            ) : (
                              <span style={{ color: "#34d399" }}>Active</span>
                            )}
                          </td>
                          <td style={{ padding: "10px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={() =>
                                setEditingUser({
                                  ...u,
                                  basicSalary: basic,
                                  cnic: u.personalInfo?.cnic || "",
                                  providerName: u.bankDetails?.providerName || "",
                                  accountNumber: u.bankDetails?.accountNumber || "",
                                })
                              }
                              style={smallBtnStyle}
                            >
                              Edit HR Info
                            </button>
                            {u.email && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await sendUserPasswordReset(u.email);
                                    setMsg(`Password reset email sent to ${u.email}`);
                                  } catch (e) {
                                    setErr(e.message);
                                  }
                                }}
                                style={smallBtnStyle}
                              >
                                Reset Pass
                              </button>
                            )}
                            {myRole === "admin" && u.uid !== auth.currentUser?.uid && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await updateEmployeeByHR(u.uid, {
                                      active: u.active === false ? true : false,
                                    });
                                    await loadAll();
                                  } catch (e) {
                                    setErr(e.message);
                                  }
                                }}
                                style={{
                                  ...smallBtnStyle,
                                  color: u.active === false ? "#34d399" : "#fca5a5",
                                }}
                              >
                                {u.active === false ? "Activate" : "Deactivate"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Edit Modal */}
            {editingUser && (
              <section style={{ ...cardStyle, border: "1px solid #8b5cf6" }}>
                <h3 style={{ fontSize: "16px", marginBottom: "12px" }}>
                  Editing Official Record: {editingUser.name}
                </h3>
                <form
                  onSubmit={handleUpdateUser}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "12px",
                  }}
                >
                  <div>
                    <label style={labelStyle}>Full Name</label>
                    <input
                      style={inputStyle}
                      value={editingUser.name || ""}
                      onChange={(e) =>
                        setEditingUser({ ...editingUser, name: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Role</label>
                    <select
                      style={inputStyle}
                      value={editingUser.role || "employee"}
                      disabled={myRole !== "admin"}
                      onChange={(e) =>
                        setEditingUser({ ...editingUser, role: e.target.value })
                      }
                    >
                      <option value="employee">employee</option>
                      <option value="hr">hr</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Department</label>
                    <select
                      style={inputStyle}
                      value={editingUser.department || "General"}
                      onChange={(e) =>
                        setEditingUser({ ...editingUser, department: e.target.value })
                      }
                    >
                      {deptList.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Designation</label>
                    <input
                      style={inputStyle}
                      value={editingUser.designation || ""}
                      onChange={(e) =>
                        setEditingUser({ ...editingUser, designation: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Basic Salary (PKR)</label>
                    <input
                      type="number"
                      style={inputStyle}
                      value={editingUser.basicSalary ?? 0}
                      onChange={(e) =>
                        setEditingUser({ ...editingUser, basicSalary: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>CNIC</label>
                    <input
                      style={inputStyle}
                      value={editingUser.cnic || ""}
                      onChange={(e) =>
                        setEditingUser({
                          ...editingUser,
                          cnic: formatCnic(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Bank / Provider</label>
                    <input
                      style={inputStyle}
                      value={editingUser.providerName || ""}
                      onChange={(e) =>
                        setEditingUser({
                          ...editingUser,
                          providerName: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Account Number</label>
                    <input
                      style={inputStyle}
                      value={editingUser.accountNumber || ""}
                      onChange={(e) =>
                        setEditingUser({
                          ...editingUser,
                          accountNumber: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                    <button type="submit" style={primaryBtnStyle}>
                      Save Changes
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingUser(null)}
                      style={backBtnStyle}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </section>
            )}
          </div>
        ) : activeTab === "company" ? (
          <section style={cardStyle}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>
              Company Office Timings, Grace Period & GPS Radius
            </h2>
            <p style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "18px" }}>
              Brief rules default: Office Start 09:00, Grace 15 mins (Late after 09:15), Half-Day if worked &lt; 5 hours.
            </p>

            <form onSubmit={handleSaveSettings} style={{ display: "grid", gap: "18px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "14px",
                }}
              >
                <div>
                  <label style={labelStyle}>Company Name</label>
                  <input
                    style={inputStyle}
                    value={settings.companyName || ""}
                    onChange={(e) =>
                      setSettings({ ...settings, companyName: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label style={labelStyle}>Office Start Time (Default 09:00)</label>
                  <input
                    type="time"
                    style={inputStyle}
                    value={settings.officeStartTime || "09:00"}
                    onChange={(e) =>
                      setSettings({ ...settings, officeStartTime: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label style={labelStyle}>Office End Time (Default 18:00)</label>
                  <input
                    type="time"
                    style={inputStyle}
                    value={settings.officeEndTime || "18:00"}
                    onChange={(e) =>
                      setSettings({ ...settings, officeEndTime: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label style={labelStyle}>Grace Period Minutes (Default 15)</label>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    style={inputStyle}
                    value={settings.graceMinutes ?? 15}
                    onChange={(e) =>
                      setSettings({ ...settings, graceMinutes: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <label style={labelStyle}>Half-Day Threshold Hours (Default 5h)</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    style={inputStyle}
                    value={settings.halfDayThresholdHours ?? 5}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        halfDayThresholdHours: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>

              {/* Weekend selector */}
              <div>
                <label style={labelStyle}>Weekend Days (Skipped during Leave & Payroll Working Days)</label>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "6px" }}>
                  {WEEKDAY_KEYS.map((k) => {
                    const active = (settings.weekendDays || ["sat", "sun"]).includes(k);
                    return (
                      <button
                        type="button"
                        key={k}
                        onClick={() => handleToggleWeekend(k)}
                        style={{
                          padding: "8px 14px",
                          borderRadius: "8px",
                          border: active
                            ? "1px solid #8b5cf6"
                            : "1px solid rgba(255,255,255,0.12)",
                          background: active
                            ? "rgba(124, 58, 237, 0.28)"
                            : "rgba(15, 23, 42, 0.8)",
                          color: "#fff",
                          cursor: "pointer",
                          fontSize: "13px",
                        }}
                      >
                        {WEEKDAY_LABELS[k]} {active ? "(Off)" : "(Working)"}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bonus Late Rule & GPS Location */}
              <div
                style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  padding: "16px",
                  borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <h3 style={{ fontSize: "15px", marginBottom: "10px" }}>
                  Office GPS Location & Geofence Radius (Haversine Check)
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: "12px",
                  }}
                >
                  <div>
                    <label style={labelStyle}>Office Latitude</label>
                    <input
                      type="number"
                      step="any"
                      style={inputStyle}
                      value={settings.officeLocation?.lat ?? 24.8607}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          officeLocation: {
                            ...settings.officeLocation,
                            lat: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Office Longitude</label>
                    <input
                      type="number"
                      step="any"
                      style={inputStyle}
                      value={settings.officeLocation?.lng ?? 67.0011}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          officeLocation: {
                            ...settings.officeLocation,
                            lng: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Allowed Radius (Meters)</label>
                    <input
                      type="number"
                      min="50"
                      style={inputStyle}
                      value={settings.officeLocation?.radiusMeters ?? 500}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          officeLocation: {
                            ...settings.officeLocation,
                            radiusMeters: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                    <button
                      type="button"
                      onClick={handleUseCurrentGps}
                      style={backBtnStyle}
                    >
                      📍 Use Current GPS
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", marginTop: "14px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                    <input
                      type="checkbox"
                      checked={!!settings.officeLocation?.enforceLocation}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          officeLocation: {
                            ...settings.officeLocation,
                            enforceLocation: e.target.checked,
                          },
                        })
                      }
                    />
                    Strictly enforce GPS radius on Employee Check-In
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                    <input
                      type="checkbox"
                      checked={settings.latePenaltyEnabled !== false}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          latePenaltyEnabled: e.target.checked,
                        })
                      }
                    />
                    Enable Late Penalty in Payroll (3 Lates = 0.5 Day Deduction)
                  </label>
                </div>
              </div>

              <div>
                <button type="submit" style={primaryBtnStyle}>
                  Save Company Configuration
                </button>
              </div>
            </form>
          </section>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
            {/* Departments */}
            <section style={cardStyle}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>
                Departments
              </h3>
              <form onSubmit={handleAddDepartment} style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                <input
                  style={inputStyle}
                  placeholder="New department name..."
                  value={newDept}
                  onChange={(e) => setNewDept(e.target.value)}
                />
                <button type="submit" style={primaryBtnStyle}>
                  Add
                </button>
              </form>
              <div style={{ display: "grid", gap: "8px" }}>
                {departments.map((d) => (
                  <div
                    key={d.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: "rgba(255,255,255,0.04)",
                      borderRadius: "8px",
                    }}
                  >
                    <span>{d.name}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteDoc(doc(db, "departments", d.id));
                        await loadAll();
                      }}
                      style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer" }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* Designations */}
            <section style={cardStyle}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>
                Designations
              </h3>
              <form onSubmit={handleAddDesignation} style={{ display: "grid", gap: "8px", marginBottom: "14px" }}>
                <input
                  style={inputStyle}
                  placeholder="Designation title (e.g. QA Engineer)"
                  value={newDesig.title}
                  onChange={(e) => setNewDesig({ ...newDesig, title: e.target.value })}
                />
                <div style={{ display: "flex", gap: "8px" }}>
                  <select
                    style={inputStyle}
                    value={newDesig.department}
                    onChange={(e) =>
                      setNewDesig({ ...newDesig, department: e.target.value })
                    }
                  >
                    {deptList.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <button type="submit" style={primaryBtnStyle}>
                    Add
                  </button>
                </div>
              </form>
              <div style={{ display: "grid", gap: "8px" }}>
                {designations.map((des) => (
                  <div
                    key={des.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: "rgba(255,255,255,0.04)",
                      borderRadius: "8px",
                      fontSize: "13px",
                    }}
                  >
                    <span>
                      <strong>{des.title}</strong> · {des.department}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteDoc(doc(db, "designations", des.id));
                        await loadAll();
                      }}
                      style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer" }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* Public Holidays */}
            <section style={cardStyle}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>
                Public Holidays (Skipped in Leave & Payroll)
              </h3>
              <form onSubmit={handleAddHoliday} style={{ display: "grid", gap: "8px", marginBottom: "14px" }}>
                <input
                  style={inputStyle}
                  placeholder="Holiday Name (e.g. Eid-ul-Fitr / Pakistan Day)"
                  value={newHoliday.name}
                  onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
                />
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="date"
                    style={inputStyle}
                    value={newHoliday.date}
                    onChange={(e) =>
                      setNewHoliday({ ...newHoliday, date: e.target.value })
                    }
                  />
                  <button type="submit" style={primaryBtnStyle}>
                    Add
                  </button>
                </div>
              </form>
              <div style={{ display: "grid", gap: "8px" }}>
                {holidays.length === 0 && (
                  <p style={{ fontSize: "12.5px", color: "#94a3b8" }}>
                    No public holidays configured yet.
                  </p>
                )}
                {holidays.map((h) => (
                  <div
                    key={h.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: "rgba(255,255,255,0.04)",
                      borderRadius: "8px",
                      fontSize: "13px",
                    }}
                  >
                    <span>
                      <strong>{h.date}</strong> — {h.name}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteDoc(doc(db, "public_holidays", h.id));
                        await loadAll();
                      }}
                      style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer" }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* Leave Quotas Policy */}
            <section style={cardStyle}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>
                Standard Leave Quotas (Annual Policy)
              </h3>
              <div style={{ display: "grid", gap: "10px" }}>
                {Object.values(DEFAULT_LEAVE_QUOTAS).map((lt) => (
                  <div
                    key={lt.key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      background: "rgba(124, 58, 237, 0.12)",
                      border: "1px solid rgba(124, 58, 237, 0.25)",
                      borderRadius: "10px",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{lt.label}</div>
                      <div style={{ fontSize: "11.5px", color: "#94a3b8" }}>
                        {lt.paid ? "Paid Leave (No Salary Deduction)" : "Unpaid (Deducted Per Day in Payroll)"}
                      </div>
                    </div>
                    <span style={{ fontWeight: 700, color: "#c4b5fd" }}>
                      {lt.quota === null ? "Unlimited" : `${lt.quota} Days / Year`}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "#09090b",
  color: "#f8fafc",
};

const topbarStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "18px 28px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(15, 23, 42, 0.85)",
};

const avatarBadge = {
  width: "40px",
  height: "40px",
  borderRadius: "12px",
  background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "18px",
};

const cardStyle = {
  background: "rgba(15, 23, 42, 0.82)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "16px",
  padding: "22px",
};

const labelStyle = {
  display: "block",
  fontSize: "12px",
  color: "#cbd5e1",
  marginBottom: "5px",
};

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: "9px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(9, 9, 11, 0.85)",
  color: "#f8fafc",
  fontSize: "13.5px",
};

const primaryBtnStyle = {
  padding: "10px 16px",
  borderRadius: "10px",
  border: "none",
  background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
  color: "#fff",
  fontWeight: 600,
  fontSize: "13.5px",
  cursor: "pointer",
};

const backBtnStyle = {
  padding: "8px 14px",
  borderRadius: "9px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.05)",
  color: "#e2e8f0",
  fontSize: "13px",
  cursor: "pointer",
};

const smallBtnStyle = {
  padding: "5px 10px",
  borderRadius: "7px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.05)",
  color: "#cbd5e1",
  fontSize: "11.5px",
  cursor: "pointer",
};

const successBanner = {
  background: "rgba(16, 185, 129, 0.15)",
  border: "1px solid rgba(16, 185, 129, 0.4)",
  color: "#6ee7b7",
  padding: "12px 16px",
  borderRadius: "10px",
  marginBottom: "18px",
  fontSize: "13.5px",
};

const errorBanner = {
  background: "rgba(239, 68, 68, 0.15)",
  border: "1px solid rgba(239, 68, 68, 0.4)",
  color: "#fca5a5",
  padding: "12px 16px",
  borderRadius: "10px",
  marginBottom: "18px",
  fontSize: "13.5px",
};

export default CompanySettings;
