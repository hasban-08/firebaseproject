import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { runFirstTimeSetup } from "../services/hrServer";

function FirstRunSetup({ onComplete }) {
  const [companyName, setCompanyName] = useState("WorkPulse Technologies");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [officeStartTime, setOfficeStartTime] = useState("09:00");
  const [officeEndTime, setOfficeEndTime] = useState("18:00");
  const [graceMinutes, setGraceMinutes] = useState(15);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await runFirstTimeSetup({
        companyName,
        adminName,
        adminEmail,
        adminPassword,
        officeStartTime,
        officeEndTime,
        graceMinutes,
      });
      if (onComplete) onComplete();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Setup failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at top, #1e1b4b 0%, #09090b 70%)",
        color: "#f8fafc",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "540px",
          background: "rgba(15, 23, 42, 0.88)",
          border: "1px solid rgba(139, 92, 246, 0.3)",
          borderRadius: "20px",
          padding: "32px",
          boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            display: "inline-block",
            background: "rgba(109, 58, 255, 0.2)",
            color: "#c4b5fd",
            padding: "5px 12px",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: 600,
            marginBottom: "12px",
          }}
        > FIRST-RUN SYSTEM INITIALIZATION
        </div>
        <h1 style={{ fontSize: "26px", fontWeight: 700, marginBottom: "6px" }}> Set Up Your Company Workspace
        </h1>
        <p style={{ color: "#94a3b8", fontSize: "14px", marginBottom: "24px" }}> Configure default office hours, grace period, and provision the primary System Administrator account.
        </p>

        {error && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              color: "#fca5a5",
              padding: "12px",
              borderRadius: "10px",
              fontSize: "13px",
              marginBottom: "18px",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "16px" }}>
          <div>
            <label style={{ display: "block", fontSize: "13px", color: "#cbd5e1", marginBottom: "6px" }}> Company Name *
            </label>
            <input
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. WorkPulse Technologies"
              style={inputStyle}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "#cbd5e1", marginBottom: "6px" }}> Start Time
              </label>
              <input
                type="time"
                value={officeStartTime}
                onChange={(e) => setOfficeStartTime(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "#cbd5e1", marginBottom: "6px" }}> End Time
              </label>
              <input
                type="time"
                value={officeEndTime}
                onChange={(e) => setOfficeEndTime(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "#cbd5e1", marginBottom: "6px" }}> Grace (Mins)
              </label>
              <input
                type="number"
                min="0"
                max="60"
                value={graceMinutes}
                onChange={(e) => setGraceMinutes(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <hr style={{ borderColor: "rgba(255,255,255,0.08)", margin: "4px 0" }} />

          <div>
            <label style={{ display: "block", fontSize: "13px", color: "#cbd5e1", marginBottom: "6px" }}> Primary Admin Full Name *
            </label>
            <input
              type="text"
              required
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="e.g. Hasban Abdullah"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", color: "#cbd5e1", marginBottom: "6px" }}> Admin Email *
            </label>
            <input
              type="email"
              required
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="admin@company.com"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", color: "#cbd5e1", marginBottom: "6px" }}> Admin Password (min 6 chars) *
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="--------"
              style={inputStyle}
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              marginTop: "8px",
              padding: "13px",
              borderRadius: "12px",
              border: "none",
              background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
              color: "#fff",
              fontWeight: 600,
              fontSize: "15px",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Initializing Workspace..." : "Initialize Company & Create Admin"}
          </button>
        </form>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(15, 23, 42, 0.9)",
  color: "#f8fafc",
  fontSize: "14px",
};

export default FirstRunSetup;
