import { jsPDF } from "jspdf";

export function printCashReceipt(title: string, rows: string[], filename: string) {
  const doc = new jsPDF({ unit: "mm", format: [80, 120] });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const titleLines = doc.splitTextToSize(title, 72) as string[];
  const contentLines = rows.flatMap(row => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    return doc.splitTextToSize(row, 72) as string[];
  });
  const height = 18 + titleLines.length * 5 + contentLines.length * 4.5;
  doc.internal.pageSize.setHeight(Math.max(height, 70));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(titleLines, 40, 9, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(contentLines, 4, 15 + titleLines.length * 5, { lineHeightFactor: 1.35 });
  doc.save(filename);
}
