import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Pencil, Plus, Printer, RefreshCw, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import SalesReportPanel, { SalesReportTabs, type ReportType } from "./SalesReportPanel";
import "./sales-management.css";
import "./sales-management-operator.css";
import "./sales-deletion.css";

type Extra = { name: string; price: number };
type Product = { id: string; name: string; price: number; extras: Extra[] };
type SaleItem = { id: string; product_id: string | null; product_name: string; quantity: number; unit_price: number; extras: Extra[]; line_total: number };
type PaymentMethod = "Dinheiro" | "Cartão de débito" | "Cartão de crédito" | "Pix" | "Vale alimentação" | "Crediário";
type SalePayment = { id: string; method: PaymentMethod; amount: number };
type Sale = { id: string; receipt_number: string; total: number; subtotal: number; discount_amount: number; change_amount: number; status: "completed" | "cancelled"; created_at: string; credit_customer: string | null; credit_due_date: string | null; customer_id: string | null; customer_name: string | null; customer_whatsapp: string | null; courier_id: string | null; courier_name?: string; sale_items: SaleItem[]; sale_payments: SalePayment[] };
type EditItem = { key: string; productId: string; quantity: number; extras: Extra[] };
type EditPayment = { key: string; method: PaymentMethod; amount: number };
const methods: PaymentMethod[] = ["Dinheiro", "Cartão de débito", "Cartão de crédito", "Pix", "Vale alimentação", "Crediário"];
const money = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = (date: string) => new Date(date).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default function SalesManagement({ active, role }: { active: boolean; role: "admin" | "operator" }) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [reportTab, setReportTab] = useState<ReportType>("daily");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Sale | null>(null);
  const [items, setItems] = useState<EditItem[]>([]);
  const [payments, setPayments] = useState<EditPayment[]>([]);
  const [creditCustomer, setCreditCustomer] = useState("");
  const [creditDueDate, setCreditDueDate] = useState("");
  const [changeAmount, setChangeAmount] = useState("0");
  const loadSales = useCallback(async () => {
    setLoading(true);
    setError("");
    let salesQuery = supabase.from("sales").select("id,receipt_number,total,subtotal,discount_amount,change_amount,status,created_at,credit_customer,credit_due_date,customer_id,customer_name,customer_whatsapp,courier_id,sale_items(id,product_id,product_name,quantity,unit_price,extras,line_total),sale_payments(id,method,amount)").order("created_at", { ascending: false }).limit(1000);
    if (role === "operator") {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setError("Não foi possível identificar o operador da sessão.");
        setLoading(false);
        return;
      }
      salesQuery = salesQuery.eq("created_by", user.id);
    }
    const [{ data, error: salesError }, { data: productData, error: productsError }, { data: courierData }] = await Promise.all([
      salesQuery,
      supabase.from("products").select("id,name,price,extras").eq("is_active", true).order("name"),
      supabase.from("couriers").select("id,name").order("name"),
    ]);
    if (salesError || productsError) setError("Não foi possível carregar todas as informações de vendas. Tente novamente.");
    const courierNames = new Map((courierData ?? []).map(courier => [courier.id, courier.name]));
    setSales(((data ?? []) as unknown as Sale[]).map(sale => ({ ...sale, courier_name: sale.courier_id ? courierNames.get(sale.courier_id) ?? "Motoboy não localizado" : "Sem motoboy" })));
    setProducts((productData ?? []) as Product[]);
    setLoading(false);
  }, [role]);

  useEffect(() => {
    if (active) void loadSales();
  }, [active, loadSales]);

  const productById = useMemo(() => new Map(products.map(product => [product.id, product])), [products]);
  const editTotal = useMemo(() => items.reduce((sum, item) => {
    const product = productById.get(item.productId);
    return sum + (product ? (Number(product.price) + item.extras.reduce((extraTotal, extra) => extraTotal + Number(extra.price), 0)) * item.quantity : 0);
  }, 0) - Number(editing?.discount_amount ?? 0), [items, productById, editing]);

  const startEdit = (sale: Sale) => {
    if (role !== "admin") return;
    setEditing(sale);
    setItems(sale.sale_items.map((item, index) => ({ key: `${item.id}-${index}`, productId: item.product_id ?? "", quantity: item.quantity, extras: item.extras ?? [] })));
    setPayments(sale.sale_payments.map((payment, index) => ({ key: `${payment.id}-${index}`, method: payment.method, amount: Number(payment.amount) })));
    setCreditCustomer(sale.credit_customer ?? "");
    setCreditDueDate(sale.credit_due_date ?? "");
    setChangeAmount(String(sale.change_amount ?? 0));
    setError("");
  };

  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError("");
    const { error: updateError } = await supabase.rpc("update_sale", {
      p_sale_id: editing.id,
      p_items: items.map(item => ({ product_id: item.productId, quantity: item.quantity, extras: item.extras })),
      p_payments: payments.map(({ method, amount }) => ({ method, amount })),
      p_credit_customer: creditCustomer.trim().toLocaleUpperCase("pt-BR") || null,
      p_credit_due_date: creditDueDate || null,
      p_change: Number(changeAmount) || 0,
    });
    setSaving(false);
    if (updateError) { setError(updateError.message || "Não foi possível atualizar a venda."); return; }
    setEditing(null);
    setNotice("Venda atualizada com sucesso.");
    await loadSales();
  };

  const cancelSale = async (sale: Sale) => {
    if (role !== "admin" || !window.confirm(`Cancelar a venda ${sale.receipt_number}?`)) return;
    setError("");
    const { error: cancelError } = await supabase.rpc("cancel_sale", { p_sale_id: sale.id });
    if (cancelError) { setError(cancelError.message || "Não foi possível cancelar a venda."); return; }
    setNotice(`Venda ${sale.receipt_number} cancelada.`);
    await loadSales();
  };

  const deleteSale = async (sale: Sale) => {
    if (role !== "admin" || !window.confirm(`Excluir permanentemente a venda ${sale.receipt_number} no valor de ${money(sale.total)}? Essa ação não pode ser desfeita. O registro de auditoria será mantido.`)) return;
    setDeleting(sale.id);
    setError("");
    const { error: deleteError } = await supabase.rpc("delete_sale_with_audit", { p_sale_id: sale.id });
    if (deleteError) {
      setError(deleteError.message || "Não foi possível excluir a venda.");
      setDeleting(null);
      return;
    }
    setNotice(`Venda ${sale.receipt_number} excluída. A operação foi registrada no histórico.`);
    await loadSales();
    setDeleting(null);
  };

  const reprintSale = (sale: Sale) => {
    const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character] ?? character);
    const popup = window.open("", "_blank", "width=520,height=760");
    if (!popup) {
      setError("O navegador bloqueou a janela do comprovante. Permita pop-ups para gerar o PDF.");
      return;
    }
    const itemRows = sale.sale_items.map(item => `<div class="item"><div><b>${item.quantity}× ${escapeHtml(item.product_name)}</b>${(item.extras ?? []).map(extra => `<small>+ ${escapeHtml(extra.name)} (${money(Number(extra.price))})</small>`).join("")}</div><strong>${money(Number(item.line_total))}</strong></div>`).join("");
    const discount = Number(sale.discount_amount) > 0 ? `<div class="row"><span>Desconto</span><b>− ${money(Number(sale.discount_amount))}</b></div>` : "";
    const paymentsHtml = sale.sale_payments.map(payment => `<div class="row"><span>${escapeHtml(payment.method)}</span><b>${money(Number(payment.amount))}</b></div>`).join("");
    const change = Number(sale.change_amount) > 0 ? `<div class="row"><span>Troco</span><b>${money(Number(sale.change_amount))}</b></div>` : "";
    const customer = sale.customer_name ? `<p>Cliente: ${escapeHtml(sale.customer_name)}</p>` : "";
    popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cupom ${escapeHtml(sale.receipt_number)}</title><style>*{box-sizing:border-box}body{margin:0;background:#f4f1f5;color:#302b35;font:14px Arial,sans-serif}.toolbar{position:sticky;top:0;display:flex;justify-content:center;gap:10px;padding:14px;background:#fff;border-bottom:1px solid #ddd}.toolbar button{padding:10px 16px;border:0;border-radius:9px;background:#5b117a;color:#fff;font-weight:700;cursor:pointer}.toolbar button:last-child{background:#eee;color:#302b35}.receipt{width:min(80mm,calc(100% - 32px));margin:24px auto;padding:20px;background:#fff}.brand{text-align:center;font-weight:800;color:#5b117a}.receipt h1{text-align:center;font-size:17px}.meta{text-align:center;font-size:12px;color:#625b66}.items{margin:18px 0;border-top:1px dashed #aaa}.item,.row{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px dashed #ddd}.item small{display:block;margin-top:4px}.row{font-size:12px}.total{display:flex;justify-content:space-between;padding-top:14px;font-size:16px;font-weight:800}.status{text-align:center;margin-top:16px;font-size:10px}@media print{body{background:#fff}.toolbar{display:none}.receipt{width:72mm;margin:0;padding:3mm}.brand{color:#000}.items{margin-top:10px}}</style></head><body><nav class="toolbar"><button onclick="window.print()">Imprimir / Salvar PDF</button><button onclick="window.close()">Fechar</button></nav><main class="receipt"><div class="brand">AÇAÍ DO CHALALA</div><h1>Comprovante não fiscal</h1><div class="meta">Venda #${escapeHtml(sale.receipt_number)} · ${escapeHtml(dateTime(sale.created_at))}</div><div class="items">${itemRows}</div>${discount}${paymentsHtml}${change}${customer}<div class="total"><span>TOTAL</span><span>${money(Number(sale.total))}</span></div><div class="status">Venda ${sale.status === "completed" ? "concluída" : "cancelada"}</div></main></body></html>`);
    popup.document.close();
    setError("");
  };

  if (!active) return null;

  return <div className={`sales-screen ${role === "operator" ? "operator-sales-view" : ""}`}>
    <section className="sales-workspace">
      <header className="sales-workspace-heading"><div><span className="modal-kicker">RELATÓRIOS DO PDV</span><h2>Vendas e relatórios</h2><p>Consulte faturamento, produtos, formas de pagamento e vendas por cliente.</p></div><button className="sales-refresh" onClick={() => void loadSales()} disabled={loading} aria-label="Atualizar vendas"><RefreshCw size={16}/></button></header>
      {notice && <div className="sales-notice">{notice}<button onClick={() => setNotice("")} aria-label="Fechar aviso"><X size={14}/></button></div>}
      {error && !editing && <div className="sales-error" role="alert">{error}</div>}
      <SalesReportTabs value={reportTab} onChange={setReportTab}/>
      {loading ? <div className="sales-empty">Carregando vendas…</div> : reportTab !== "daily" ? <SalesReportPanel report={reportTab} sales={sales}/> : <><SalesReportPanel report="daily" sales={sales}/><h3 className="sales-history-subheading">Detalhamento das vendas</h3>{sales.length === 0 ? <div className="sales-empty"><strong>Nenhuma venda registrada ainda</strong><span>As vendas concluídas no PDV aparecerão aqui.</span></div> : <div className="sales-table-wrap"><table className="sales-table"><thead><tr><th>Venda</th><th>Data e hora</th><th>Itens</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead><tbody>{sales.map(sale => <tr key={sale.id}><td><b className="order-id">#{sale.receipt_number}</b></td><td>{dateTime(sale.created_at)}</td><td><div className="sales-items-summary">{sale.sale_items.map(item => <span key={item.id}>{item.quantity}× {item.product_name}</span>)}</div></td><td className="amount">{money(sale.total)}</td><td><span className={`sales-status ${sale.status}`}>{sale.status === "completed" ? "Concluída" : "Cancelada"}</span></td><td><div className="sales-actions"><button onClick={() => reprintSale(sale)} aria-label={`Gerar PDF do cupom da venda ${sale.receipt_number}`}><Printer size={15}/> Gerar PDF</button><button onClick={() => startEdit(sale)} disabled={sale.status !== "completed"} aria-label={`Editar venda ${sale.receipt_number}`}><Pencil size={15}/> Editar</button><button className="sales-cancel" onClick={() => void cancelSale(sale)} disabled={sale.status !== "completed"} aria-label={`Cancelar venda ${sale.receipt_number}`}><Ban size={15}/> Cancelar</button>{role === "admin" && <button className="sales-delete" onClick={() => void deleteSale(sale)} disabled={deleting === sale.id} aria-label={`Excluir venda ${sale.receipt_number}`}><Trash2 size={15}/> {deleting === sale.id ? "Excluindo…" : "Excluir"}</button>}</div></td></tr>)}</tbody></table></div>}</>}
    </section>

    {editing && <div className="modal-backdrop sales-edit-backdrop"><form className="catalog-modal sales-edit-modal" onSubmit={saveEdit}><button type="button" className="modal-close" onClick={() => setEditing(null)} aria-label="Fechar"><X size={18}/></button><div className="modal-kicker">EDIÇÃO DA VENDA · {editing.receipt_number}</div><h2>Editar produtos e pagamentos</h2><p>Os preços serão recalculados pelo catálogo atual.</p><div className="sales-edit-lines"><div className="sales-edit-line-head"><span>Produto</span><span>Qtd.</span><span>Valor</span><span/></div>{items.map((item, index) => { const product = productById.get(item.productId); const lineTotal = product ? (Number(product.price) + item.extras.reduce((sum, extra) => sum + Number(extra.price), 0)) * item.quantity : 0; return <div className="sales-edit-line" key={item.key}><select aria-label={`Produto ${index + 1}`} required value={item.productId} onChange={event => setItems(current => current.map((line, lineIndex) => lineIndex === index ? { ...line, productId: event.target.value, extras: [] } : line))}><option value="">Selecione produto</option>{products.map(option => <option key={option.id} value={option.id}>{option.name} · {money(option.price)}</option>)}</select><input aria-label={`Quantidade ${index + 1}`} type="number" min="1" step="1" required value={item.quantity} onChange={event => setItems(current => current.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: Math.max(1, Number(event.target.value)) } : line))}/><b>{money(lineTotal)}</b><button type="button" className="sales-remove-line" onClick={() => setItems(current => current.filter((_, lineIndex) => lineIndex !== index))} aria-label="Remover item"><X size={15}/></button></div>; })}</div><button type="button" className="secondary-action sales-add-line" onClick={() => setItems(current => [...current, { key: crypto.randomUUID(), productId: "", quantity: 1, extras: [] }])}><Plus size={15}/> Adicionar produto</button><div className="sales-payment-edit"><div className="payment-heading"><h3>Pagamentos</h3><button type="button" className="secondary-action" onClick={() => setPayments(current => [...current, { key: crypto.randomUUID(), method: "Pix", amount: 0 }])}><Plus size={14}/> Adicionar pagamento</button></div>{payments.map((payment, index) => <div className="sales-payment-row" key={payment.key}><select aria-label={`Pagamento ${index + 1}`} value={payment.method} onChange={event => setPayments(current => current.map((line, lineIndex) => lineIndex === index ? { ...line, method: event.target.value as PaymentMethod } : line))}>{methods.map(method => <option key={method}>{method}</option>)}</select><input aria-label={`Valor do pagamento ${index + 1}`} type="number" min="0" step="0.01" required value={payment.amount} onChange={event => setPayments(current => current.map((line, lineIndex) => lineIndex === index ? { ...line, amount: Number(event.target.value) } : line))}/><button type="button" className="sales-remove-line" onClick={() => setPayments(current => current.filter((_, lineIndex) => lineIndex !== index))} aria-label="Remover pagamento"><X size={15}/></button></div>)}</div>{payments.some(payment => payment.method === "Crediário") && <div className="credit-fields"><label>Cliente do crediário<input value={creditCustomer} onChange={event => setCreditCustomer(event.target.value)}/></label><label>Vencimento<input type="date" value={creditDueDate} onChange={event => setCreditDueDate(event.target.value)}/></label></div>}{payments.some(payment => payment.method === "Dinheiro") && <label className="change-field">Troco a devolver<input type="number" min="0" step="0.01" value={changeAmount} onChange={event => setChangeAmount(event.target.value)}/></label>}<div className="sales-edit-total"><span>Total atualizado</span><b>{money(editTotal)}</b></div>{error && <small className="discount-error" role="alert">{error}</small>}<div className="modal-actions"><button type="button" className="secondary-action" onClick={() => setEditing(null)} disabled={saving}>Voltar</button><button className="primary-button" disabled={saving || items.length === 0 || payments.length === 0}>{saving ? "Salvando…" : "Salvar alterações"}</button></div></form></div>}
  </div>;
}
