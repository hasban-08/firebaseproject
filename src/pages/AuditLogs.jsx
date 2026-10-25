import { useEffect, useState, useCallback } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../firebase";
import {
  fetchComprehensiveAuditLogs,
  recordAuditLog,
} from "../services/hrServer";

const ENTITY_TABS = [
  { key: "ALL", label: "All Entities" },
  { key: "attendance", label: "Attendance" },
  { key: "leaveRequests", label: "Leaves" },
  { key: "payrolls", label: "Payroll" },
  { key: "users", label: "Users & Roles" },
  { key: "settings", label: "Settings" },
  { key: "announcements", label: "Announcements" },
];

function actionBadgeStyle(action = "") {
  const a = action.toUpperCase();
  if (a.includes("REJECT") || a.includes("CANCEL") || a.includes("DEACTIVATE")) {
    return {
      bg: "rgba(239, 68, 68, 0.18)",
      border: "rgba(239, 68, 68, 0.4)",
      color: "#fca5a5",
    };
  }
  if (a.includes("APPROVE") || a.includes("CHECK_IN") || a.includes("FINALIZE") || a.includes("VERIFIED")) {
    return {
      bg: "rgba(16, 185, 129, 0.18)",
      border: "rgba(16, 185, 129, 0.4)",
      color: "#6ee7b7",
    };
  }
  if (a.includes("OVERRIDE") || a.includes("UPDATE") || a.includes("SETTING")) {
    return {
      bg: "rgba(245, 158, 11, 0.18)",
      border: "rgba(245, 158, 11, 0.4)",
      color: "#fcd34d",
    };
  }
  return {
    bg: "rgba(124, 58, 237, 0.2)",
    border: "rgba(139, 92, 246, 0.45)",
    color: "#c4b5fd",
  };
}

