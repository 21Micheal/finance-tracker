// src/utils/reportGenerator.js
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

// ✅ Generate PDF report
export const generatePDFReport = (transactions) => {
  const doc = new jsPDF();

  doc.text("Transaction Report", 14, 15);
  autoTable(doc, {
    startY: 25,
    head: [["Date", "Category", "Amount", "Type", "Description"]],
    body: transactions.map((t) => [
      t.date,
      t.category,
      t.amount,
      t.type,
      t.description || "",
    ]),
  });

  doc.save("transaction_report.pdf");
};

// ✅ Generate Excel (XLSX) report
export const generateExcelReport = (transactions) => {
  const worksheet = XLSX.utils.json_to_sheet(transactions);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");
  XLSX.writeFile(workbook, "transaction_report.xlsx");
};

// ✅ Generate CSV report
export const generateCSVReport = (transactions) => {
  const worksheet = XLSX.utils.json_to_sheet(transactions);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", "transaction_report.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
