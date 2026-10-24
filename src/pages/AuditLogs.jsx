import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query, limit } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";

function AuditLogs() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState("ALL");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, "audit_logs"),
          orderBy("createdAt", "desc"),
          limit(100)
        );
        const snap = await getDocs(q);
        setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("AuditLogs load error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const actions = Array.from(new Set(["ALL", ...logs.map((l) => l.action).filter(Boolean)]));
  const filtered =
    filterAction === "ALL"
      ? logs
      : logs.filter((l) => l.action === filterAction);

  return (
    <div style={{ minHeight: "100vh", background: "#09090b", color: "#f8fafc" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "18px 28px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(15, 23, 42, 0.9)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #10b981, #059669)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
            }}
          >
            🛡
          </div>
          <div>
            <h1 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>
              Immutable System Audit Trail
            </h1>
            <span style={{ fontSize: "12px", color: "#6ee7b7" }}>
              Append-Only Security Log (`allow update, delete: if false` in Firestore Rules)
            </span>
          </div>
        </div>
        <button
          onClick={() => navigate("/")}
          style={{
            padding: "8px 14px",
            borderRadius: "9px",
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.05)",
            color: "#e2e8f0",
            cursor: "pointer",
          }}
        >
          ← Back to Dashboard
        </button>
      </header>

      <div style={{ maxWidth: "1140px", margin: "0 auto", padding: "24px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "18px",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <label style={{ fontSize: "12.5px", color: "#94a3b8", marginRight: "8px" }}>
              Filter by Action:
            </label>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(15, 23, 42, 0.9)",
                color: "#fff",
              }}
            >
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <span style={{ fontSize: "12.5px", color: "#94a3b8" }}>
            Showing {filtered.length} immutable event(s)
          </span>
        </div>

        {loading ? (
          <p style={{ color: "#94a3b8" }}>Loading audit logs...</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>No audit logs recorded yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "12px" }}>
            {filtered.map((log) => (
              <div
                key={log.id}
                style={{
                  background: "rgba(15, 23, 42, 0.85)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "14px",
                  padding: "16px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "8px",
                    marginBottom: "10px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span
                      style={{
                        padding: "4px 10px",
                        borderRadius: "999px",
                        background: "rgba(124, 58, 237, 0.22)",
                        color: "#c4b5fd",
                        fontSize: "11.5px",
                        fontWeight: 700,
                        fontFamily: "monospace",
                      }}
                    >
                      {log.action}
                    </span>
                    <span style={{ fontSize: "13px", fontWeight: 600 }}>
                      Actor: {log.actorName || "User"} ({log.actorRole || "user"})
                    </span>
                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                      Entity: {log.entity} {log.entityId ? `#${log.entityId}` : ""}
                    </span>
                  </div>
                  <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                    {log.createdAt?.toDate
                      ? log.createdAt.toDate().toLocaleString()
                      : "Just now"}
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                    fontSize: "11.5px",
                    fontFamily: "monospace",
                  }}
                >
                  <div
                    style={{
                      background: "rgba(9, 9, 11, 0.7)",
                      padding: "10px",
                      borderRadius: "8px",
                      color: "#fca5a5",
                      overflowX: "auto",
                    }}
                  >
                    <div style={{ color: "#94a3b8", marginBottom: "4px" }}>BEFORE:</div>
                    {log.before ? JSON.stringify(log.before, null, 2) : "null"}
                  </div>
                  <div
                    style={{
                      background: "rgba(9, 9, 11, 0.7)",
                      padding: "10px",
                      borderRadius: "8px",
                      color: "#6ee7b7",
                      overflowX: "auto",
                    }}
                  >
                    <div style={{ color: "#94a3b8", marginBottom: "4px" }}>AFTER:</div>
                    {log.after ? JSON.stringify(log.after, null, 2) : "null"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AuditLogs;