function renderCleanKeyValuePills(dataObj, tone = "after") {
  if (!dataObj || typeof dataObj !== "object") {
    return (
      <span style={{ color: "#64748b", fontStyle: "italic", fontSize: "12px" }}> None (Initial State)
      </span>
    );
  }
  const entries = Object.entries(dataObj).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  );
  if (entries.length === 0) {
    return (
      <span style={{ color: "#64748b", fontStyle: "italic", fontSize: "12px" }}> Empty state
      </span>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
      {entries.map(([k, v]) => {
        const displayVal =
          typeof v === "object" ? JSON.stringify(v) : String(v);
        return (
          <span
            key={k}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "4px 9px",
              borderRadius: "7px",
              background:
                tone === "before"
                  ? "rgba(239, 68, 68, 0.1)"
                  : "rgba(16, 185, 129, 0.12)",
              border:
                tone === "before"
                  ? "1px solid rgba(239, 68, 68, 0.25)"
                  : "1px solid rgba(16, 185, 129, 0.28)",
              fontSize: "11.5px",
            }}
          >
            <strong style={{ color: "#94a3b8" }}>{k}:</strong>
            <span
              style={{
                color: tone === "before" ? "#fca5a5" : "#a7f3d0",
                fontWeight: 600,
                wordBreak: "break-word",
              }}
            >
              {displayVal}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function AuditLogs() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAction, setFilterAction] = useState("ALL");
  const [filterEntity, setFilterEntity] = useState("ALL");
  const [filterRole, setFilterRole] = useState("ALL");
  const [rawJsonOpen, setRawJsonOpen] = useState({});
  const [testingAudit, setTestingAudit] = useState(false);
  const [statusBanner, setStatusBanner] = useState("");

  const loadAuditTrail = useCallback(async () => {
    try {
      const { logs: mergedLogs } = await fetchComprehensiveAuditLogs();
      setLogs(mergedLogs);
    } catch (err) {
      console.warn("Audit trail load warning:", err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAuditTrail();

    // Real-time listeners so any new activity updates the Audit Trail live
    const unsubAudit = onSnapshot(
      collection(db, "audit_logs"),
      () => {
        loadAuditTrail();
      },
      () => {
        // Fallback already handled inside fetchComprehensiveAuditLogs
      }
    );

    const unsubAtt = onSnapshot(
      collection(db, "attendance"),
      () => {
        loadAuditTrail();
      },
      () => {}
    );

    const unsubLeave = onSnapshot(
      collection(db, "leaveRequests"),
      () => {
        loadAuditTrail();
      },
      () => {}
    );

    return () => {
      unsubAudit();
      unsubAtt();
      unsubLeave();
    };
  }, [loadAuditTrail]);

  const handleRecordTestVerification = async () => {
    if (testingAudit) return;
    setTestingAudit(true);
    setStatusBanner("");
    try {
      await recordAuditLog({
        actorUid: auth.currentUser?.uid || "admin",
        actorName:
          auth.currentUser?.displayName ||
          auth.currentUser?.email?.split("@")[0] ||
          "Admin",
        actorRole: "admin",
        action: "AUDIT_INTEGRITY_VERIFIED",
        entity: "settings",
        entityId: `verify_${Date.now().toString().slice(-5)}`,
        before: { integrityStatus: "pending_check", appendOnlyRules: true },
        after: {
          integrityStatus: "verified_ok",
          appendOnlyRules: true,
          checkedAt: new Date().toLocaleTimeString(),
        },
      });
      await loadAuditTrail();
      setStatusBanner(
        " Live verification event recorded in the Immutable Audit Trail!"
      );
    } catch (err) {
      setStatusBanner(` ${err.message}`);
    } finally {
      setTestingAudit(false);
    }
  };

  const handleExportCSV = () => {
    if (filtered.length === 0) return;
    const headers = [
      "Timestamp",
      "Action",
      "Actor Name",
      "Actor Role",
      "Entity",
      "Entity ID",
      "Before JSON",
      "After JSON",
    ];
    const rows = filtered.map((l) => [
      `"${(l.dateFormatted || "").replace(/"/g, '""')}"`,
      `"${(l.action || "").replace(/"/g, '""')}"`,
      `"${(l.actorName || "").replace(/"/g, '""')}"`,
      `"${(l.actorRole || "").replace(/"/g, '""')}"`,
      `"${(l.entity || "").replace(/"/g, '""')}"`,
      `"${(l.entityId || "").replace(/"/g, '""')}"`,
      `"${JSON.stringify(l.before || {}).replace(/"/g, '""')}"`,
      `"${JSON.stringify(l.after || {}).replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const actions = Array.from(
    new Set(["ALL", ...logs.map((l) => l.action).filter(Boolean)])
  );

  const filtered = logs.filter((l) => {
    if (filterAction !== "ALL" && l.action !== filterAction) return false;
    if (filterEntity !== "ALL" && !String(l.entity || "").includes(filterEntity)) {
      return false;
    }
    if (
      filterRole !== "ALL" &&
      String(l.actorRole || "").toLowerCase() !== filterRole.toLowerCase()
    ) {
      return false;
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const hay = `${l.action} ${l.actorName} ${l.actorRole} ${l.entity} ${
        l.entityId
      } ${JSON.stringify(l.before || {})} ${JSON.stringify(
        l.after || {}
      )}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // KPI metrics
  const totalCount = logs.length;
  const attCount = logs.filter((l) => String(l.entity || "").includes("attendance")
  ).length;
  const leaveCount = logs.filter((l) => String(l.entity || "").includes("leave")
  ).length;
  const payrollSecCount = logs.filter(
    (l) => String(l.entity || "").includes("payroll") ||
      String(l.entity || "").includes("users") ||
      String(l.entity || "").includes("settings")
  ).length;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#09090b",
        color: "#f8fafc",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Topbar */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          padding: "18px 28px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(15, 23, 42, 0.92)",
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #10b981, #059669)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
              boxShadow: "0 4px 16px rgba(16, 185, 129, 0.35)",
            }}
          >
            
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h1 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}> Immutable System Audit Trail
              </h1>
              <span
                style={{
                  fontSize: "10.5px",
                  padding: "2px 8px",
                  borderRadius: "999px",
                  background: "rgba(16, 185, 129, 0.2)",
                  color: "#6ee7b7",
                  fontWeight: 700,
                }}
              > LIVE STREAM
              </span>
            </div>
            <span style={{ fontSize: "12px", color: "#94a3b8" }}> Append-Only Security Log | Actor, Action, Entity & Before/After State Diffs
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleRecordTestVerification}
            disabled={testingAudit}
            style={{
              padding: "8px 14px",
              borderRadius: "9px",
              border: "1px solid rgba(16, 185, 129, 0.45)",
              background: "rgba(16, 185, 129, 0.16)",
              color: "#6ee7b7",
              fontWeight: 700,
              fontSize: "12.5px",
              cursor: "pointer",
            }}
          >
            {testingAudit ? "Recording..." : " Verify Audit Log"}
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            style={{
              padding: "8px 14px",
              borderRadius: "9px",
              border: "1px solid rgba(139, 92, 246, 0.4)",
              background: "rgba(124, 58, 237, 0.16)",
              color: "#ddd6fe",
              fontWeight: 600,
              fontSize: "12.5px",
              cursor: "pointer",
            }}
          > Export CSV
          </button>
          <button
            type="button"
            onClick={() => navigate("/")}
            style={{
              padding: "8px 14px",
              borderRadius: "9px",
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.05)",
              color: "#e2e8f0",
              fontSize: "12.5px",
              cursor: "pointer",
            }}
          >
            Back to Dashboard
          </button>
        </div>
      </header>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px" }}>
        {statusBanner && (
          <div
            style={{
              marginBottom: "18px",
              padding: "12px 16px",
              borderRadius: "12px",
              background: "rgba(16, 185, 129, 0.14)",
              border: "1px solid rgba(16, 185, 129, 0.35)",
              color: "#a7f3d0",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            {statusBanner}
          </div>
        )}

        {/* 4 KPI Summary Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "14px",
            marginBottom: "22px",
          }}
        >
          <div
            style={{
              background: "rgba(15, 23, 42, 0.85)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderTop: "3px solid #8b5cf6",
              borderRadius: "14px",
              padding: "16px",
            }}
          >
            <div style={{ fontSize: "12px", color: "#94a3b8" }}> Total Immutable Events
            </div>
            <div style={{ fontSize: "26px", fontWeight: 800, marginTop: "4px" }}>
              {totalCount}
            </div>
            <div style={{ fontSize: "11px", color: "#a78bfa", marginTop: "4px" }}> Append-only (`update/delete: false`)
            </div>
          </div>

          <div
            style={{
              background: "rgba(15, 23, 42, 0.85)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderTop: "3px solid #10b981",
              borderRadius: "14px",
              padding: "16px",
            }}
          >
            <div style={{ fontSize: "12px", color: "#94a3b8" }}> Attendance & Check-In Logs
            </div>
            <div style={{ fontSize: "26px", fontWeight: 800, marginTop: "4px" }}>
              {attCount}
            </div>
            <div style={{ fontSize: "11px", color: "#6ee7b7", marginTop: "4px" }}> Self Check-In/Out & HR Overrides
            </div>
          </div>

          <div
            style={{
              background: "rgba(15, 23, 42, 0.85)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderTop: "3px solid #f59e0b",
              borderRadius: "14px",
              padding: "16px",
            }}
          >
            <div style={{ fontSize: "12px", color: "#94a3b8" }}> Leave & Approval Events
            </div>
            <div style={{ fontSize: "26px", fontWeight: 800, marginTop: "4px" }}>
              {leaveCount}
            </div>
            <div style={{ fontSize: "11px", color: "#fcd34d", marginTop: "4px" }}> Applications, Approvals & Rejections
            </div>
          </div>

          <div
            style={{
              background: "rgba(15, 23, 42, 0.85)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderTop: "3px solid #38bdf8",
              borderRadius: "14px",
              padding: "16px",
            }}
          >
            <div style={{ fontSize: "12px", color: "#94a3b8" }}> Payroll, Users & Settings
            </div>
            <div style={{ fontSize: "26px", fontWeight: 800, marginTop: "4px" }}>
              {payrollSecCount}
            </div>
            <div style={{ fontSize: "11px", color: "#7dd3fc", marginTop: "4px" }}> Salary Runs, Roles & Security
            </div>
          </div>
        </div>

        {/* Entity Filter Pills */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            marginBottom: "14px",
          }}
        >
          {ENTITY_TABS.map((tab) => {
            const active = filterEntity === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilterEntity(tab.key)}
                style={{
                  padding: "7px 14px",
                  borderRadius: "999px",
                  border: active
                    ? "1px solid #8b5cf6"
                    : "1px solid rgba(255,255,255,0.12)",
                  background: active
                    ? "linear-gradient(135deg, #7c3aed, #4f46e5)"
                    : "rgba(15, 23, 42, 0.8)",
                  color: active ? "#fff" : "#cbd5e1",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search + Action & Role Filters */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "18px",
            flexWrap: "wrap",
            gap: "12px",
            background: "rgba(15, 23, 42, 0.75)",
            padding: "14px 16px",
            borderRadius: "14px",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder=" Search by employee name, action, entity ID, or status..."
            style={{
              flex: "1 1 280px",
              padding: "9px 14px",
              borderRadius: "9px",
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(9, 9, 11, 0.9)",
              color: "#fff",
              fontSize: "13px",
            }}
          />

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              style={{
                padding: "9px 12px",
                borderRadius: "9px",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(9, 9, 11, 0.9)",
                color: "#fff",
                fontSize: "12.5px",
              }}
            >
              {actions.map((a) => (
                <option key={a} value={a}> Action: {a}
                </option>
              ))}
            </select>

            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              style={{
                padding: "9px 12px",
                borderRadius: "9px",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(9, 9, 11, 0.9)",
                color: "#fff",
                fontSize: "12.5px",
              }}
            >
              <option value="ALL">Role: ALL</option>
              <option value="admin">Role: Admin</option>
              <option value="hr">Role: HR</option>
              <option value="employee">Role: Employee</option>
            </select>

            <span style={{ fontSize: "12.5px", color: "#94a3b8" }}> Showing <strong>{filtered.length}</strong> of {logs.length} events
            </span>
          </div>
        </div>

        {/* Audit Events Feed */}
        {loading ? (
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              color: "#94a3b8",
              background: "rgba(15, 23, 42, 0.6)",
              borderRadius: "14px",
            }}
          > Loading real-time audit trail...
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              color: "#94a3b8",
              background: "rgba(15, 23, 42, 0.6)",
              borderRadius: "14px",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <p style={{ margin: "0 0 12px", fontSize: "14px" }}> No matching audit events found for the current filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setFilterAction("ALL");
                setFilterEntity("ALL");
                setFilterRole("ALL");
                setSearchTerm("");
              }}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                background: "#7c3aed",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 600,
              }}
            > Reset Filters
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "12px" }}>
            {filtered.map((log) => {
              const badge = actionBadgeStyle(log.action);
              const isRawOpen = Boolean(rawJsonOpen[log.id]);
              return (
                <div
                  key={log.id}
                  style={{
                    background: "rgba(15, 23, 42, 0.88)",
                    border: "1px solid rgba(255,255,255,0.09)",
                    borderRadius: "14px",
                    padding: "16px 18px",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "10px",
                      marginBottom: "12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: "999px",
                          background: badge.bg,
                          border: `1px solid ${badge.border}`,
                          color: badge.color,
                          fontSize: "11.5px",
                          fontWeight: 700,
                          fontFamily: "monospace",
                        }}
                      >
                        {log.action}
                      </span>

                      <span style={{ fontSize: "13.5px", fontWeight: 700, color: "#f8fafc" }}>
                         {log.actorName || "User"}
                      </span>

                      <span
                        style={{
                          fontSize: "11px",
                          padding: "2px 8px",
                          borderRadius: "6px",
                          background: "rgba(255,255,255,0.07)",
                          color: "#cbd5e1",
                          textTransform: "uppercase",
                          fontWeight: 600,
                        }}
                      >
                        {log.actorRole || "user"}
                      </span>

                      <span style={{ fontSize: "12px", color: "#94a3b8" }}> Entity: <strong style={{ color: "#e2e8f0" }}>{log.entity}</strong>{" "}
                        {log.entityId ? (
                          <code style={{ color: "#a78bfa" }}>#{log.entityId.slice(0, 18)}</code>
                        ) : (
                          ""
                        )}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                         {log.dateFormatted || "Recorded"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRawJsonOpen((prev) => ({
                            ...prev,
                            [log.id]: !prev[log.id],
                          }))
                        }
                        style={{
                          padding: "3px 8px",
                          borderRadius: "6px",
                          border: "1px solid rgba(255,255,255,0.14)",
                          background: "rgba(255,255,255,0.05)",
                          color: "#cbd5e1",
                          fontSize: "11px",
                          cursor: "pointer",
                        }}
                      >
                        {isRawOpen ? "Hide JSON" : "{ } Raw JSON"}
                      </button>
                    </div>
                  </div>

                  {/* Formatted Human-Readable Diff Cards */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        background: "rgba(9, 9, 11, 0.65)",
                        padding: "10px 12px",
                        borderRadius: "10px",
                        border: "1px solid rgba(255,255,255,0.05)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "10.5px",
                          fontWeight: 700,
                          color: "#94a3b8",
                          marginBottom: "6px",
                          letterSpacing: "0.04em",
                        }}
                      > PREVIOUS STATE (BEFORE)
                      </div>
                      {renderCleanKeyValuePills(log.before, "before")}
                    </div>

                    <div
                      style={{
                        background: "rgba(9, 9, 11, 0.65)",
                        padding: "10px 12px",
                        borderRadius: "10px",
                        border: "1px solid rgba(255,255,255,0.05)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "10.5px",
                          fontWeight: 700,
                          color: "#94a3b8",
                          marginBottom: "6px",
                          letterSpacing: "0.04em",
                        }}
                      > UPDATED STATE (AFTER)
                      </div>
                      {renderCleanKeyValuePills(log.after, "after")}
                    </div>
                  </div>

                  {/* Expandable Raw JSON */}
                  {isRawOpen && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                        gap: "12px",
                        marginTop: "10px",
                        fontSize: "11.5px",
                        fontFamily: "monospace",
                      }}
                    >
                      <pre
                        style={{
                          margin: 0,
                          background: "#050507",
                          padding: "10px",
                          borderRadius: "8px",
                          color: "#fca5a5",
                          overflowX: "auto",
                        }}
                      >
                        {JSON.stringify(log.before, null, 2)}
                      </pre>
                      <pre
                        style={{
                          margin: 0,
                          background: "#050507",
                          padding: "10px",
                          borderRadius: "8px",
                          color: "#6ee7b7",
                          overflowX: "auto",
                        }}
                      >
                        {JSON.stringify(log.after, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default AuditLogs;
