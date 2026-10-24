import {
  getWeekdayKey,
  getLocalDateStr,
  getLocalMonthStr,
  formatTime12,
  statusLabel,
  getApprovedLeaveDates,
} from "./attendanceHelpers";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "15:30" -> "3:30 PM"
export function formatHM12(hm = "") {
  const [h, m] = String(hm).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hm || "—";
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

const emptySummary = () => ({
  present: 0, onTime: 0, late: 0, extremeLate: 0, absent: 0, leave: 0, early: 0,
});

/**
 * Mahine ke har din ka status (aaj tak):
 * record hai -> on-time / late / extreme-late
 * approved leave -> leave
 * chhutti ka din -> off
 * aaj aur abhi tak check-in nahi -> pending
 * baaqi -> absent
 * Approved early leave kisi bhi din par "note" ban kar aati hai.
 */
export function buildMonthRows({ month, schedule, records = [], leaves = [] }) {
  const currentMonth = getLocalMonthStr();
  const monthStr = /^\d{4}-\d{2}$/.test(month) ? month : currentMonth;
  const summary = emptySummary();

  if (monthStr > currentMonth) return { rows: [], summary };

  const [year, mon] = monthStr.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const todayStr = getLocalDateStr();
  const lastDay = monthStr === currentMonth ? new Date().getDate() : daysInMonth;

  const recordByDate = {};
  records.forEach((r) => {
    if (r.date && !recordByDate[r.date]) recordByDate[r.date] = r;
  });

  const leaveDates = getApprovedLeaveDates(schedule, leaves);

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
    const isScheduled = !!schedule?.[getWeekdayKey(date)];
    const early = earlyByDate[dateStr];

    let kind;
    let label;
    let time = null;

    if (record) {
      kind = record.status || "on-time";
      label = statusLabel(record);
      time = formatTime12(record.checkInTime);
      summary.present += 1;
      if (kind === "late") summary.late += 1;
      else if (kind === "extreme-late") summary.extremeLate += 1;
      else summary.onTime += 1;
    } else if (leaveDates.has(dateStr)) {
      kind = "leave";
      label = "On leave";
      summary.leave += 1;
    } else if (!isScheduled) {
      kind = "off";
      label = "Day off";
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
    }

    rows.push({ date: dateStr, day: DAY_NAMES[date.getDay()], kind, label, time, note });
  }

  return { rows, summary };
}