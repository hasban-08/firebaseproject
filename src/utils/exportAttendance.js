import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatTime12, statusLabel } from "./attendanceHelpers";

// -----------------------------------------
// Attendance Row Formatter
// -----------------------------------------
function formatRow(r) {
  return {
    date: r.date || "—",
    time: r.checkInTime ? formatTime12(r.checkInTime) : "—",
    checkOut: r.checkOutTime ? formatTime12(r.checkOutTime) : "—",
    status: statusLabel(r),
  };
}

// -----------------------------------------
// Attendance → CSV
// -----------------------------------------
export function exportToCSV(records, filename) {
  const header = "Date,Check-in Time,Check-out Time,Status\n";

  const rows = records
    .map((r) => {
      const row = formatRow(r);
      return `"${row.date}","${row.time}","${row.checkOut}","${row.status}"`;
    })
    .join("\n");

  const blob = new Blob([header + rows], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${filename}.csv`;
  link.click();

  URL.revokeObjectURL(url);
}

// -----------------------------------------
// Attendance → Excel
// -----------------------------------------
export function exportToExcel(records, filename) {
  const data = records.map((r) => {
    const row = formatRow(r);

    return {
      Date: row.date,
      "Check-in Time": row.time,
      "Check-out Time": row.checkOut,
      Status: row.status,
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance");
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

// -----------------------------------------
// Daily Attendance → Excel
// -----------------------------------------
export function exportDailyToExcel(rows, filename) {
  const data = rows.map((r) => ({
    Employee: r.name || "—",
    Status: r.displayStatus || "—",
    "Check-in Time": r.time || "—",
    "Check-out Time": r.checkOut || "—",
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Daily Attendance");
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

// -----------------------------------------
// Monthly Payroll → Excel
// -----------------------------------------
export function exportPayrollToExcel(rows, filename) {
  const data = rows.map((r) => ({
    Name: r.name || "—",
    Department: r.department || "General",
    "Basic Salary": r.basicSalary ?? 0,
    "Allowances (50%)": r.allowances ?? 0,
    "Gross Salary (1.5x)": r.grossSalary ?? 0,
    "Attendance Deduction": r.attendanceDeduction ?? 0,
    "Income Tax": r.taxDeduction ?? 0,
    "Net Salary": r.netSalary ?? 0,
    Status: r.status || "draft",
    "Payment Method": r.method || "—",
    "Bank/Wallet": r.providerName || "—",
    "Account Title": r.accountTitle || "—",
    "Account Number": r.accountNumber || "—",
    IBAN: r.iban || "—",
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Payroll");
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

// -----------------------------------------
// Employee Payslip → PDF (Brief P1 Requirement)
// -----------------------------------------
export function exportPayslipToPDF(payslip, companyName = "WorkPulse Technologies") {
  const pdfDoc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // Header Banner
  pdfDoc.setFillColor(30, 27, 75);
  pdfDoc.rect(0, 0, 210, 38, "F");

  pdfDoc.setTextColor(255, 255, 255);
  pdfDoc.setFont("helvetica", "bold");
  pdfDoc.setFontSize(18);
  pdfDoc.text(companyName, 14, 16);

  pdfDoc.setFontSize(11);
  pdfDoc.setFont("helvetica", "normal");
  pdfDoc.text(`Official Monthly Salary Slip — ${payslip.month || ""}`, 14, 24);
  pdfDoc.text(
    `Status: ${String(payslip.status || "FINALIZED").toUpperCase()}`,
    14,
    31
  );

  // Employee Details Box
  pdfDoc.setTextColor(30, 41, 59);
  pdfDoc.setFontSize(10);
  pdfDoc.setFont("helvetica", "bold");
  pdfDoc.text("Employee Information", 14, 48);

  autoTable(pdfDoc, {
    startY: 51,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [109, 58, 255], textColor: 255 },
    body: [
      [
        "Employee Name",
        payslip.employeeName || payslip.name || "Employee",
        "Department",
        payslip.department || "General",
      ],
      [
        "Designation",
        payslip.designation || "Staff",
        "Pay Period",
        payslip.month || "—",
      ],
      [
        "Working Days",
        String(payslip.workingDaysInMonth ?? 22),
        "Present / Leave / Absent",
        `${payslip.presentCount ?? 0} / ${payslip.approvedLeaveCount ?? 0} / ${payslip.absentCount ?? 0}`,
      ],
      [
        "Late / Half-Days",
        `${payslip.lateCount ?? 0} / ${payslip.halfDayCount ?? 0}`,
        "Bank / Account",
        `${payslip.providerName || "Bank"} - ${payslip.accountNumber || "—"}`,
      ],
    ],
  });

  const nextY = (pdfDoc.lastAutoTable?.finalY || 90) + 8;

  const basic = Number(payslip.basicSalary) || 0;
  const hra = Math.round(basic * 0.3);
  const medical = Math.round(basic * 0.1);
  const conveyance = Math.round(basic * 0.1);
  const gross = Number(payslip.grossSalary) || Math.round(basic * 1.5);
  const attDed = Number(payslip.attendanceDeduction) || 0;
  const taxDed = Number(payslip.taxDeduction) || 0;
  const totalDed = attDed + taxDed;
  const netPay = Number(payslip.netSalary) || Math.max(0, gross - totalDed);

  pdfDoc.setFont("helvetica", "bold");
  pdfDoc.text("Earnings & Deductions Breakdown", 14, nextY);

  autoTable(pdfDoc, {
    startY: nextY + 3,
    head: [["Earnings", "Amount (PKR)", "Deductions", "Amount (PKR)"]],
    body: [
      [
        "Basic Salary",
        `Rs. ${basic.toLocaleString()}`,
        `Attendance / Unpaid / Late Deduction (${payslip.deductibleOffs ?? 0}d)`,
        `Rs. ${attDed.toLocaleString()}`,
      ],
      [
        "House Rent Allowance (30%)",
        `Rs. ${hra.toLocaleString()}`,
        "Income Tax (Progressive Slab)",
        `Rs. ${taxDed.toLocaleString()}`,
      ],
      [
        "Medical Allowance (10%)",
        `Rs. ${medical.toLocaleString()}`,
        "",
        "",
      ],
      [
        "Conveyance Allowance (10%)",
        `Rs. ${conveyance.toLocaleString()}`,
        "",
        "",
      ],
      [
        "Gross Salary (1.5x Basic)",
        `Rs. ${gross.toLocaleString()}`,
        "Total Deductions",
        `Rs. ${totalDed.toLocaleString()}`,
      ],
    ],
    styles: { fontSize: 9.5, cellPadding: 3 },
    headStyles: { fillColor: [109, 58, 255], textColor: 255 },
  });

  const summaryY = (pdfDoc.lastAutoTable?.finalY || 160) + 10;
  pdfDoc.setFillColor(241, 245, 249);
  pdfDoc.rect(14, summaryY, 182, 18, "F");

  pdfDoc.setFont("helvetica", "bold");
  pdfDoc.setFontSize(13);
  pdfDoc.setTextColor(15, 23, 42);
  pdfDoc.text(
    `NET PAYABLE SALARY: Rs. ${netPay.toLocaleString()}`,
    20,
    summaryY + 11
  );

  pdfDoc.setFont("helvetica", "italic");
  pdfDoc.setFontSize(8.5);
  pdfDoc.setTextColor(100, 116, 139);
  pdfDoc.text(
    `System-generated payslip on ${new Date().toLocaleString()}. Does not require a physical signature.`,
    14,
    summaryY + 28
  );

  const safeName = String(payslip.employeeName || payslip.name || "employee")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  pdfDoc.save(`payslip-${safeName}-${payslip.month || "month"}.pdf`);
}

// -----------------------------------------
// Print HTML Element
// -----------------------------------------
export function printElement(elementId) {
  const source = document.getElementById(elementId);
  if (!source) return;

  const clone = source.cloneNode(true);
  clone.querySelectorAll("[data-no-print]").forEach((el) => el.remove());

  const printWindow = window.open("", "_blank");
  printWindow.document.write(`
    <html><head><title>Attendance</title>
    <style>
      body { font-family: sans-serif; padding: 20px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #333; padding: 8px; text-align: left; }
      th { background: #f1f5f9; }
    </style></head>
    <body>${clone.innerHTML}</body></html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  printWindow.close();
}

function buildDirectoryRows(employees) {
  return employees.map((emp) => ({
    Name: emp.name || "—",
    Email: emp.email || "—",
    Role: emp.role || "—",
    Department: emp.department || "General",
    Designation: emp.designation || "—",
    Phone: emp.personalInfo?.phone || "—",
    CNIC: emp.personalInfo?.cnic || "—",
    DOB: emp.personalInfo?.dob || "—",
    Address: emp.personalInfo?.address || "—",
    "Payment Method": emp.bankDetails?.method || "—",
    "Bank/Wallet": emp.bankDetails?.providerName || "—",
    "Account Title": emp.bankDetails?.accountTitle || "—",
    "Account Number": emp.bankDetails?.accountNumber || "—",
    IBAN: emp.bankDetails?.iban || "—",
  }));
}

export function exportDirectoryToCSV(employees, filename) {
  const rows = buildDirectoryRows(employees);
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);

  const csvRows = [
    headers.map((header) => `"${header}"`).join(","),
    ...rows.map((row) =>
      headers
        .map((header) => `"${String(row[header]).replace(/"/g, '""')}"`)
        .join(",")
    ),
  ];

  const blob = new Blob([csvRows.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportDirectoryToExcel(employees, filename) {
  const rows = buildDirectoryRows(employees);
  if (rows.length === 0) return;

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export function exportDirectoryToPDF(employees, filename) {
  const rows = buildDirectoryRows(employees);
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);

  const pdfDoc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  pdfDoc.setFontSize(16);
  pdfDoc.setFont("helvetica", "bold");
  pdfDoc.text("Employee Directory", 14, 14);

  pdfDoc.setFontSize(9);
  pdfDoc.setFont("helvetica", "normal");
  pdfDoc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 20);

  autoTable(pdfDoc, {
    startY: 25,
    head: [headers],
    body: rows.map((row) => headers.map((header) => row[header])),
    styles: {
      fontSize: 6.5,
      cellPadding: 2,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [109, 58, 255],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 7,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: {
      top: 25,
      right: 8,
      bottom: 10,
      left: 8,
    },
  });

  pdfDoc.save(`${filename}.pdf`);
}

export function exportDailyToCSV(rows, filename) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = "Employee,Status,Check-in Time,Check-out Time\n";
  const body = rows
    .map((r) =>
      [
        esc(r.name),
        esc(r.displayStatus),
        esc(r.time || "-"),
        esc(r.checkOut || "-"),
      ].join(",")
    )
    .join("\n");

  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportDailyToPDF(rows, filename, dateLabel) {
  const pdfDoc = new jsPDF();
  pdfDoc.setFontSize(14);
  pdfDoc.text(`Daily Attendance - ${dateLabel}`, 14, 14);

  autoTable(pdfDoc, {
    startY: 20,
    head: [["Employee", "Status", "Check-in Time", "Check-out Time"]],
    body: rows.map((r) => [
      r.name,
      r.displayStatus,
      r.time || "-",
      r.checkOut || "-",
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [109, 58, 255] },
  });

  pdfDoc.save(`${filename}.pdf`);
}

function monthTable(rows) {
  return rows.map((r) => [
    r.date,
    r.day,
    r.label,
    r.time || "-",
    r.checkOut || "-",
    r.note || "-",
  ]);
}

export function exportMonthToCSV(rows, filename) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = "Date,Day,Status,Check-in,Check-out,Notes\n";
  const body = monthTable(rows)
    .map((r) => r.map(esc).join(","))
    .join("\n");

  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportMonthToExcel(rows, filename) {
  const data = rows.map((r) => ({
    Date: r.date,
    Day: r.day,
    Status: r.label,
    "Check-in": r.time || "-",
    "Check-out": r.checkOut || "-",
    Notes: r.note || "-",
  }));
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance");
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export function exportMonthToPDF(rows, filename, title) {
  const pdfDoc = new jsPDF();
  pdfDoc.setFontSize(14);
  pdfDoc.text(title, 14, 14);

  autoTable(pdfDoc, {
    startY: 20,
    head: [["Date", "Day", "Status", "Check-in", "Check-out", "Notes"]],
    body: monthTable(rows),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [109, 58, 255] },
  });

  pdfDoc.save(`${filename}.pdf`);
}
