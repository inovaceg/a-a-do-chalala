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

export type CloseoutReceiptData = {
  paperWidth: 58 | 80;
  terminal: string;
  shift: string;
  operator: string;
  openedAt: string;
  closedAt: string;
  openingAmount: number;
  cashReceived: number;
  pixReceived: number;
  debitReceived: number;
  creditReceived: number;
  mealVoucherReceived: number;
  supplies: number;
  withdrawals: number;
  refunds: number;
  expectedCash: number;
  countedCash: number;
  cashDifference: number;
  electronicExpected: Record<string, number>;
  electronicCounted: Record<string, number>;
  closingNote?: string | null;
};

type ReceiptBlock =
  | { kind: "section"; text: string }
  | { kind: "text"; text: string; size?: number; bold?: boolean; center?: boolean }
  | { kind: "pair"; label: string; value: string; prominent?: boolean }
  | { kind: "rule" };

const receiptMoney = (value: number) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function printCashCloseoutReceipt(data: CloseoutReceiptData, filename: string) {
  const electronicMethods = ["Pix", "Cartão de débito", "Cartão de crédito", "Vale alimentação"];
  const electronicDifferences = electronicMethods.map(method => Number(data.electronicCounted[method] ?? 0) - Number(data.electronicExpected[method] ?? 0));
  const hasElectronicDifference = electronicDifferences.some(difference => Math.abs(difference) > 0.01);
  const hasElectronicActivity = electronicMethods.some(method => Number(data.electronicExpected[method] ?? 0) !== 0 || Number(data.electronicCounted[method] ?? 0) !== 0);
  const hasDifference = Math.abs(data.cashDifference) > 0.01 || hasElectronicDifference;
  const overallDifference = data.cashDifference + electronicDifferences.reduce((total, difference) => total + difference, 0);
  const status = !hasDifference
    ? "FECHADO SEM DIFERENÇA"
    : overallDifference > 0.01 || (Math.abs(overallDifference) <= 0.01 && electronicDifferences.some(difference => difference > 0.01))
      ? "FECHADO COM SOBRA"
      : "FECHADO COM FALTA";
  const totalReceived = data.cashReceived + data.pixReceived + data.debitReceived + data.creditReceived + data.mealVoucherReceived;
  const blocks: ReceiptBlock[] = [
    { kind: "text", text: "Açaí do Chalalá", size: 11, bold: true, center: true },
    { kind: "text", text: "COMPROVANTE NÃO FISCAL", size: 8, bold: true, center: true },
    { kind: "text", text: "FECHAMENTO DE CAIXA", size: 10, bold: true, center: true },
    { kind: "text", text: status, size: 8, bold: true, center: true },
    { kind: "rule" },
    { kind: "section", text: "DADOS DO CAIXA" },
    { kind: "pair", label: "Terminal", value: data.terminal },
    { kind: "pair", label: "Turno", value: data.shift },
    { kind: "pair", label: "Operador", value: data.operator },
    { kind: "pair", label: "Abertura", value: data.openedAt },
    { kind: "pair", label: "Fechamento", value: data.closedAt },
    { kind: "rule" },
    { kind: "section", text: "RECEBIMENTOS DO TURNO" },
    { kind: "pair", label: "Dinheiro recebido", value: receiptMoney(data.cashReceived) },
    { kind: "pair", label: "Pix", value: receiptMoney(data.pixReceived) },
    { kind: "pair", label: "Cartão de débito", value: receiptMoney(data.debitReceived) },
    { kind: "pair", label: "Cartão de crédito", value: receiptMoney(data.creditReceived) },
    { kind: "pair", label: "Vale-alimentação", value: receiptMoney(data.mealVoucherReceived) },
    { kind: "pair", label: "TOTAL RECEBIDO", value: receiptMoney(totalReceived), prominent: true },
    { kind: "rule" },
    { kind: "section", text: "MOVIMENTAÇÃO EM DINHEIRO" },
    { kind: "pair", label: "Saldo inicial", value: receiptMoney(data.openingAmount) },
    { kind: "pair", label: "Suprimentos", value: `+ ${receiptMoney(data.supplies)}` },
    { kind: "pair", label: "Sangrias", value: `− ${receiptMoney(data.withdrawals)}` },
    { kind: "pair", label: "Estornos", value: `− ${receiptMoney(data.refunds)}` },
    { kind: "rule" },
    { kind: "section", text: "CONFERÊNCIA FINAL" },
    { kind: "pair", label: "Dinheiro esperado", value: receiptMoney(data.expectedCash), prominent: true },
    { kind: "pair", label: "Dinheiro contado", value: receiptMoney(data.countedCash), prominent: true },
    { kind: "pair", label: "DIFERENÇA DE CAIXA", value: receiptMoney(data.cashDifference), prominent: true },
  ];

  if (hasElectronicActivity || hasElectronicDifference) {
    blocks.push({ kind: "rule" }, { kind: "section", text: "CONFERÊNCIA DE PAGAMENTOS ELETRÔNICOS" });
    electronicMethods.forEach(method => {
      const expected = Number(data.electronicExpected[method] ?? 0);
      const counted = Number(data.electronicCounted[method] ?? 0);
      blocks.push(
        { kind: "pair", label: method, value: "" },
        { kind: "pair", label: "  Esperado", value: receiptMoney(expected) },
        { kind: "pair", label: "  Conferido", value: receiptMoney(counted) },
        { kind: "pair", label: "  Diferença", value: receiptMoney(counted - expected) },
      );
    });
  }
  if (data.closingNote) {
    blocks.push({ kind: "rule" }, { kind: "section", text: "OBSERVAÇÃO DO FECHAMENTO" }, { kind: "text", text: data.closingNote });
  }

  const width = data.paperWidth;
  const margin = width === 58 ? 4 : 5;
  const contentWidth = width - margin * 2;
  const bodySize = width === 58 ? 7.2 : 8;
  const bodyLeading = bodySize * 0.42;
  const gap = width === 58 ? 1.4 : 1.8;
  const doc = new jsPDF({ unit: "mm", format: [width, 1000], compress: true });
  let y = margin + 1;

  const setText = (size: number, bold: boolean, font: "helvetica" | "courier" = "helvetica") => {
    doc.setFont(font, bold ? "bold" : "normal");
    doc.setFontSize(size);
  };
  const drawWrapped = (text: string, x: number, startY: number, maxWidth: number, size: number, bold: boolean, align: "left" | "right" | "center" = "left", font: "helvetica" | "courier" = "helvetica") => {
    setText(size, bold, font);
    const lines = doc.splitTextToSize(text, Math.max(maxWidth, 4)) as string[];
    const lineHeight = size * 0.42;
    lines.forEach((line, index) => {
      const textWidth = doc.getTextWidth(line);
      const lineX = align === "center" ? (width - textWidth) / 2 : align === "right" ? x + maxWidth - textWidth : x;
      doc.text(line, lineX, startY + index * lineHeight);
    });
    return lines.length * lineHeight;
  };

  blocks.forEach(block => {
    if (block.kind === "rule") {
      y += gap;
      doc.setDrawColor(155);
      doc.setLineWidth(0.15);
      doc.line(margin, y, width - margin, y);
      y += gap + 0.6;
      return;
    }
    if (block.kind === "section") {
      y += gap;
      y += drawWrapped(block.text, margin, y, contentWidth, bodySize + 0.2, true);
      y += 0.6;
      return;
    }
    if (block.kind === "text") {
      const size = block.size ?? bodySize;
      y += drawWrapped(block.text, margin, y, contentWidth, size, block.bold ?? false, block.center ? "center" : "left");
      y += block.center ? 0.8 : 0.35;
      return;
    }

    const size = block.prominent ? bodySize + 0.7 : bodySize;
    const bold = block.prominent;
    const value = block.value;
    if (!value) {
      y += drawWrapped(block.label, margin, y, contentWidth, size, bold);
      y += 0.25;
      return;
    }
    setText(size, bold, "courier");
    const valueWidth = value ? doc.getTextWidth(value) : 0;
    const valueLines = value ? doc.splitTextToSize(value, contentWidth) as string[] : [];
    const labelWidth = Math.max(14, contentWidth - Math.min(valueWidth, contentWidth * 0.6) - gap);
    const labelHeight = drawWrapped(block.label, margin, y, labelWidth, size, bold);
    const valueHeight = valueLines.length > 1 || valueWidth > contentWidth * 0.6
      ? 0
      : drawWrapped(value, margin + labelWidth + gap, y, contentWidth - labelWidth - gap, size, bold, "right", "courier");

    if (valueLines.length > 1 || valueWidth > contentWidth * 0.6) {
      y += Math.max(labelHeight, bodyLeading) + 0.2;
      y += drawWrapped(value, margin, y, contentWidth, size, bold, "right", "courier");
    } else {
      y += Math.max(labelHeight, valueHeight, bodyLeading);
    }
    y += block.prominent ? 0.8 : 0.25;
  });

  const height = Math.max(55, y + margin + 2);
  doc.internal.pageSize.setHeight(height);
  doc.save(filename);
  return { status, totalReceived, hasElectronicDifference };
}
