import { useState } from "react";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import "./css/Login.css";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const [show, setShow] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      await signInWithEmailAndPassword(auth, email, password);
      alert("Login Successful");
      navigate("/dashboard");
    } catch (error) {
      alert(error.message);
    }
  };

  const handleReset = async () => {
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      alert("Reset email sent");
      setShow(false);
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <div className="login-container">
      <h1 className="login-title">Login</h1>

      <form className="login-form" onSubmit={handleLogin}>
        <input
          className="login-input"
          type="email"
          placeholder="Email"
          onChange={(e) => setEmail(e.target.value)}
        />

        <br /><br />

        <input
          className="login-input"
          type="password"
          placeholder="Password"
          onChange={(e) => setPassword(e.target.value)}
        />

        <br /><br />

        <button className="login-btn" type="submit">Login</button>
      </form>

      <p
        className="login-forgot"
        style={{ color: "blue", cursor: "pointer" }}
        onClick={() => setShow(true)}
      >
        Forgot Password?
      </p>

      <p
        className="login-forgot"
        style={{ color: "blue", cursor: "pointer" }}
        onClick={() => navigate("/")}
      >
        Dont have an account?
      </p>

      <Modal className="login-modal" show={show} onHide={() => setShow(false)}>
        <Modal.Header className="modal-header-custom" closeButton>
          <Modal.Title className="modal-title-custom">Reset Password</Modal.Title>
        </Modal.Header>

        <Modal.Body className="modal-body-custom">
          <input
            type="email"
            placeholder="Enter your email"
            className="form-control modal-input"
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