import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { completeFirstLoginPasswordChange } from "../services/hrServer";

function ForceChangePassword() {
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPass.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (newPass !== confirmPass) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      await completeFirstLoginPasswordChange(newPass);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Could not update password. Please re-login and try again.");
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
          maxWidth: "440px",
          background: "rgba(15, 23, 42, 0.9)",
          border: "1px solid rgba(245, 158, 11, 0.35)",
          borderRadius: "18px",
          padding: "30px",
        }}
      >
        <span
          style={{
            display: "inline-block",
            background: "rgba(245, 158, 11, 0.15)",
            color: "#fcd34d",
            padding: "4px 10px",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: 600,
            marginBottom: "10px",
          }}
        >
          SECURITY REQUIREMENT
        </span>
        <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "8px" }}>
          Change Temporary Password
        </h2>
        <p style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "20px" }}>
          Your account was provisioned by HR/Admin with a temporary password. You must set a new personal password before accessing the portal.
        </p>

        {error && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              color: "#fca5a5",
              padding: "10px",
              borderRadius: "8px",
              fontSize: "13px",
              marginBottom: "14px",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "14px" }}>
          <div>
            <label style={{ display: "block", fontSize: "13px", color: "#cbd5e1", marginBottom: "6px" }}>
              New Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="Enter new password"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(15, 23, 42, 0.9)",
                color: "#fff",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", color: "#cbd5e1", marginBottom: "6px" }}>
              Confirm New Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              placeholder="Confirm new password"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(15, 23, 42, 0.9)",
                color: "#fff",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "12px",
              borderRadius: "10px",
              border: "none",
              background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {saving ? "Updating Password..." : "Update Password & Continue"}
          </button>

          <button
            type="button"
            onClick={() => signOut(auth)}
            style={{
              padding: "10px",
              borderRadius: "10px",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "transparent",
              color: "#94a3b8",
              cursor: "pointer",
            }}
          >
            Sign Out
          </button>
        </form>
      </div>
    </div>
  );
}

export default ForceChangePassword;
