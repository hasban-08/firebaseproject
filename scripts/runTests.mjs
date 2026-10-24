import assert from "node:assert/strict";
import {
  calculateAttendanceStatus,
  evaluateCheckoutStatus,
  calculateWorkingDaysBetween,
  hasLeaveOverlap,
  computeLeaveBalances,
  calculateMonthlyTax,
  calculateSalaryStats,
  calculateHaversineDistanceMeters,
  buildDefaultSchedule,
} from "../src/utils/attendanceHelpers.js";

const defaultSchedule = buildDefaultSchedule();

// Test 1: Attendance Status (Present <= 09:15, Late > 09:15)
{
  const onTime = new Date("2026-10-26T09:12:00");
  const res1 = calculateAttendanceStatus(defaultSchedule, onTime);
  assert.equal(res1.status, "present");
  assert.equal(res1.lateMinutes, 0);

  const lateTime = new Date("2026-10-26T09:25:00");
  const res2 = calculateAttendanceStatus(defaultSchedule, lateTime);
  assert.equal(res2.status, "late");
  assert.equal(res2.lateMinutes, 10);
  console.log("PASS 1: Attendance status (present <= 09:15, late > 09:15)");
}

// Test 2: Checkout Half-Day (< 5 hours)
{
  const checkIn = new Date("2026-10-26T09:00:00");
  const earlyOut = new Date("2026-10-26T13:00:00");
  const resHalf = evaluateCheckoutStatus({
    checkInTime: checkIn,
    checkOutTime: earlyOut,
    initialStatus: "present",
    halfDayThresholdHours: 5,
  });
  assert.equal(resHalf.workedHours, 4);
  assert.equal(resHalf.status, "half_day");
  console.log("PASS 2: Checkout evaluation (< 5h -> half_day)");
}

// Test 3: Working Days Calculation (Skips Weekends & Public Holidays)
{
  const res = calculateWorkingDaysBetween(
    "2026-10-23",
    "2026-10-27",
    ["sat", "sun"],
    [{ date: "2026-10-26", name: "Public Holiday" }]
  );
  assert.equal(res.count, 2);
  assert.deepEqual(res.dates, ["2026-10-23", "2026-10-27"]);
  console.log("PASS 3: Working days calculation skips weekends & public holidays");
}

// Test 4: Leave Overlap Detection (422 Rule)
{
  const existing = [
    {
      id: "L1",
      status: "approved",
      type: "leave",
      startDate: "2026-10-10",
      endDate: "2026-10-14",
    },
  ];
  assert.ok(hasLeaveOverlap("2026-10-12", "2026-10-16", existing));
  assert.equal(hasLeaveOverlap("2026-10-15", "2026-10-18", existing), null);
  console.log("PASS 4: Leave overlap detection");
}

// Test 5: Leave Quotas (Annual 14, Sick 8, Casual 10, Unpaid Unlimited)
{
  const leaves = [
    {
      status: "approved",
      type: "leave",
      leaveType: "annual",
      startDate: "2026-05-04",
      endDate: "2026-05-07",
      workingDays: 4,
    },
  ];
  const balances = computeLeaveBalances(leaves, 2026);
  assert.equal(balances.annual.quota, 14);
  assert.equal(balances.annual.remaining, 10);
  assert.equal(balances.sick.quota, 8);
  assert.equal(balances.casual.quota, 10);
  assert.equal(balances.unpaid.quota, null);
  console.log("PASS 5: Leave quotas & remaining balances");
}

// Test 6: Payroll Formula (Gross = 1.5x Basic, FBR Tax Slabs, 3 Lates = 0.5 Day)
{
  assert.equal(calculateMonthlyTax(150000), 10000);
  assert.equal(calculateMonthlyTax(45000), 0);

  const stats = calculateSalaryStats({
    records: [
      { date: "2026-09-01", status: "late" },
      { date: "2026-09-02", status: "late" },
      { date: "2026-09-03", status: "late" },
      { date: "2026-09-04", status: "half_day" },
    ],
    schedule: defaultSchedule,
    baseSalary: 100000,
    month: "2026-09",
    approvedLeaves: [],
  });
  assert.equal(stats.basicSalary, 100000);
  assert.equal(stats.grossSalary, 150000);
  assert.equal(stats.latePenaltyDays, 0.5);
  assert.equal(stats.halfDayPenaltyDays, 0.5);
  assert.equal(stats.taxDeduction, 10000);
  console.log("PASS 6: Payroll formula (Gross=1.5x Basic, Tax Slabs, 3 Lates=0.5d)");
}

// Test 7: Haversine GPS Distance
{
  const dist = calculateHaversineDistanceMeters(24.8607, 67.0011, 24.8607, 67.0011);
  assert.equal(dist, 0);
  console.log("PASS 7: Haversine GPS radius calculation");
}

console.log("\nALL 7 CORE HR & PAYROLL ENGINE TESTS PASSED!");
