import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { useNavigate, useLocation } from "react-router-dom";
import { getLocalDateStr } from "../utils/attendanceHelpers";
import {
  formatCnic,
  isValidCnic,
  normalizePkMobile,
  isValidIban,
  isValidDob,
} from "../utils/validators";
import "./css/CompleteProfile.css";

function CompleteProfile() {
  const [form, setForm] = useState({
    fullName: "", cnic: "", dob: "", address: "", phone: "",
    method: "bank", providerName: "", accountTitle: "", accountNumber: "", iban: "",
    emergencyName: "", emergencyRelation: "", emergencyPhone: "",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const cameFromRedirect = location.state?.incomplete;

  useEffect(() => {
    const fetchExisting = async () => {
      const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
      if (snap.exists()) {
        const data = snap.data();
        setForm((prev) => ({
          ...prev,
          fullName: data.personalInfo?.fullName || data.name || "",
          cnic: formatCnic(data.personalInfo?.cnic || ""),
          dob: data.personalInfo?.dob || "",
          address: data.personalInfo?.address || "",
          phone: data.personalInfo?.phone || "",
          method: data.bankDetails?.method || "bank",
          providerName: data.bankDetails?.providerName || "",
          accountTitle: data.bankDetails?.accountTitle || "",
          accountNumber: data.bankDetails?.accountNumber || "",
          iban: data.bankDetails?.iban || "",
          emergencyName: data.emergencyContact?.name || "",
          emergencyRelation: data.emergencyContact?.relation || "",
          emergencyPhone: data.emergencyContact?.phone || "",
        }));
      }
      setLoading(false);
    };
    fetchExisting();
  }, []);

  const handleChange = (field, value) => {
    const v = field === "cnic" ? formatCnic(value) : value;
    setForm((prev) => ({ ...prev, [field]: v }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const validate = () => {
    const e = {};

    if (form.fullName.trim().length < 3) e.fullName = "Poora naam likho";
    if (!isValidCnic(form.cnic)) e.cnic = "CNIC 13 digits ka hona chahiye (XXXXX-XXXXXXX-X)";
    if (!isValidDob(form.dob)) e.dob = "Sahi date of birth select karo (kam az kam 16 saal umar)";
    if (!normalizePkMobile(form.phone)) e.phone = "Sahi mobile number likho (03XX-XXXXXXX)";
    if (form.address.trim().length < 10) e.address = "Poora address likho";

    if (!form.providerName.trim()) {
      e.providerName = form.method === "bank" ? "Bank ka naam likho" : "Wallet ka naam likho";
    }
    if (form.accountTitle.trim().length < 3) e.accountTitle = "Account holder ka naam likho";

    if (form.method === "bank") {
      if (form.accountNumber.replace(/\s/g, "").length < 6) {
        e.accountNumber = "Sahi account number likho";
      }
      if (form.iban.trim() && !isValidIban(form.iban)) {
        e.iban = "IBAN sahi nahi (PK + 22 characters, checksum match nahi hua)";
      }
    } else if (!normalizePkMobile(form.accountNumber)) {
      e.accountNumber = "Wallet ka sahi mobile number likho (03XX-XXXXXXX)";
    }

    if (form.emergencyName.trim().length < 3) e.emergencyName = "Emergency contact ka naam likho";
    if (!form.emergencyRelation) e.emergencyRelation = "Rishta select karo";
    const emergencyPhone = normalizePkMobile(form.emergencyPhone);
    if (!emergencyPhone) {
      e.emergencyPhone = "Sahi mobile number likho (03XX-XXXXXXX)";
    } else if (emergencyPhone === normalizePkMobile(form.phone)) {
      e.emergencyPhone = "Ye apna number nahi, kisi family member ka hona chahiye";
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        personalInfo: {
          fullName: form.fullName.trim(),
          cnic: form.cnic,
          dob: form.dob,
          address: form.address.trim(),
          phone: normalizePkMobile(form.phone),
        },
        bankDetails: {
          method: form.method,
          providerName: form.providerName.trim(),
          accountTitle: form.accountTitle.trim(),
          accountNumber:
            form.method === "bank"
              ? form.accountNumber.trim()
              : normalizePkMobile(form.accountNumber),
          iban:
            form.method === "bank"
              ? form.iban.replace(/\s+/g, "").toUpperCase()
              : "",
        },
        emergencyContact: {
          name: form.emergencyName.trim(),
          relation: form.emergencyRelation,
          phone: normalizePkMobile(form.emergencyPhone),
        },
        profileComplete: true,
      });
      alert("Profile completed");
      navigate("/");
    } catch (error) {
      console.error("CompleteProfile save error:", {
        code: error.code,
        message: error.message,
        uid: auth.currentUser?.uid,
      });

      alert(`${error.code}: ${error.message}`);
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
            </svg>
            Please complete your profile before you can continue.
          </div>
        )}

        <h1 className="cp-title">Complete your profile</h1>
        <p className="cp-sub">
          We need a few details to set up your payroll and records.
        </p>

        <h2 className="cp-section-title">Personal Details</h2>
        <div className="cp-fields">
          <label>Full Name
            <input value={form.fullName} onChange={(e) => handleChange("fullName", e.target.value)} />
            {errors.fullName && <span className="cp-error">{errors.fullName}</span>}
          </label>
          <label>CNIC
            <input
              inputMode="numeric"
              placeholder="XXXXX-XXXXXXX-X"
              value={form.cnic}
              onChange={(e) => handleChange("cnic", e.target.value)}
            />
            {errors.cnic && <span className="cp-error">{errors.cnic}</span>}
          </label>
          <label>Date of Birth
            <input
              type="date"
              min="1930-01-01"
              max={getLocalDateStr()}
              value={form.dob}
              onChange={(e) => handleChange("dob", e.target.value)}
            />
            {errors.dob && <span className="cp-error">{errors.dob}</span>}
          </label>
          <label>Phone Number
            <input
              inputMode="tel"
              placeholder="03XX-XXXXXXX"
              value={form.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
            />
            {errors.phone && <span className="cp-error">{errors.phone}</span>}
          </label>
          <label className="cp-full-width">Address
            <textarea value={form.address} onChange={(e) => handleChange("address", e.target.value)} />
            {errors.address && <span className="cp-error">{errors.address}</span>}
          </label>
        </div>

        <h2 className="cp-section-title">Payment Details</h2>
        <div className="cp-fields">
          <label>Payment Method
            <select value={form.method} onChange={(e) => handleChange("method", e.target.value)}>
              <option value="bank">Bank Transfer</option>
              <option value="jazzcash">JazzCash</option>
              <option value="easypaisa">Easypaisa</option>
            </select>
          </label>
          <label>
            {form.method === "bank" ? "Bank Name" : "Wallet Name"}
            <input value={form.providerName} onChange={(e) => handleChange("providerName", e.target.value)} />
            {errors.providerName && <span className="cp-error">{errors.providerName}</span>}
          </label>
          <label>Account Holder Name
            <input value={form.accountTitle} onChange={(e) => handleChange("accountTitle", e.target.value)} />
            {errors.accountTitle && <span className="cp-error">{errors.accountTitle}</span>}
          </label>
          <label>
            {form.method === "bank" ? "Account Number" : "Wallet Mobile Number"}
            <input
              placeholder={form.method === "bank" ? "" : "03XX-XXXXXXX"}
              value={form.accountNumber}
              onChange={(e) => handleChange("accountNumber", e.target.value)}
            />
            {errors.accountNumber && <span className="cp-error">{errors.accountNumber}</span>}
          </label>
          {form.method === "bank" && (
            <label className="cp-full-width">IBAN (optional)
              <input
                placeholder="PK00XXXX0000000000000000"
                value={form.iban}
                onChange={(e) => handleChange("iban", e.target.value)}
              />
              {errors.iban && <span className="cp-error">{errors.iban}</span>}
            </label>
          )}
        </div>

        <h2 className="cp-section-title">Emergency Contact</h2>
        <p className="cp-note">
          Parent, sibling ya koi family member jise office zaroorat par contact kar sake.
        </p>
        <div className="cp-fields">
          <label>Contact Name
            <input value={form.emergencyName} onChange={(e) => handleChange("emergencyName", e.target.value)} />
            {errors.emergencyName && <span className="cp-error">{errors.emergencyName}</span>}
          </label>
          <label>Relation
            <select value={form.emergencyRelation} onChange={(e) => handleChange("emergencyRelation", e.target.value)}>
              <option value="">Select</option>
              <option value="Father">Father</option>
              <option value="Mother">Mother</option>
              <option value="Brother">Brother</option>
              <option value="Sister">Sister</option>
              <option value="Spouse">Spouse</option>
              <option value="Other">Other</option>
            </select>
            {errors.emergencyRelation && <span className="cp-error">{errors.emergencyRelation}</span>}
          </label>
          <label className="cp-full-width">Contact Mobile Number
            <input
              inputMode="tel"
              placeholder="03XX-XXXXXXX"
              value={form.emergencyPhone}
              onChange={(e) => handleChange("emergencyPhone", e.target.value)}
            />
            {errors.emergencyPhone && <span className="cp-error">{errors.emergencyPhone}</span>}
          </label>
        </div>

        <button className="cp-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save & Continue"}
        </button>
      </div>
    </div>
  );
}

export default CompleteProfile;