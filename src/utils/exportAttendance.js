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
    time: r.checkInTime
      ? formatTime12(r.checkInTime.toDate())
      : "—",
    status: statusLabel(r),
  };
}

// -----------------------------------------
// Attendance → CSV
// -----------------------------------------
export function exportToCSV(records, filename) {
  const header = "Date,Check-in Time,Status\n";

  const rows = records
    .map((r) => {
      const row = formatRow(r);

      return `"${row.date}","${row.time}","${row.status}"`;
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
      Status: row.status,
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    "Attendance"
  );

  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

// -----------------------------------------
// Daily Attendance → Excel
// For "All Employees, Single Day"
// -----------------------------------------
export function exportDailyToExcel(rows, filename) {
  const data = rows.map((r) => ({
    Employee: r.name || "—",
    Status: r.displayStatus || "—",
    "Check-in Time": r.time || "—",
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    "Daily Attendance"
  );

  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

// -----------------------------------------
// Monthly Payroll → Excel
// -----------------------------------------
export function exportPayrollToExcel(rows, filename) {
  const data = rows.map((r) => ({
    Name: r.name || "—",
    "Net Salary": r.netSalary ?? 0,
    "Payment Method": r.method || "—",
    "Bank/Wallet": r.providerName || "—",
    "Account Title": r.accountTitle || "—",
    "Account Number": r.accountNumber || "—",
    IBAN: r.iban || "—",
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    "Payroll"
  );

  XLSX.writeFile(workbook, `${filename}.xlsx`);
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

// -----------------------------------------
// Employee Directory Rows
// -----------------------------------------
function buildDirectoryRows(employees) {
  return employees.map((emp) => ({
    Name: emp.name || "—",
    Email: emp.email || "—",
    Role: emp.role || "—",

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

// -----------------------------------------
// Employee Directory → CSV
// -----------------------------------------
export function exportDirectoryToCSV(employees, filename) {
  const rows = buildDirectoryRows(employees);

  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);

  const csvRows = [
    headers.map((header) => `"${header}"`).join(","),

    ...rows.map((row) =>
      headers
        .map((header) =>
          `"${String(row[header]).replace(/"/g, '""')}"`
        )
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

// -----------------------------------------
// Employee Directory → Excel
// -----------------------------------------
export function exportDirectoryToExcel(employees, filename) {
  const rows = buildDirectoryRows(employees);

  if (rows.length === 0) return;

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    "Employees"
  );

  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

// -----------------------------------------
// Employee Directory → PDF
// -----------------------------------------
export function exportDirectoryToPDF(employees, filename) {
  const rows = buildDirectoryRows(employees);

  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);

  const pdfDoc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  // PDF Title
  pdfDoc.setFontSize(16);
  pdfDoc.setFont("helvetica", "bold");
  pdfDoc.text("Employee Directory", 14, 14);

  // PDF Date
  pdfDoc.setFontSize(9);
  pdfDoc.setFont("helvetica", "normal");

  pdfDoc.text(
    `Generated: ${new Date().toLocaleDateString()}`,
    14,
    20
  );

  autoTable(pdfDoc, {
    startY: 25,

    head: [headers],

    body: rows.map((row) =>
      headers.map((header) => row[header])
    ),

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
  const header = "Employee,Status,Check-in Time\n";
  const body = rows
    .map((r) => [esc(r.name), esc(r.displayStatus), esc(r.time || "-")].join(","))
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
    head: [["Employee", "Status", "Check-in Time"]],
    body: rows.map((r) => [r.name, r.displayStatus, r.time || "-"]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [109, 58, 255] },
  });

  pdfDoc.save(`${filename}.pdf`);
}

function monthTable(rows) {
  return rows.map((r) => [r.date, r.day, r.label, r.time || "-", r.note || "-"]);
}

export function exportMonthToCSV(rows, filename) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = "Date,Day,Status,Check-in,Notes\n";
  const body = monthTable(rows).map((r) => r.map(esc).join(",")).join("\n");

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
    head: [["Date", "Day", "Status", "Check-in", "Notes"]],
    body: monthTable(rows),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [109, 58, 255] },
  });

  pdfDoc.save(`${filename}.pdf`);
}