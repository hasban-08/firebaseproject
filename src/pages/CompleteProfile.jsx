import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase";
import { useNavigate, useLocation } from "react-router-dom";
import { getLocalDateStr } from "../utils/attendanceHelpers";
import {
  formatCnic,
  normalizePkMobile,
  isValidDob,
} from "../utils/validators";
import "./css/CompleteProfile.css";

function CompleteProfile() {
  const [role, setRole] = useState("employee");
  const [hrInfo, setHrInfo] = useState({
    department: "General",
    designation: "Staff",
    basicSalary: 0,
    cnic: "",
    bankMethod: "bank",
    providerName: "",
    accountTitle: "",
    accountNumber: "",
    iban: "",
  });
  const [form, setForm] = useState({
    fullName: "",
    dob: "1998-01-01",
    address: "",
    phone: "",
    emergencyName: "",
    emergencyRelation: "",
    emergencyPhone: "",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const cameFromRedirect = location.state?.incomplete;

  useEffect(() => {
    const fetchExisting = async () => {
      if (!auth.currentUser) return;
      const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
      if (snap.exists()) {
        const data = snap.data();
        setRole(data.role || "employee");
        setHrInfo({
          department: data.department || "General",
          designation: data.designation || "Staff",
          basicSalary: data.basicSalary ?? data.salary ?? 0,
          cnic: formatCnic(data.personalInfo?.cnic || ""),
          bankMethod: data.bankDetails?.method || "bank",
          providerName: data.bankDetails?.providerName || "-",
          accountTitle: data.bankDetails?.accountTitle || data.name || "-",
          accountNumber: data.bankDetails?.accountNumber || "-",
          iban: data.bankDetails?.iban || "",
        });
        setForm({
          fullName: data.personalInfo?.fullName || data.name || "",
          dob: data.personalInfo?.dob || "1998-01-01",
          address: data.personalInfo?.address || "",
          phone: data.personalInfo?.phone || "",
          emergencyName: data.emergencyContact?.name || "",
          emergencyRelation: data.emergencyContact?.relation || "",
          emergencyPhone: data.emergencyContact?.phone || "",
        });
      }
      setLoading(false);
    };
    fetchExisting();
  }, []);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const validate = () => {
    const e = {};
    if (form.fullName.trim().length < 3) e.fullName = "Full name is required";
    if (!isValidDob(form.dob)) e.dob = "Please select a valid date of birth (min age 16)";
    if (!normalizePkMobile(form.phone))
      e.phone = "Enter valid mobile number (03XX-XXXXXXX)";
    if (form.address.trim().length < 6)
      e.address = "Please enter your complete residential address";

    if (form.emergencyName.trim().length < 3)
      e.emergencyName = "Emergency contact name is required";
    if (!form.emergencyRelation) e.emergencyRelation = "Select relation";
    const emergencyPhone = normalizePkMobile(form.emergencyPhone);
    if (!emergencyPhone) {
      e.emergencyPhone = "Enter valid mobile number (03XX-XXXXXXX)";
    } else if (emergencyPhone === normalizePkMobile(form.phone)) {
      e.emergencyPhone = "Emergency number must belong to a family member, not your own phone";
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
      const existingPersonal = snap.exists() ? snap.data().personalInfo || {} : {};

      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        name: form.fullName.trim(),
        personalInfo: {
          ...existingPersonal,
          fullName: form.fullName.trim(),
          dob: form.dob,
          address: form.address.trim(),
          phone: normalizePkMobile(form.phone),
        },
        emergencyContact: {
          name: form.emergencyName.trim(),
          relation: form.emergencyRelation,
          phone: normalizePkMobile(form.emergencyPhone),
        },
        profileComplete: true,
        updatedAt: serverTimestamp(),
      });
      navigate("/");
    } catch (error) {
      window.alert(`${error.code || "Error"}: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="cp-loading">Loading...</p>;

  return (
    <div className="cp-page">
      <div className="cp-card">
        {cameFromRedirect && (
          <div className="cp-alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
              <path d="M12 8v5M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg> Please complete your contact & emergency details before continuing.
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 className="cp-title">My Profile & Contact Info</h1>
          <button
            type="button"
            onClick={() => navigate("/")}
            style={{
              padding: "7px 14px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.15)",
              background: "transparent",
              color: "#cbd5e1",
              cursor: "pointer",
            }}
          > Back
          </button>
        </div>
        <p className="cp-sub"> Update your phone number, residential address, and emergency contact. Official HR records (CNIC, Bank Account, and Salary Structure) are managed by HR/Admin.
        </p>

        <h2 className="cp-section-title">Editable Personal & Contact Details</h2>
        <div className="cp-fields">
          <label> Full Name
            <input
              value={form.fullName}
              onChange={(e) => handleChange("fullName", e.target.value)}
            />
            {errors.fullName && <span className="cp-error">{errors.fullName}</span>}
          </label>
          <label> Date of Birth
            <input
              type="date"
              min="1940-01-01"
              max={getLocalDateStr()}
              value={form.dob}
              onChange={(e) => handleChange("dob", e.target.value)}
            />
            {errors.dob && <span className="cp-error">{errors.dob}</span>}
          </label>
          <label className="cp-full-width"> Phone Number *
            <input
              inputMode="tel"
              placeholder="03XX-XXXXXXX"
              value={form.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
            />
            {errors.phone && <span className="cp-error">{errors.phone}</span>}
          </label>
          <label className="cp-full-width"> Residential Address *
            <textarea
              value={form.address}
              onChange={(e) => handleChange("address", e.target.value)}
            />
            {errors.address && <span className="cp-error">{errors.address}</span>}
          </label>
        </div>

        <h2 className="cp-section-title">Emergency Contact</h2>
        <p className="cp-note"> Family member whom the office can contact in case of emergency.
        </p>
        <div className="cp-fields">
          <label> Contact Name
            <input
              value={form.emergencyName}
              onChange={(e) => handleChange("emergencyName", e.target.value)}
            />
            {errors.emergencyName && (
              <span className="cp-error">{errors.emergencyName}</span>
            )}
          </label>
          <label> Relation
            <select
              value={form.emergencyRelation}
              onChange={(e) => handleChange("emergencyRelation", e.target.value)}
            >
              <option value="">Select</option>
              <option value="Father">Father</option>
              <option value="Mother">Mother</option>
              <option value="Brother">Brother</option>
              <option value="Sister">Sister</option>
              <option value="Spouse">Spouse</option>
              <option value="Other">Other</option>
            </select>
            {errors.emergencyRelation && (
              <span className="cp-error">{errors.emergencyRelation}</span>
            )}
          </label>
          <label className="cp-full-width"> Emergency Mobile Number
            <input
              inputMode="tel"
              placeholder="03XX-XXXXXXX"
              value={form.emergencyPhone}
              onChange={(e) => handleChange("emergencyPhone", e.target.value)}
            />
            {errors.emergencyPhone && (
              <span className="cp-error">{errors.emergencyPhone}</span>
            )}
          </label>
        </div>

        <h2 className="cp-section-title">HR-Managed Official Info (Read-Only)</h2>
        <p className="cp-note"> CNIC, Department, Bank Details, and Salary are maintained by HR/Admin ({role.toUpperCase()} role).
        </p>
        <div className="cp-fields">
          <label> Department & Designation
            <input
              disabled
              value={`${hrInfo.department} - ${hrInfo.designation}`}
              style={{ opacity: 0.65 }}
            />
          </label>
          <label> CNIC (Managed by HR)
            <input
              disabled
              value={hrInfo.cnic || "Pending HR entry"}
              style={{ opacity: 0.65 }}
            />
          </label>
          <label> Bank / Payment Provider
            <input
              disabled
              value={`${hrInfo.providerName} (${hrInfo.accountNumber})`}
              style={{ opacity: 0.65 }}
            />
          </label>
          <label> Basic / Gross Salary
            <input
              disabled
              value={`Basic: Rs. ${Number(hrInfo.basicSalary).toLocaleString()} | Gross: Rs. ${Math.round(
                Number(hrInfo.basicSalary) * 1.5
              ).toLocaleString()}`}
              style={{ opacity: 0.65 }}
            />
          </label>
        </div>

        <button className="cp-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Contact & Emergency Info"}
        </button>
      </div>
    </div>
  );
}

export default CompleteProfile;
