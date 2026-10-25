import React, { useState } from "react";
import { auth, db } from "../firebase";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  signInWithPopup,
  GoogleAuthProvider,
  GithubAuthProvider
} from "firebase/auth";
import { setDoc, getDoc, doc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import "./css/Signup.css";

function Signup() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const provider = new GoogleAuthProvider();
  const githubProvider = new GithubAuthProvider();

  const createUserDocIfMissing = async (uid, name, userEmail) => {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        name,
        email: userEmail,
        role: "employee",
        salary: 0,
        createdAt: new Date(),
        profileComplete: false,
      });
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      await createUserDocIfMissing(
        result.user.uid,
        result.user.displayName,
        result.user.email
      );
      alert("Google Login Successful");
      navigate("/");
    } catch (error) {
      alert(error.message);
    }
  };

  const handleGithubLogin = async () => {
    try {
      const result = await signInWithPopup(auth, githubProvider);
      await createUserDocIfMissing(
        result.user.uid,
        result.user.displayName,
        result.user.email
      );
      alert("GitHub Login Successful");
      navigate("/");
    } catch (error) {
      alert(error.message);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      await updateProfile(userCredential.user, { displayName: username });
      await sendEmailVerification(userCredential.user);
      await createUserDocIfMissing(userCredential.user.uid, username, email);

      alert("Account Created Successfully");
      navigate("/login");
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <div className="signup-container">
      <h1 className="signup-title">Signup</h1>

      <form className="signup-form" onSubmit={handleSignup}>
        <input
          className="signup-input"
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <br /><br />
        <input
          className="signup-input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <br /><br />
        <input
          className="signup-input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <br />
        <p
          className="login-forgot"
          style={{ color: "blue", cursor: "pointer" }}
          onClick={() => navigate("/login")}
        > Already have an account?
        </p>
        <button className="signup-btn" type="submit">Signup</button>
      </form>

      <button className="social-btn google-btn" type="button" onClick={handleGoogleLogin}> Continue with Google
      </button>
      <button className="social-btn github-btn" type="button" onClick={handleGithubLogin}> Continue with GitHub
      </button>
    </div>
  );
}

export default Signup;