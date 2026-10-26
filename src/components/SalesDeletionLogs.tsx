import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import "./sales-deletion.css";

type DeletionAudit = { id: string; receipt_number: string; total: number; sale_status: "completed" | "cancelled"; deleted_by_name: string; deleted_by_email: string; deleted_at: string };
const money = (amount: number) => Number(amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = (date: string) => new Date(date).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default function SalesDeletionLogs() {
  const [entries, setEntries] = useState<DeletionAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLogs = async () => {
    setLoading(true);
    setError("");
    const { data, error: queryError } = await supabase.from("sales_deletion_audit").select("id,receipt_number,total,sale_status,deleted_by_name,deleted_by_email,deleted_at").order("deleted_at", { ascending: false }).limit(500);
    if (queryError) setError("Não foi possível carregar os registros de exclusão. Tente novamente.");
    else setEntries((data ?? []) as DeletionAudit[]);
    setLoading(false);
  };

  useEffect(() => { void loadLogs(); }, []);

  return <section className="sales-audit-panel registrations-log-panel"><header><div><span className="auth-kicker">AUDITORIA</span><h2>Logs de exclusão de vendas</h2><p>Registro permanente das exclusões realizadas por administradores.</p></div><button className="secondary-action" onClick={() => void loadLogs()} disabled={loading}><RefreshCw size={15}/> Atualizar</button></header>{error && <p className="sales-audit-error" role="alert">{error}</p>}{loading ? <div className="sales-empty">Carregando logs…</div> : entries.length === 0 ? <div className="sales-empty">Nenhuma venda excluída registrada.</div> : <div className="sales-table-wrap"><table className="sales-table"><thead><tr><th>Venda</th><th>Valor</th><th>Status anterior</th><th>Excluída por</th><th>Data e hora</th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id}><td><b className="order-id">#{entry.receipt_number}</b></td><td className="amount">{money(entry.total)}</td><td>{entry.sale_status === "completed" ? "Concluída" : "Cancelada"}</td><td>{entry.deleted_by_name}<small className="sales-audit-email">{entry.deleted_by_email}</small></td><td>{dateTime(entry.deleted_at)}</td></tr>)}</tbody></table></div>}</section>;
}
