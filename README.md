# 🚀 WorkPulse — AI-Powered HR, Attendance, Leave & Payroll Platform

WorkPulse is a full-stack HR, Attendance, Leave Quota, Payroll, Analytics, and AI Assistant platform built with **React**, **Firebase (Auth & Firestore)**, **Vercel Serverless Functions (`firebase-admin`)**, **Recharts**, **jsPDF**, and **Google Gemini AI**.

---

## ✨ Key Capabilities Implemented

### 1. Security, 3 Roles & First-Run Setup (P0)
- **3 Distinct Roles**: `admin`, `hr`, and `employee` enforced in both UI routing (`ProtectedRoute`) and server-side `firestore.rules` + `/api/*` endpoints.
- **First-Run Setup (`/setup`)**: If `settings/company` does not exist on a fresh install, the app automatically redirects to `/setup` to configure Company Name, Office Hours (`09:00`–`18:00`), Grace Period (`15` mins), and create the initial **Admin** account.
- **No Public Signup**: Accounts are provisioned exclusively by **Admin** or **HR** (`/company-settings`) with a temporary password (`mustChangePassword: true`), forcing a password change on first login (`/change-password`).
- **Field-Level Privacy**: Employees can only edit their contact info (`phone`, `address`, `dob`, `emergencyContact`). Official HR fields (`role`, `basicSalary`, `cnic`, `bankDetails`) are strictly locked to `admin` and `hr` in `firestore.rules`.

### 2. Core HR Flows — Self Check-In/Out, Quotas & Payroll (P1)
- **Employee Self Check-In & Check-Out (`/mark-attendance`)**:
  - Server-stamped check-in and check-out times.
  - Duplicate check-in on the same day returns **`409 Conflict`**.
  - Automatic statuses: `present` (`<= 09:15`), `late` (`> 09:15`), `half_day` (`< 5` worked hours on checkout), `missing_checkout`, and `absent`.
  - **Haversine GPS Geofence** verification + optional Camera verification preview.
- **Attendance Correction Workflow**:
  - Employees submit correction requests with date, times, and reason (`/mark-attendance`).
  - HR/Admin reviews and approves/rejects requests (`/daily-attendance`), automatically updating attendance and logging to `audit_logs`.
- **Leave Engine with Quotas & Working Days (`/leave-request` & `/manage-leaves`)**:
  - Quotas: **Annual (14)**, **Sick (8)**, **Casual (10)**, **Unpaid (Unlimited)**.
  - Automatically skips weekends (`Sat`/`Sun`) and configured `public_holidays` when counting working days.
  - Returns **`422 Unprocessable Entity`** on overlapping leave dates or insufficient quota balance.
  - Employees can cancel pending requests; HR/Admin can approve/reject with comments.
- **Structured Payroll Engine & Payslip PDF (`/manage-salary`)**:
  - Salary structure: `Gross Salary = 1.5 × Basic Salary` (`Basic` + `30% HRA` + `10% Medical` + `10% Conveyance`).
  - Deductions: `Per-Day Rate = Gross / Working Days`, deducting `Absent` days, `Unpaid` leave days, `Half-Days (0.5d)`, and Bonus Late Penalty (`3 lates = 0.5 day`), plus progressive **FBR Income Tax Slabs**.
  - Workflow: **Generate Monthly Draft** → **Admin Finalize & Lock** (`status = "locked"`).
  - **Official Payslip PDF**: Every employee can download their formatted monthly Payslip PDF.

### 3. Server-Computed Analytics & Recharts Dashboards (P2)
- **Admin / HR Dashboard (`/`)**:
  - Date range and Department filters.
  - 5 KPI Cards: Total Headcount, Present Today, On Leave Today, Late Today, Pending Approvals.
  - **Recharts Visualizations**: Attendance Trend Area Chart, Absenteeism by Department Bar Chart, and Top-5 Late-Comers leaderboard.
- **Employee Personal Dashboard (`/`)**:
  - Weekly hours worked vs `40h` target progress bar, Leave Quota balance cards, Latest Payslip summary with PDF download, and Quick Check-In/Out widget.

### 4. Gemini AI Assistant & Smart Workflows (P3)
- **Tool-Calling HR Assistant (`/ai-assistant` & `/api/ai-chat`)**:
  - Role-scoped tools: `get_headcount`, `get_attendance_summary`, `get_late_comers`, `get_leave_summary`, `get_my_leave_balance`, `get_payroll_summary`, `search_employees`.
  - Understands **English** and **Roman Urdu**.
- **Dashboard Executive Summarizer**: Generates 3–5 bullet points strictly from the computed dashboard metrics.
- **Smart Leave NLP Parser**: Converts natural language / Roman Urdu (e.g., *"agle Monday Tuesday off chahiye, shaadi hai"*) into pre-filled leave form fields for user confirmation.
- **Guardrails**: Server-side `GEMINI_API_KEY`, 15-second timeout, 20 requests/hour rate limit tracked in `ai_logs`, and `AI-generated` labels.

### 5. Communications & Immutable Audit Trail (P4)
- **Company Announcements** & **In-App Notifications** (bell icon alerts on leave decisions and payslip lock).
- **Immutable Audit Logs (`/audit-logs`)**: Tracks `actor`, `action`, `entity`, and `before`/`after` JSON snapshots, with `allow update, delete: if false;` in `firestore.rules`.

---

## 🛠️ Local Setup & Running Instructions

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in your Firebase project credentials and `GEMINI_API_KEY`.

3. **Run Development Server**:
   ```bash
   npm start
   ```

4. **First-Run Setup (Fresh Install)**:
   - Open `http://localhost:3000/setup` (or if `settings/company` is empty, the app redirects automatically).
   - Enter your Company Name, Office Timings, and create the first **Admin** account.

5. **Run Unit Tests**:
   ```bash
   npm test -- --watchAll=false
   ```

6. **Deploy Firestore Security Rules**:
   ```bash
   firebase deploy --only firestore:rules
   ```
