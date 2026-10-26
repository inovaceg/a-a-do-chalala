import { useMemo, useState } from "react";
import { CalendarDays, CreditCard, Package, ReceiptText } from "lucide-react";
import "./sales-report-panel.css";

type ReportSale = {
  id: string;
  receipt_number: string;
  total: number;
  change_amount: number;
  status: "completed" | "cancelled";
  created_at: string;
  sale_items: { product_name: string; quantity: number; line_total: number }[];
  sale_payments: { method: string; amount: number }[];
};
type ReportType = "daily" | "products" | "payments";
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const localDay = (value: string) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const displayDay = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { dateStyle: "long" });

export function SalesReportTabs({ value, onChange }: { value: ReportType; onChange: (value: ReportType) => void }) {
  const tabs: { id: ReportType; label: string; icon: typeof ReceiptText }[] = [
    { id: "daily", label: "Vendas realizadas", icon: ReceiptText },
    { id: "products", label: "Produtos mais vendidos", icon: Package },
    { id: "payments", label: "Formas de pagamento", icon: CreditCard },
  ];
  return <div className="sales-report-tabs" role="tablist" aria-label="Relatórios de vendas">{tabs.map(tab => <button key={tab.id} role="tab" aria-selected={value === tab.id} className={value === tab.id ? "active" : ""} onClick={() => onChange(tab.id)}><tab.icon size={16}/>{tab.label}</button>)}</div>;
}

export default function SalesReportPanel({ report, sales }: { report: ReportType; sales: ReportSale[] }) {
  const today = localDay(new Date().toString());
  const monthStart = `${today.slice(0, 8)}01`;
  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(today);
  const rangeSales = useMemo(() => sales.filter(sale => sale.status === "completed" && localDay(sale.created_at) >= fromDate && localDay(sale.created_at) <= toDate), [sales, fromDate, toDate]);

  const dailyRows = useMemo(() => {
    const days = new Map<string, { count: number; total: number }>();
    rangeSales.forEach(sale => {
      const day = localDay(sale.created_at);
      const current = days.get(day) ?? { count: 0, total: 0 };
      current.count += 1;
      current.total += Number(sale.total);
      days.set(day, current);
    });
    return [...days].sort(([a], [b]) => b.localeCompare(a));
  }, [rangeSales]);

  const productRows = useMemo(() => {
    const products = new Map<string, { quantity: number; total: number }>();
    rangeSales.forEach(sale => sale.sale_items.forEach(item => {
      const current = products.get(item.product_name) ?? { quantity: 0, total: 0 };
      current.quantity += Number(item.quantity);
      current.total += Number(item.line_total);
      products.set(item.product_name, current);
    }));
    const sorted = [...products].map(([name, values]) => ({ name, ...values })).sort((a, b) => b.total - a.total);
    const grandTotal = sorted.reduce((sum, item) => sum + item.total, 0);
    let cumulative = 0;
    return sorted.map(item => {
      const share = grandTotal ? item.total / grandTotal * 100 : 0;
      cumulative += share;
      const previous = cumulative - share;
      return { ...item, share, cumulative, category: previous < 80 ? "A" : previous < 95 ? "B" : "C" };
    });
  }, [rangeSales]);

  const paymentRows = useMemo(() => {
    const methods = new Map<string, number>();
    rangeSales.forEach(sale => {
      sale.sale_payments.forEach(payment => {
        const received = Number(payment.amount) - (payment.method === "Dinheiro" ? Number(sale.change_amount) : 0);
        methods.set(payment.method, (methods.get(payment.method) ?? 0) + Math.max(0, received));
      });
    });
    return [...methods].map(([method, total]) => ({ method, total })).sort((a, b) => b.total - a.total);
  }, [rangeSales]);

  return <section className="sales-report-panel">
    <div className="sales-report-toolbar"><div><CalendarDays size={17}/><span>Período do relatório</span></div><label>De<input type="date" value={fromDate} max={toDate} onChange={event => setFromDate(event.target.value)}/></label><label>Até<input type="date" value={toDate} min={fromDate} onChange={event => setToDate(event.target.value)}/></label></div>
    {report === "daily" && <><div className="report-summary-cards"><article><span>Faturamento no período</span><b>{money(rangeSales.reduce((sum, sale) => sum + Number(sale.total), 0))}</b></article><article><span>Vendas concluídas</span><b>{rangeSales.length}</b></article><article><span>Média por venda</span><b>{money(rangeSales.length ? rangeSales.reduce((sum, sale) => sum + Number(sale.total), 0) / rangeSales.length : 0)}</b></article></div><div className="report-table-scroll"><table className="report-table"><thead><tr><th>Data</th><th>Vendas</th><th>Total do dia</th></tr></thead><tbody>{dailyRows.map(([day, values]) => <tr key={day}><td>{displayDay(day)}</td><td>{values.count}</td><td className="report-amount">{money(values.total)}</td></tr>)}</tbody></table>{dailyRows.length === 0 && <div className="report-empty">Nenhuma venda concluída no período selecionado.</div>}</div></>}
    {report === "products" && <><p className="report-description">Produtos em ordem decrescente de faturamento. A classificação ABC usa a participação acumulada no período: A até 80%, B até 95% e C acima de 95%.</p><div className="report-table-scroll"><table className="report-table"><thead><tr><th>#</th><th>Produto</th><th>Unidades</th><th>Faturamento</th><th>Participação</th><th>Acumulado</th><th>Classe</th></tr></thead><tbody>{productRows.map((item, index) => <tr key={item.name}><td>{index + 1}</td><td>{item.name}</td><td>{item.quantity}</td><td className="report-amount">{money(item.total)}</td><td>{item.share.toFixed(1)}%</td><td>{item.cumulative.toFixed(1)}%</td><td><span className={`abc-tag abc-${item.category.toLowerCase()}`}>{item.category}</span></td></tr>)}</tbody></table>{productRows.length === 0 && <div className="report-empty">Nenhum produto vendido no período selecionado.</div>}</div></>}
    {report === "payments" && <><div className="report-summary-cards payment-summary"><article><span>Total recebido</span><b>{money(paymentRows.reduce((sum, item) => sum + item.total, 0))}</b></article><article><span>Formas utilizadas</span><b>{paymentRows.length}</b></article></div><div className="report-table-scroll"><table className="report-table"><thead><tr><th>Forma de pagamento</th><th>Total recebido</th><th>Participação</th></tr></thead><tbody>{paymentRows.map(item => { const grandTotal = paymentRows.reduce((sum, row) => sum + row.total, 0); return <tr key={item.method}><td>{item.method}</td><td className="report-amount">{money(item.total)}</td><td>{grandTotal ? `${(item.total / grandTotal * 100).toFixed(1)}%` : "0,0%"}</td></tr>; })}</tbody></table>{paymentRows.length === 0 && <div className="report-empty">Nenhum pagamento no período selecionado.</div>}</div></>}
  </section>;
}
export type { ReportType };
