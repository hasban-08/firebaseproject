import {
  getWeekdayKey,
  getLocalDateStr,
  getLocalMonthStr,
  formatTime12,
  statusLabel,
  getApprovedLeaveDates,
  buildDefaultSchedule,
} from "./attendanceHelpers";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "15:30" -> "3:30 PM"
export function formatHM12(hm = "") {
  const [h, m] = String(hm).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hm || "-";
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

const emptySummary = () => ({
  present: 0,
  onTime: 0,
  late: 0,
  halfDay: 0,
  missingCheckout: 0,
  extremeLate: 0,
  absent: 0,
  leave: 0,
  early: 0,
});

/**
 * Mahine ke har din ka status (aaj tak):
 * record hai -> present / late / half_day / missing_checkout
 * approved leave -> leave
 * chhutti ka din / public holiday -> off
 * aaj aur abhi tak check-in nahi -> pending
 * baaqi -> absent
 */
export function buildMonthRows({
  month,
  schedule,
  records = [],
  leaves = [],
  publicHolidays = [],
}) {
  const currentMonth = getLocalMonthStr();
  const monthStr = /^\d{4}-\d{2}$/.test(month) ? month : currentMonth;
  const summary = emptySummary();

  if (monthStr > currentMonth) return { rows: [], summary };

  const effectiveSchedule = schedule || buildDefaultSchedule();
  const holidayMap = {};
  (publicHolidays || []).forEach((h) => {
    if (h?.date) holidayMap[h.date] = h.name || "Public Holiday";
  });

  const [year, mon] = monthStr.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const todayStr = getLocalDateStr();
  const lastDay = monthStr === currentMonth ? new Date().getDate() : daysInMonth;

  const recordByDate = {};
  records.forEach((r) => {
    if (r.date && !recordByDate[r.date]) recordByDate[r.date] = r;
  });

  const leaveDates = getApprovedLeaveDates(
    effectiveSchedule,
    leaves,
    publicHolidays
  );

  const earlyByDate = {};
  leaves.forEach((l) => {
    if (l.status === "approved" && l.type === "earlyLeave" && l.date) {
      earlyByDate[l.date] = l;
    }
  });

  const rows = [];

  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, mon - 1, day);
    const dateStr = `${monthStr}-${String(day).padStart(2, "0")}`;
    const record = recordByDate[dateStr];
    const isHoliday = !!holidayMap[dateStr];
    const isScheduled =
      !!effectiveSchedule?.[getWeekdayKey(date)] && !isHoliday;
    const early = earlyByDate[dateStr];

    let kind;
    let label;
    let time = null;
    let checkOut = null;
    let workedHours = null;

    if (record) {
      const hasCheckout = !!record.checkOutTime;
      const isPastDay = dateStr < todayStr;
      let effectiveStatus = record.status || "present";
      if (!hasCheckout && isPastDay && effectiveStatus !== "half_day") {
        effectiveStatus = "missing_checkout";
      }

      kind = effectiveStatus;
      label = statusLabel({ ...record, status: effectiveStatus });
      time = formatTime12(record.checkInTime);
      checkOut = hasCheckout ? formatTime12(record.checkOutTime) : "-";
      workedHours = record.workedHours ?? null;

      summary.present += 1;
      if (effectiveStatus === "late" || effectiveStatus === "extreme-late") {
        summary.late += 1;
      } else if (effectiveStatus === "half_day") {
        summary.halfDay += 1;
      } else if (effectiveStatus === "missing_checkout") {
        summary.missingCheckout += 1;
      } else {
        summary.onTime += 1;
      }
    } else if (leaveDates.has(dateStr)) {
      kind = "leave";
      label = "On leave";
      summary.leave += 1;
    } else if (isHoliday) {
      kind = "off";
      label = `Holiday (${holidayMap[dateStr]})`;
    } else if (!isScheduled) {
      kind = "off";
      label = "Weekend / Off";
    } else if (dateStr === todayStr) {
      kind = "pending";
      label = "Not checked in yet";
    } else {
      kind = "absent";
      label = "Absent";
      summary.absent += 1;
    }

    let note = "";
    if (early) {
      summary.early += 1;
      note = `Early leave approved (${formatHM12(early.earlyLeaveTime)})`;
    } else if (workedHours !== null) {
      note = `Worked: ${workedHours}h`;
    }

    rows.push({
      date: dateStr,
      day: DAY_NAMES[date.getDay()],
      kind,
      label,
      time,
      checkOut,
      workedHours,
      note,
    });
  }

  return { rows, summary };
}
