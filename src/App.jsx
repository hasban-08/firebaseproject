import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";

import Login from "./pages/Login";
import Profile from "./pages/Profile";
import Home from "./pages/Home";
import FirstRunSetup from "./pages/FirstRunSetup";
import ForceChangePassword from "./pages/ForceChangePassword";
import CompanySettings from "./pages/CompanySettings";
import AiAssistant from "./pages/AiAssistant";
import AuditLogs from "./pages/AuditLogs";

import MarkAttendance from "./pages/MarkAttendance";
import MyAttendance from "./pages/MyAttendance";
import AdminAttendance from "./pages/AdminAttendance";
import ManageSalary from "./pages/ManageSalary";
import DailyAttendance from "./pages/DailyAttendance";
import ManageSchedule from "./pages/ManageSchedule";
import CompleteProfile from "./pages/CompleteProfile";

import ProtectedRoute from "./components/ProtectedRoutes";
import ProfileGate from "./components/ProfileGate";
import FloatingChatWidget from "./components/FloatingChatWidget";

import LeaveRequest from "./pages/LeaveRequest";
import ManageLeaveRequests from "./pages/ManageLeaveRequests";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#09090b",
          color: "#cbd5e1",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "15px",
        }}
      >
        Loading WorkPulse HR Portal...
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/setup" element={<FirstRunSetup />} />

        {user ? (
          <>
            <Route path="/change-password" element={<ForceChangePassword />} />
            <Route path="/complete-profile" element={<CompleteProfile />} />

            <Route
              path="/"
              element={
                <ProfileGate>
                  <Home />
                </ProfileGate>
              }
            />
            <Route
              path="/profile"
              element={
                <ProfileGate>
                  <Profile />
                </ProfileGate>
              }
            />
            <Route
              path="/mark-attendance"
              element={
                <ProfileGate>
                  <MarkAttendance />
                </ProfileGate>
              }
            />
            <Route
              path="/my-attendance"
              element={
                <ProfileGate>
                  <MyAttendance />
                </ProfileGate>
              }
            />
            <Route
              path="/leave-request"
              element={
                <ProfileGate>
                  <LeaveRequest />
                </ProfileGate>
              }
            />
            <Route
              path="/manage-salary"
              element={
                <ProfileGate>
                  <ManageSalary />
                </ProfileGate>
              }
            />
            <Route
              path="/my-payslips"
              element={
                <ProfileGate>
                  <ManageSalary />
                </ProfileGate>
              }
            />
            <Route
              path="/ai-assistant"
              element={
                <ProfileGate>
                  <AiAssistant />
                </ProfileGate>
              }
            />

            {/* HR & Admin Protected Routes */}
            <Route
              path="/company-settings"
              element={
                <ProfileGate>
                  <ProtectedRoute hrOrAdmin>
                    <CompanySettings />
                  </ProtectedRoute>
                </ProfileGate>
              }
            />
            <Route
              path="/employee-attendance"
              element={
                <ProfileGate>
                  <ProtectedRoute hrOrAdmin>
                    <AdminAttendance />
                  </ProtectedRoute>
                </ProfileGate>
              }
            />
            <Route
              path="/manage-schedule"
              element={
                <ProfileGate>
                  <ProtectedRoute hrOrAdmin>
                    <ManageSchedule />
                  </ProtectedRoute>
                </ProfileGate>
              }
            />
            <Route
              path="/daily-attendance"
              element={
                <ProfileGate>
                  <ProtectedRoute hrOrAdmin>
                    <DailyAttendance />
                  </ProtectedRoute>
                </ProfileGate>
              }
            />
            <Route
              path="/manage-leaves"
              element={
                <ProfileGate>
                  <ProtectedRoute hrOrAdmin>
                    <ManageLeaveRequests />
                  </ProtectedRoute>
                </ProfileGate>
              }
            />
            <Route
              path="/audit-logs"
              element={
                <ProfileGate>
                  <ProtectedRoute hrOrAdmin>
                    <AuditLogs />
                  </ProtectedRoute>
                </ProfileGate>
              }
            />

            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={<Login />} />
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        )}
      </Routes>
      {user && <FloatingChatWidget />}
    </BrowserRouter>
  );
}

export default App;
