import { useState } from "react";
import { Eye, FileDown, X } from "lucide-react";
import "./financial-report.css";

type ReportRow = { date: string; description: string; category: string; customer: string; method: string; amount: number; status: string };
type ReportType = "income" | "expense" | "combined";
type Props = { period: string; incomes: ReportRow[]; expenses: ReportRow[] };
const money = (amount: number) => Number(amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const reportTitles: Record<ReportType, string> = { income: "Relatório de receitas", expense: "Relatório de despesas", combined: "Relatório unificado" };

export default function FinancialReportActions({ period, incomes, expenses }: Props) {
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportType>("combined");
  const incomeTotal = incomes.reduce((sum, row) => sum + row.amount, 0);
  const expenseTotal = expenses.reduce((sum, row) => sum + row.amount, 0);
  const printReport = () => window.print();
  const preview = () => setOpen(true);
  const generatePdf = () => { setOpen(true); window.setTimeout(printReport, 250); };
  return <>
    <div className="finance-report-actions"><select aria-label="Tipo de relatório" value={reportType} onChange={event => setReportType(event.target.value as ReportType)}><option value="income">Receitas</option><option value="expense">Despesas</option><option value="combined">Unificado</option></select><button type="button" className="finance-secondary" onClick={preview}><Eye size={15}/> Visualizar</button><button type="button" className="finance-primary" onClick={generatePdf}><FileDown size={15}/> Gerar PDF</button></div>
    {open && <div className="finance-report-backdrop"><section className="finance-report-dialog"><header className="finance-report-toolbar"><div><span className="finance-kicker">RELATÓRIO FINANCEIRO</span><h2>{reportTitles[reportType]}</h2><p>Período: {period}</p></div><div><button type="button" className="finance-primary" onClick={printReport}><FileDown size={15}/> Gerar PDF</button><button type="button" className="finance-modal-close" onClick={() => setOpen(false)} aria-label="Fechar visualização"><X size={18}/></button></div></header>
      <article className="finance-report-print"><h1>{reportTitles[reportType]}</h1><p>Período: {period}</p>{reportType === "combined" && <div className="finance-report-totals"><div><span>Total de receitas</span><b>{money(incomeTotal)}</b></div><div><span>Total de despesas</span><b>{money(expenseTotal)}</b></div><div><span>Saldo (receitas − despesas)</span><b>{money(incomeTotal - expenseTotal)}</b></div></div>}{(reportType === "income" || reportType === "combined") && <><h2>Receitas · {money(incomeTotal)}</h2><ReportTable rows={incomes} empty="Nenhuma receita no período."/></>}{(reportType === "expense" || reportType === "combined") && <><h2>Despesas · {money(expenseTotal)}</h2><ReportTable rows={expenses} empty="Nenhuma despesa no período."/></>}<footer>Gerado em {new Date().toLocaleString("pt-BR")}</footer></article>
    </section></div>}
  </>;
}

function ReportTable({ rows, empty }: { rows: ReportRow[]; empty: string }) {
  return rows.length ? <table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Cliente / fornecedor</th><th>Forma</th><th>Status</th><th>Valor</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.description}-${index}`}><td>{row.date}</td><td>{row.description}</td><td>{row.category}</td><td>{row.customer || "—"}</td><td>{row.method || "—"}</td><td>{row.status}</td><td>{money(row.amount)}</td></tr>)}</tbody></table> : <p className="finance-report-empty">{empty}</p>;
}
export type { ReportRow };
