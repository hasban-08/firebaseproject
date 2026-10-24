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
} from "./utils/attendanceHelpers";

describe("WorkPulse HR, Leave & Payroll Core Engine Tests", () => {
  const defaultSchedule = buildDefaultSchedule();

  test("1. Attendance status: present on or before 09:15, late after 09:15", () => {
    const onTime = new Date("2026-10-26T09:12:00"); // Monday 09:12
    const res1 = calculateAttendanceStatus(defaultSchedule, onTime);
    expect(res1.status).toBe("present");
    expect(res1.lateMinutes).toBe(0);

    const lateTime = new Date("2026-10-26T09:25:00"); // Monday 09:25 (10m past 09:15 grace)
    const res2 = calculateAttendanceStatus(defaultSchedule, lateTime);
    expect(res2.status).toBe("late");
    expect(res2.lateMinutes).toBe(10);
  });

  test("2. Checkout evaluation: worked < 5 hours marks half_day", () => {
    const checkIn = new Date("2026-10-26T09:00:00");
    const earlyOut = new Date("2026-10-26T13:00:00"); // 4 hours
    const resHalf = evaluateCheckoutStatus({
      checkInTime: checkIn,
      checkOutTime: earlyOut,
      initialStatus: "present",
      halfDayThresholdHours: 5,
    });
    expect(resHalf.workedHours).toBe(4);
    expect(resHalf.status).toBe("half_day");

    const fullOut = new Date("2026-10-26T17:30:00"); // 8.5 hours
    const resFull = evaluateCheckoutStatus({
      checkInTime: checkIn,
      checkOutTime: fullOut,
      initialStatus: "present",
      halfDayThresholdHours: 5,
    });
    expect(resFull.workedHours).toBe(8.5);
    expect(resFull.status).toBe("present");
  });

  test("3. Working days calculation skips weekends and public holidays", () => {
    // 2026-10-23 (Fri) to 2026-10-27 (Tue) -> Fri, Sat(skip), Sun(skip), Mon, Tue = 3 working days
    // With 2026-10-26 (Mon) as a Public Holiday -> 2 working days
    const res = calculateWorkingDaysBetween(
      "2026-10-23",
      "2026-10-27",
      ["sat", "sun"],
      [{ date: "2026-10-26", name: "Public Holiday" }]
    );
    expect(res.count).toBe(2);
    expect(res.dates).toEqual(["2026-10-23", "2026-10-27"]);
  });

  test("4. Leave overlap detection identifies overlapping pending/approved leaves", () => {
    const existing = [
      {
        id: "L1",
        status: "approved",
        type: "leave",
        startDate: "2026-10-10",
        endDate: "2026-10-14",
      },
    ];
    expect(hasLeaveOverlap("2026-10-12", "2026-10-16", existing)).toBeTruthy();
    expect(hasLeaveOverlap("2026-10-15", "2026-10-18", existing)).toBeNull();
  });

  test("5. Leave quota balances enforce Annual=14, Sick=8, Casual=10, Unpaid=Unlimited", () => {
    const leaves = [
      {
        status: "approved",
        type: "leave",
        leaveType: "annual",
        startDate: "2026-05-04",
        endDate: "2026-05-07",
        workingDays: 4,
      },
      {
        status: "approved",
        type: "leave",
        leaveType: "sick",
        startDate: "2026-06-01",
        endDate: "2026-06-02",
        workingDays: 2,
      },
    ];
    const balances = computeLeaveBalances(leaves, 2026);
    expect(balances.annual.quota).toBe(14);
    expect(balances.annual.used).toBe(4);
    expect(balances.annual.remaining).toBe(10);
    expect(balances.sick.remaining).toBe(6);
    expect(balances.casual.remaining).toBe(10);
    expect(balances.unpaid.quota).toBeNull();
  });

  test("6. Payroll formula: Gross = 1.5x Basic, Tax Slabs, and 3 Lates = 0.5 Day penalty", () => {
    // Basic = 100,000 -> Gross = 150,000 (Annual = 1,800,000)
    // Annual tax for 1,800,000 = 30,000 + (600,000 * 0.15) = 120,000 -> Monthly Tax = 10,000
    expect(calculateMonthlyTax(150000)).toBe(10000);
    expect(calculateMonthlyTax(45000)).toBe(0); // <= 600k/yr tax exempt

    const stats = calculateSalaryStats({
      records: [
        { date: "2026-09-01", status: "late" },
        { date: "2026-09-02", status: "late" },
        { date: "2026-09-03", status: "late" }, // 3 lates = 0.5 day penalty
        { date: "2026-09-04", status: "half_day" }, // 1 half_day = 0.5 day penalty
      ],
      schedule: defaultSchedule,
      baseSalary: 100000,
      month: "2026-09",
      approvedLeaves: [],
    });

    expect(stats.basicSalary).toBe(100000);
    expect(stats.grossSalary).toBe(150000);
    expect(stats.latePenaltyDays).toBe(0.5);
    expect(stats.halfDayPenaltyDays).toBe(0.5);
    expect(stats.taxDeduction).toBe(10000);
  });

  test("7. Haversine GPS distance calculation", () => {
    const d = calculateHaversineDistanceMeters(24.8607, 67.0011, 24.8607, 67.0011);
    expect(d).toBe(0);
  });
});
