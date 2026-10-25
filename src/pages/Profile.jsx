import { useState } from "react";
import { auth } from "../firebase";
import {
    updateProfile,
    signOut,
    sendEmailVerification
} from "firebase/auth";
import { useNavigate } from "react-router-dom";

import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";

import Header from "../components/Header";

import "./css/Profile.css";

function Profile() {

    const user = auth.currentUser;
    const navigate = useNavigate();

    const [show, setShow] = useState(false);
    const [name, setName] = useState("");
    const [photo, setPhoto] = useState("");

    const handleLogout = async () => {
        try {

            await signOut(auth);

            alert("Logged out successfully");

            navigate("/login");

        } catch (error) {

            alert(error.message);

        }
    };

    const handleResendVerification = async () => {

        try {

            await sendEmailVerification(auth.currentUser);

            alert("Verification email sent successfully.");

        } catch (error) {

            alert(error.message);

        }

    };

    const handleSave = async () => {

        try {

            await updateProfile(auth.currentUser, {

                displayName: name || user.displayName,

                photoURL: photo || user.photoURL

            });

            alert("Profile Updated");

            setShow(false);

            window.location.reload();

        } catch (error) {

            alert(error.message);

        }

    };

    if (!user) return null;

    return (
        <>
            <Header />

            <div className="dashboard-container">

                <h1 className="dashboard-title"> My Profile
                </h1>

                {!user.emailVerified && (

                    <div className="alert alert-warning mt-3 verify-banner">

                        <strong>Email Not Verified!</strong>

                        <br /> Please verify your email.

                        <div className="mt-2">

                            <Button
                                variant="warning"
                                onClick={handleResendVerification}
                            > Resend Verification Email
                            </Button>

                        </div>

                    </div>

                )}

                <div className="profile-card">

                    {user.photoURL ? (

                        <img
                            className="profile-avatar"
                            src={user.photoURL}
                            alt="Profile"
                            width="100"
                            height="100"
                            style={{ borderRadius: "50%" }}
                        />

                    ) : (

                        <div className="profile-avatar-placeholder">

                            {user.displayName?.charAt(0).toUpperCase()}

                        </div>

                    )}

                    <h2 className="profile-welcome"> Welcome Back
                    </h2>

                    <p className="profile-name">
                        {user.displayName}
                    </p>

                    <p className="profile-email">
                        {user.email}
                    </p>

                    <div className="dashboard-actions">

                        <Button
                            variant="primary"
                            onClick={() => setShow(true)}
                        > Update Profile
                        </Button>

                        <Button
                            variant="danger"
                            onClick={handleLogout}
                        > Logout
                        </Button>

                    </div>

                </div>

                <Modal
                    show={show}
                    onHide={() => setShow(false)}
                >

                    <Modal.Header closeButton>

                        <Modal.Title> Update Profile

                        </Modal.Title>

                    </Modal.Header>

                    <Modal.Body>

                        <input
                            type="text"
                            className="form-control mb-3"
                            placeholder="New Username"
                            onChange={(e) => setName(e.target.value)}
                        />

                        <input
                            type="text"
                            className="form-control"
                            placeholder="Profile Image URL"
                            onChange={(e) => setPhoto(e.target.value)}
                        />

                    </Modal.Body>

                    <Modal.Footer>

                        <Button
                            variant="secondary"
                            onClick={() => setShow(false)}
                        > Close
                        </Button>

                        <Button
                            variant="primary"
                            onClick={handleSave}
                        > Save Changes
                        </Button>

                    </Modal.Footer>

                </Modal>

            </div>

        </>
    );
}

export default Profile;