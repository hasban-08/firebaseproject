export const digitsOnly = (s = "") => String(s).replace(/\D/g, "");

// Typing ke dauran auto-format: XXXXX-XXXXXXX-X
export function formatCnic(value) {
  const d = digitsOnly(value).slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

export function isValidCnic(value) {
  const d = digitsOnly(value);
  return d.length === 13 && d[0] !== "0";
}

// 0300-1234567, 03001234567, +923001234567 sab accept, "03XX-XXXXXXX" return
export function normalizePkMobile(value) {
  let d = digitsOnly(value);
  if (d.startsWith("92") && d.length === 12) d = "0" + d.slice(2);
  if (!/^03\d{9}$/.test(d)) return null;
  return `${d.slice(0, 4)}-${d.slice(4)}`;
}

// Pakistan IBAN: PK + 2 check digits + 4 letter bank code + 16 alphanumeric (24 total)
export function isValidIban(value) {
  const iban = String(value).replace(/\s+/g, "").toUpperCase();
  if (!/^PK\d{2}[A-Z]{4}[A-Z0-9]{16}$/.test(iban)) return false;

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));

  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }
  return remainder === 1;
}

export function isValidDob(value, minAge = 16) {
  if (!value) return false;
  const dob = new Date(value + "T00:00:00");
  if (Number.isNaN(dob.getTime())) return false;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;

  return age >= minAge && age <= 90;
}