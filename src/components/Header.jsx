import { Navbar, Nav, Container, Button } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import "./ComponentsCss/Header.css";

function Header() {
    const navigate = useNavigate();

    const handleLogout = async () => {
        await signOut(auth);
        navigate("/login");
    };
    

    return (
        <nav className="header-navbar">
            <div className="header-inner">

                {/* Brand */}
                <div className="header-brand" onClick={() => navigate("/home")}>
                    <svg className="header-brand-icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 20a6 6 0 0 0-12 0"/>
                        <circle cx="12" cy="10" r="4"/>
                        <circle cx="12" cy="12" r="10"/>
                    </svg>
                    <span>Social App</span>
                </div>

                {/* Nav links */}
                <div className="header-nav">

                    <div className="header-nav-item" onClick={() => navigate("/")}>
                        <span className="header-nav-icon">
                            {/* Home icon */}
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                                <polyline points="9 22 9 12 15 12 15 22"/>
                            </svg>
                        </span>
                        <span className="header-nav-label">Home</span>
                    </div>

                    <div className="header-nav-item" onClick={() => navigate("/create-post")}>
                        <span className="header-nav-icon">
                            {/* Plus icon */}
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="8" x2="12" y2="16"/>
                                <line x1="8" y1="12" x2="16" y2="12"/>
                            </svg>
                        </span>
                        <span className="header-nav-label">Create Post</span>
                    </div>

                    <div className="header-nav-item" onClick={() => navigate("/profile")}>
                        <span className="header-nav-icon">
                            {/* Profile icon */}
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="8" r="4"/>
                                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                            </svg>
                        </span>
                        <span className="header-nav-label">Profile</span>
                    </div>

                </div>

                {/* Logout */}
                <button className="header-logout-btn" onClick={handleLogout}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                        <polyline points="16 17 21 12 16 7"/>
                        <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    <span className="header-logout-label">Logout</span>
                </button>

            </div>
        </nav>
    );
}

export default Header;