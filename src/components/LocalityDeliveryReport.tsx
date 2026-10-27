import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import "./sales-report-panel.css";

type DeliverySale = { id: string; total: number; status: "completed" | "cancelled"; created_at: string; is_delivery?: boolean; neighborhood?: string | null };
const localDay = (value: string) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function LocalityDeliveryReport({ sales }: { sales: DeliverySale[] }) {
  const today = localDay(new Date().toString());
  const [fromDate, setFromDate] = useState(`${today.slice(0, 8)}01`);
  const [toDate, setToDate] = useState(today);
  const rows = useMemo(() => {
    const groups = new Map<string, { name: string; count: number; total: number }>();
    sales.filter(sale => sale.status === "completed" && sale.is_delivery && localDay(sale.created_at) >= fromDate && localDay(sale.created_at) <= toDate).forEach(sale => {
      const name = sale.neighborhood?.trim() || "Bairro não identificado";
      const key = name.toLocaleLowerCase("pt-BR");
      const row = groups.get(key) ?? { name, count: 0, total: 0 };
      row.count += 1;
      row.total += Number(sale.total);
      groups.set(key, row);
    });
    return [...groups.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"));
  }, [sales, fromDate, toDate]);
  const deliveryCount = rows.reduce((sum, row) => sum + row.count, 0);
  const identifiedCount = rows.filter(row => row.name !== "Bairro não identificado").length;

  return <section className="sales-report-panel">
    <div className="sales-report-toolbar"><div><CalendarDays size={17}/><span>Período do relatório</span></div><label>De<input type="date" value={fromDate} max={toDate} onChange={event => setFromDate(event.target.value)}/></label><label>Até<input type="date" value={toDate} min={fromDate} onChange={event => setToDate(event.target.value)}/></label></div>
    <div className="report-summary-cards"><article><span>Entregas concluídas</span><b>{deliveryCount}</b></article><article><span>Bairros atendidos</span><b>{identifiedCount}</b></article><article><span>Entregas sem bairro identificado</span><b>{rows.find(row => row.name === "Bairro não identificado")?.count ?? 0}</b></article></div>
    <p className="report-description">Quantidade de vendas delivery concluídas agrupadas pelo bairro cadastrado do cliente no período selecionado.</p>
    <div className="report-table-scroll"><table className="report-table"><thead><tr><th>Bairro</th><th>Quantidade de entregas</th><th>Total vendido</th></tr></thead><tbody>{rows.map(row => <tr key={row.name}><td>{row.name}</td><td>{row.count}</td><td className="report-amount">{money(row.total)}</td></tr>)}</tbody></table>{rows.length === 0 && <div className="report-empty">Nenhuma entrega concluída no período selecionado.</div>}</div>
  </section>;
}
