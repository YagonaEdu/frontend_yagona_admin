import * as XLSX from "xlsx";

function rowsToSheet(rows, columns) {
  const header = columns.map((col) => col.title);
  const data = (rows || []).map((row) =>
    columns.map((col) => {
      if (typeof col.value === "function") {
        const raw = col.value(row);
        return raw == null ? "" : raw;
      }
      const raw = row[col.key];
      return raw == null ? "" : raw;
    }),
  );
  const sheet = XLSX.utils.aoa_to_sheet([header, ...data]);
  sheet["!cols"] = columns.map((col) => ({
    wch: Math.min(48, Math.max(12, String(col.title || "").length + 4)),
  }));
  return sheet;
}

/** Build and download an .xlsx file from array of plain objects. */
export function downloadExcel(filename, rows, columns) {
  const safeName = String(filename || "export").replace(/[\\/:*?"<>|]+/g, "_");
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, rowsToSheet(rows, columns), "Данные");
  XLSX.writeFile(book, safeName.endsWith(".xlsx") ? safeName : `${safeName}.xlsx`);
}

/**
 * Multi-sheet workbook.
 * sheets: [{ name, rows, columns }]
 */
export function downloadExcelBook(filename, sheets) {
  const safeName = String(filename || "export").replace(/[\\/:*?"<>|]+/g, "_");
  const book = XLSX.utils.book_new();
  (sheets || []).forEach((sheet, index) => {
    const name = String(sheet.name || `Лист${index + 1}`).slice(0, 31);
    XLSX.utils.book_append_sheet(book, rowsToSheet(sheet.rows, sheet.columns), name);
  });
  XLSX.writeFile(book, safeName.endsWith(".xlsx") ? safeName : `${safeName}.xlsx`);
}

export function excelStamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
}
