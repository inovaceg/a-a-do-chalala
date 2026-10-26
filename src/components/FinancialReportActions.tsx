import { useState } from "react";
import { Eye, FileDown, X } from "lucide-react";
import "./financial-report.css";

type ReportRow = { date: string; description: string; category: string; customer: string; method: string; amount: number; status: string };
type Props = { period: string; incomes: ReportRow[]; expenses: ReportRow[] };
const money = (amount: number) => Number(amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function FinancialReportActions({ period, incomes, expenses }: Props) {
  const [open, setOpen] = useState(false);
  const printReport = () => window.print();
  return <>
    <div className="finance-report-actions"><button type="button" className="finance-secondary" onClick={() => setOpen(true)}><Eye size={15}/> Visualizar</button><button type="button" className="finance-primary" onClick={() => { setOpen(true); window.setTimeout(printReport, 250); }}><FileDown size={15}/> Gerar PDF</button></div>
    {open && <div className="finance-report-backdrop"><section className="finance-report-dialog"><header className="finance-report-toolbar"><div><span className="finance-kicker">RELATÓRIO FINANCEIRO</span><h2>Receitas e despesas</h2><p>Período: {period}</p></div><div><button type="button" className="finance-primary" onClick={printReport}><FileDown size={15}/> Gerar PDF</button><button type="button" className="finance-modal-close" onClick={() => setOpen(false)} aria-label="Fechar visualização"><X size={18}/></button></div></header>
      <article className="finance-report-print"><h1>Relatório financeiro</h1><p>Período: {period}</p><h2>Receitas · {money(incomes.reduce((sum, row) => sum + row.amount, 0))}</h2><ReportTable rows={incomes} empty="Nenhuma receita no período."/><h2>Despesas · {money(expenses.reduce((sum, row) => sum + row.amount, 0))}</h2><ReportTable rows={expenses} empty="Nenhuma despesa no período."/><footer>Gerado em {new Date().toLocaleString("pt-BR")}</footer></article>
    </section></div>}
  </>;
}

function ReportTable({ rows, empty }: { rows: ReportRow[]; empty: string }) {
  return rows.length ? <table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Cliente / fornecedor</th><th>Forma</th><th>Status</th><th>Valor</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.description}-${index}`}><td>{row.date}</td><td>{row.description}</td><td>{row.category}</td><td>{row.customer || "—"}</td><td>{row.method || "—"}</td><td>{row.status}</td><td>{money(row.amount)}</td></tr>)}</tbody></table> : <p className="finance-report-empty">{empty}</p>;
}
export type { ReportRow };
