import { useEffect, useState } from "react";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { checkCompanySetup } from "../services/hrServer";
import "./css/Login.css";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [setupInitialized, setSetupInitialized] = useState(true);
  const navigate = useNavigate();

  const [show, setShow] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  useEffect(() => {
    let cancelled = false;
    checkCompanySetup().then((res) => {
      if (!cancelled) {
        setSetupInitialized(res.initialized);
        if (!res.initialized) {
          navigate("/setup", { replace: true });
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      navigate("/");
    } catch (error) {
      setErrorMsg("Invalid email or password. Please contact HR/Admin if you need an account.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    try {
      await sendPasswordResetEmail(auth, resetEmail.trim());
      window.alert("Password reset email sent.");
      setShow(false);
    } catch (error) {
      window.alert(error.message);
    }
  };

  return (
    <div className="login-container">
      <h1 className="login-title">WorkPulse HR Portal</h1>
      <p style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "18px", textAlign: "center" }}>
        Sign in with your company credentials issued by Admin / HR
      </p>

      {!setupInitialized && (
        <div
          style={{
            background: "rgba(124, 58, 237, 0.18)",
            border: "1px solid rgba(124, 58, 237, 0.45)",
            padding: "12px 16px",
            borderRadius: "12px",
            marginBottom: "16px",
            textAlign: "center",
          }}
        >
          <p style={{ margin: "0 0 8px", fontSize: "13px", color: "#ddd6fe" }}>
            Fresh installation detected! Initialize your company settings and Admin account first.
          </p>
          <button
            type="button"
            onClick={() => navigate("/setup")}
            style={{
              padding: "8px 14px",
              borderRadius: "8px",
              border: "none",
              background: "#7c3aed",
              color: "#fff",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Go to First-Run Setup
          </button>
        </div>
      )}

      {errorMsg && (
        <p
          style={{
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.35)",
            color: "#fca5a5",
            padding: "10px 14px",
            borderRadius: "10px",
            fontSize: "13px",
            maxWidth: "360px",
            textAlign: "center",
          }}
        >
          {errorMsg}
        </p>
      )}

      <form className="login-form" onSubmit={handleLogin}>
        <input
          className="login-input"
          type="email"
          required
          placeholder="Company Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <br />
        <br />

        <input
          className="login-input"
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <br />
        <br />

        <button className="login-btn" type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p
        className="login-forgot"
        style={{ color: "#a78bfa", cursor: "pointer", marginTop: "14px" }}
        onClick={() => setShow(true)}
      >
        Forgot Password?
      </p>

      <p style={{ color: "rgba(240, 238, 255, 0.45)", fontSize: "12px", marginTop: "8px" }}>
        Public signup is disabled. Accounts are provisioned exclusively by Admin & HR.
      </p>

      <Modal className="login-modal" show={show} onHide={() => setShow(false)}>
        <Modal.Header className="modal-header-custom" closeButton>
          <Modal.Title className="modal-title-custom">Reset Password</Modal.Title>
        </Modal.Header>

        <Modal.Body className="modal-body-custom">
          <input
            type="email"
            placeholder="Enter your company email"
            className="form-control modal-input"
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
          />
        </Modal.Body>

        <Modal.Footer className="modal-footer-custom">
          <Button variant="secondary" onClick={() => setShow(false)}>
            Close
          </Button>

          <Button variant="primary" onClick={handleReset}>
            Send Reset Link
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default Login;
