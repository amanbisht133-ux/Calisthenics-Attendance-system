import * as XLSX from "xlsx";

export function exportToExcel(
  filename: string,
  sheets: { sheetName: string; rows: Record<string, unknown>[] }[]
) {
  const workbook = XLSX.utils.book_new();

  for (const { sheetName, rows } of sheets) {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  }

  XLSX.writeFile(workbook, filename);
}
