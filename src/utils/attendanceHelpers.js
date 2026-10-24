export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const WEEKDAY_LABELS = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

export const GRACE_MINUTES = 20;
export const EXTREME_LATE_AFTER_GRACE_MINUTES = 30;
export const FREE_OFFS_PER_MONTH = 2;

// 🔥 Naye Rules 🔥
export const LATES_PER_OFF = 3;         // 3 Late = 1 Off
export const EARLY_LEAVES_PER_OFF = 2;  // 2 Early Leaves = 1 Off

const MAX_LEAVE_RANGE_DAYS = 366;

export function getWeekdayKey(date = new Date()) {
  return WEEKDAY_KEYS[date.getDay()];
}

export function getLocalDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

export function getLocalMonthStr(date = new Date()) {
  return getLocalDateStr(date).slice(0, 7);
}

export function formatTime12(date) {
  if (!date) return "—";

  const parsedDate =
    date instanceof Date ? date : date?.toDate?.() ?? new Date(date);

  if (Number.isNaN(parsedDate.getTime())) return "—";

  return parsedDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function calculateAttendanceStatus(
  schedule,
  checkInDate = new Date()
) {
  const weekdayKey = getWeekdayKey(checkInDate);
  const expectedTime = schedule?.[weekdayKey];

  if (!expectedTime || !/^\d{1,2}:\d{2}$/.test(expectedTime)) {
    return {
      status: "on-time",
      lateMinutes: 0,
      weekdayKey,
    };
  }

  const [expH, expM] = expectedTime.split(":").map(Number);

  const expectedDate = new Date(checkInDate);
  expectedDate.setHours(expH, expM, 0, 0);

  const graceDate = new Date(
    expectedDate.getTime() + GRACE_MINUTES * 60000
  );

  if (checkInDate <= graceDate) {
    return {
      status: "on-time",
      lateMinutes: 0,
      weekdayKey,
    };
  }

  const lateMinutes = Math.round(
    (checkInDate.getTime() - graceDate.getTime()) / 60000
  );

  const status =
    lateMinutes > EXTREME_LATE_AFTER_GRACE_MINUTES
      ? "extreme-late"
      : "late";

  return {
    status,
    lateMinutes,
    weekdayKey,
  };
}

export function statusLabel(record) {
  if (record?.status === "extreme-late") {
    return `Extreme Late (${record.lateMinutes ?? 0} min)`;
  }

  if (record?.status === "late") {
    return `Late (${record.lateMinutes ?? 0} min)`;
  }

  return "On time";
}

export function countWorkingDaysSoFar(schedule, referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const todayDate = referenceDate.getDate();

  let count = 0;

  for (let day = 1; day <= todayDate; day += 1) {
    const date = new Date(year, month, day);

    if (schedule?.[getWeekdayKey(date)]) {
      count += 1;
    }
  }

  return count;
}

export function countWorkingDaysInMonth(
  schedule,
  monthStr = getLocalMonthStr()
) {
  const [year, month] = monthStr.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  let count = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month - 1, day);

    if (schedule?.[getWeekdayKey(date)]) {
      count += 1;
    }
  }

  return count;
}

function isValidDateString(value) {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = parseLocalDate(value);
  return getLocalDateStr(date) === value;
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Returns scheduled work dates covered by approved full-day leave.
 */
export function getApprovedLeaveDates(schedule, approvedLeaves = []) {
  const leaveDates = new Set();

  for (const leave of approvedLeaves) {
    if (leave?.status !== "approved") continue;
    if (String(leave?.type || "").toLowerCase() !== "leave") continue;

    if (Array.isArray(leave.dates) && leave.dates.length > 0) {
      for (const dateString of leave.dates) {
        if (!isValidDateString(dateString)) continue;

        const date = parseLocalDate(dateString);

        if (schedule?.[getWeekdayKey(date)]) {
          leaveDates.add(dateString);
        }
      }

      continue;
    }

    if (!leave.startDate || !leave.endDate) continue;
    if (!isValidDateString(leave.startDate)) continue;
    if (!isValidDateString(leave.endDate)) continue;
    if (leave.endDate < leave.startDate) continue;

    const cursor = parseLocalDate(leave.startDate);
    const endDate = parseLocalDate(leave.endDate);

    let guard = 0;

    while (cursor <= endDate && guard < MAX_LEAVE_RANGE_DAYS) {
      if (schedule?.[getWeekdayKey(cursor)]) {
        leaveDates.add(getLocalDateStr(cursor));
      }

      cursor.setDate(cursor.getDate() + 1);
      guard += 1;
    }
  }

  return leaveDates;
}

// Early Leaves ki date nikalne ka function
export function getApprovedEarlyLeaveDates(schedule, approvedLeaves = []) {
  const earlyDates = new Set();

  for (const leave of approvedLeaves) {
    if (leave?.status !== "approved") continue;
    if (String(leave?.type || "").toLowerCase() !== "earlyleave") continue;
    
    if (leave.date && isValidDateString(leave.date)) {
        const d = parseLocalDate(leave.date);
        if (schedule?.[getWeekdayKey(d)]) {
            earlyDates.add(getLocalDateStr(d));
        }
    }
  }

  return earlyDates;
}

function getReferenceDateForMonth(monthStr) {
  const currentMonth = getLocalMonthStr();

  if (monthStr === currentMonth) return new Date();
  if (monthStr > currentMonth) return null;

  const [year, month] = monthStr.split("-").map(Number);
  return new Date(year, month, 0);
}

function getScheduledDatesUpTo(schedule, monthStr, referenceDate) {
  if (!referenceDate) return [];

  const [year, month] = monthStr.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const referenceStr = getLocalDateStr(referenceDate);

  const dates = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month - 1, day);
    const dateStr = getLocalDateStr(date);

    if (dateStr > referenceStr) break;

    if (schedule?.[getWeekdayKey(date)]) {
      dates.push(dateStr);
    }
  }

  return dates;
}

/**
 * Salary policy:
 * - 20-minute grace period
 * - 3 late arrivals = 1 off-equivalent (Naya Rule)
 * - 2 early leaves = 1 off-equivalent (Naya Rule)
 * - each extreme-late arrival = 1 off-equivalent
 * - each absence = 1 off-equivalent
 * - 2 free off-equivalents per month
 */
export function calculateSalaryStats({
  records = [],
  schedule,
  baseSalary = 0,
  month = getLocalMonthStr(),
  approvedLeaves = [],
}) {
  const monthStr =
    typeof month === "string" && /^\d{4}-\d{2}$/.test(month)
      ? month
      : getLocalMonthStr();

  const base = Number(baseSalary) || 0;

  const presentCount = records.length;

  const lateCount = records.filter(
    (record) => record.status === "late"
  ).length;

  const extremeLateCount = records.filter(
    (record) => record.status === "extreme-late"
  ).length;

  const scheduledDates = getScheduledDatesUpTo(
    schedule,
    monthStr,
    getReferenceDateForMonth(monthStr)
  );

  const presentDates = new Set(
    records.map((record) => record.date).filter(Boolean)
  );

  const approvedLeaveDates = getApprovedLeaveDates(schedule, approvedLeaves);
  const approvedEarlyLeaveDates = getApprovedEarlyLeaveDates(schedule, approvedLeaves);

  let absentCount = 0;
  let approvedLeaveCount = 0;
  let earlyLeaveCount = 0;

  for (const dateStr of scheduledDates) {
    if (presentDates.has(dateStr)) {
        // Agar aaj present hai, to check karein early leave li thi ya nahi
        if (approvedEarlyLeaveDates.has(dateStr)) {
             earlyLeaveCount += 1;
        }
        continue;
    }

    if (approvedLeaveDates.has(dateStr)) {
      approvedLeaveCount += 1;
      continue;
    }

    absentCount += 1;
  }

  const workingDaysSoFar = scheduledDates.length;

  // Lates se deduction (3 Lates = 1 Off)
  const offFromLates = Math.floor(lateCount / LATES_PER_OFF);
  
  // Early leaves se deduction (2 Early leaves = 1 Off)
  const offFromEarlyLeaves = Math.floor(earlyLeaveCount / EARLY_LEAVES_PER_OFF);

  // Total off equivalents calculation
  const offEquivalents = extremeLateCount + absentCount + offFromLates + offFromEarlyLeaves;

  const deductibleOffs = Math.max(offEquivalents - FREE_OFFS_PER_MONTH, 0);

  const workingDaysInMonth = countWorkingDaysInMonth(schedule, monthStr);

  const perDayRate = workingDaysInMonth > 0 ? base / workingDaysInMonth : 0;

  const deduction = deductibleOffs * perDayRate;
  const netSalary = Math.max(base - deduction, 0);

  return {
    presentCount,
    lateCount,
    extremeLateCount,
    absentCount,
    approvedLeaveCount,
    earlyLeaveCount, 
    offFromLates,
    offFromEarlyLeaves, 
    offEquivalents,
    deductibleOffs,
    perDayRate,
    deduction,
    netSalary,
    workingDaysInMonth,
    workingDaysSoFar,
  };
}

export const digitsOnly = (s = "") => String(s).replace(/\D/g, "");

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

export function normalizePkMobile(value) {
  let d = digitsOnly(value);
  if (d.startsWith("92") && d.length === 12) d = "0" + d.slice(2);
  if (!/^03\d{9}$/.test(d)) return null;
  return `${d.slice(0, 4)}-${d.slice(4)}`;
}

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