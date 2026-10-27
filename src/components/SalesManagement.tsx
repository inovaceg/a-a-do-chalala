import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Pencil, Plus, Printer, RefreshCw, Trash2, X } from "lucide-react";
import { jsPDF } from "jspdf";
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
type Sale = { id: string; receipt_number: string; total: number; subtotal: number; delivery_fee?: number; discount_amount: number; change_amount: number; status: "completed" | "cancelled"; created_at: string; credit_customer: string | null; credit_due_date: string | null; customer_id: string | null; customer_name: string | null; customer_whatsapp: string | null; courier_id: string | null; courier_name?: string; is_delivery?: boolean; is_tab?: boolean; delivery_address?: string | null; neighborhood?: string | null; customers?: { neighborhood: string | null } | { neighborhood: string | null }[] | null; sale_items: SaleItem[]; sale_payments: SalePayment[] };
type EditItem = { key: string; productId: string; quantity: number; extras: Extra[] };
type EditPayment = { key: string; method: PaymentMethod; amount: number };
const methods: PaymentMethod[] = ["Dinheiro", "Cartão de débito", "Cartão de crédito", "Pix", "Vale alimentação", "Crediário"];
const money = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = (date: string) => new Date(date).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const localDay = (value: string) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

function SalesManagement({ active, role }: { active: boolean; role: "admin" | "operator" }) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [reportTab, setReportTab] = useState<ReportType>("daily");
  const [detailDateRange, setDetailDateRange] = useState(() => {
    const today = localDay(new Date().toISOString());
    return { from: `${today.slice(0, 8)}01`, to: today };
  });
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
    let salesQuery = supabase.from("sales").select("id,receipt_number,total,subtotal,delivery_fee,discount_amount,change_amount,status,created_at,credit_customer,credit_due_date,customer_id,customer_name,customer_whatsapp,courier_id,is_delivery,delivery_address,customers(neighborhood),sale_items(id,product_id,product_name,quantity,unit_price,extras,line_total),sale_payments(id,method,amount)").order("created_at", { ascending: false }).limit(1000);
    if (role === "operator") {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setError("Não foi possível identificar o operador da sessão.");
        setLoading(false);
        return;
      }
      salesQuery = salesQuery.eq("created_by", user.id);
    }
    let tabsQuery = supabase.from("tabs").select("id,tab_number,status,opened_at,closed_at,customer_id,customer_name,opened_by,tab_orders(tab_items(id,product_id,product_name,quantity,unit_price,extras,status)),tab_payments(id,method,amount,change_amount,received_at)").eq("status", "closed").order("closed_at", { ascending: false }).limit(1000);
    if (role === "operator") {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) tabsQuery = tabsQuery.eq("opened_by", user.id);
    }
    const [{ data, error: salesError }, { data: productData, error: productsError }, { data: courierData }, { data: tabData, error: tabsError }] = await Promise.all([
      salesQuery,
      supabase.from("products").select("id,name,price,extras").eq("is_active", true).order("name"),
      supabase.from("couriers").select("id,name").order("name"),
      tabsQuery,
    ]);
    if (salesError || productsError || tabsError) setError("Não foi possível carregar todas as informações de vendas. Tente novamente.");
    const courierNames = new Map((courierData ?? []).map(courier => [courier.id, courier.name]));
    const regularSales = ((data ?? []) as unknown as Sale[]).map(sale => ({ ...sale, neighborhood: (Array.isArray(sale.customers) ? sale.customers[0] : sale.customers)?.neighborhood ?? null, courier_name: sale.courier_id ? courierNames.get(sale.courier_id) ?? "Motoboy não localizado" : "Sem motoboy" }));
    const tabSales = (tabData ?? []).map((tab: any): Sale => {
      const items = (tab.tab_orders ?? []).flatMap((order: any) => order.tab_items ?? []).filter((item: any) => item.status === "active");
      const saleItems = items.map((item: any) => {
        const extras = (item.extras ?? []) as Extra[];
        const lineTotal = (Number(item.unit_price) + extras.reduce((sum, extra) => sum + Number(extra.price), 0)) * Number(item.quantity);
        return { id: item.id, product_id: item.product_id, product_name: item.product_name, quantity: Number(item.quantity), unit_price: Number(item.unit_price), extras, line_total: lineTotal };
      });
      const salePayments = (tab.tab_payments ?? []).map((payment: any) => ({ id: payment.id, method: payment.method as PaymentMethod, amount: Number(payment.amount) }));
      const total = saleItems.reduce((sum: number, item: SaleItem) => sum + item.line_total, 0);
      return { id: tab.id, receipt_number: `COMANDA ${tab.tab_number}`, total, subtotal: total, discount_amount: 0, change_amount: (tab.tab_payments ?? []).reduce((sum: number, payment: any) => sum + Number(payment.change_amount ?? 0), 0), status: "completed", created_at: tab.closed_at ?? tab.opened_at, credit_customer: null, credit_due_date: null, customer_id: tab.customer_id, customer_name: tab.customer_name, customer_whatsapp: null, courier_id: null, is_tab: true, sale_items: saleItems, sale_payments: salePayments };
    });
    setSales([...regularSales, ...tabSales].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    setProducts((productData ?? []) as Product[]);
    setLoading(false);
  }, [role]);

  useEffect(() => {
    if (active) void loadSales();
  }, [active, loadSales]);

  const productById = useMemo(() => new Map(products.map(product => [product.id, product])), [products]);
  const detailSales = useMemo(() => sales.filter(sale => {
    const day = localDay(sale.created_at);
    return day >= detailDateRange.from && day <= detailDateRange.to;
  }), [sales, detailDateRange]);
  const syncDetailDateRange = useCallback((from: string, to: string) => {
    setDetailDateRange(current => current.from === from && current.to === to ? current : { from, to });
  }, []);
  const editTotal = useMemo(() => items.reduce((sum, item) => {
    const product = productById.get(item.productId);
    return sum + (product ? (Number(product.price) + item.extras.reduce((extraTotal, extra) => extraTotal + Number(extra.price), 0)) * item.quantity : 0);
  }, 0) - Number(editing?.discount_amount ?? 0) + Number(editing?.delivery_fee ?? 0), [items, productById, editing]);

  const startEdit = (sale: Sale) => {
    if (role !== "admin" || sale.is_tab) return;
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
    if (role !== "admin" || sale.is_tab || !window.confirm(`Cancelar a venda ${sale.receipt_number}?`)) return;
    setError("");
    const { error: cancelError } = await supabase.rpc("cancel_sale", { p_sale_id: sale.id });
    if (cancelError) { setError(cancelError.message || "Não foi possível cancelar a venda."); return; }
    setNotice(`Venda ${sale.receipt_number} cancelada.`);
    await loadSales();
  };

  const deleteSale = async (sale: Sale) => {
    if (role !== "admin" || sale.is_tab || !window.confirm(`Excluir permanentemente a venda ${sale.receipt_number} no valor de ${money(sale.total)}? Essa ação não pode ser desfeita. O registro de auditoria será mantido.`)) return;
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
    const orderNumber = (sale.receipt_number.match(/\d+$/)?.[0] ?? sale.receipt_number).slice(-6).padStart(6, "0");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [80, 400] });
    const rows: { text: string; size: number; bold?: boolean; align?: "left" | "center" | "right" }[] = [
      { text: "AÇAÍ DO CHALALA", size: 15, bold: true, align: "center" },
      { text: "O sabor que conquista!", size: 9, align: "center" },
      { text: "Endereço: R. Luís Marchini, 228 - São Benedito, Juiz de Fora - MG, 36061-270", size: 8, align: "center" },
      { text: "--------------------------------", size: 8, align: "center" },
      { text: "COMPROVANTE DE PEDIDO", size: 10, bold: true, align: "center" },
      { text: "--------------------------------", size: 8, align: "center" },
      { text: `PEDIDO Nº ${orderNumber}`, size: 13, bold: true, align: "center" },
      { text: `DATA: ${new Date(sale.created_at).toLocaleString("pt-BR")}`, size: 8 },
      { text: `TIPO: ${sale.is_delivery ? "DELIVERY" : "NÃO DELIVERY"}`, size: 9, bold: true },
    ];
    if (sale.customer_name) rows.push({ text: `CLIENTE: ${sale.customer_name}${sale.customer_whatsapp ? ` · ${sale.customer_whatsapp}` : ""}`, size: 8 });
    if (sale.delivery_address) rows.push({ text: `ENDEREÇO DE ENTREGA: ${sale.delivery_address}`, size: 8 });
    if (sale.courier_name && sale.courier_name !== "Sem motoboy") rows.push({ text: `ENTREGADOR: ${sale.courier_name}`, size: 8 });
    rows.push({ text: "--------------------------------", size: 8, align: "center" });
    for (const item of sale.sale_items) {
      rows.push({ text: `${item.quantity} x ${item.product_name}  ${money(Number(item.line_total))}`, size: 9, bold: true });
      for (const extra of item.extras ?? []) rows.push({ text: `  + ${extra.name} (${money(Number(extra.price))})`, size: 8 });
    }
    rows.push({ text: "--------------------------------", size: 8, align: "center" });
    if (Number(sale.delivery_fee) > 0) rows.push({ text: `TAXA DE ENTREGA: ${money(Number(sale.delivery_fee))}`, size: 8 });
    for (const payment of sale.sale_payments) rows.push({ text: `PAGAMENTO: ${payment.method}  ${money(Number(payment.amount))}`, size: 8 });
    if (Number(sale.discount_amount) > 0) rows.push({ text: `DESCONTO: ${money(Number(sale.discount_amount))}`, size: 8 });
    if (Number(sale.change_amount) > 0) rows.push({ text: `TROCO: ${money(Number(sale.change_amount))}`, size: 8 });
    rows.push({ text: `TOTAL  ${money(Number(sale.total))}`, size: 12, bold: true, align: "right" });
    rows.push({ text: "--------------------------------", size: 8, align: "center" }, { text: "Obrigado pela preferência!", size: 9, bold: true, align: "center" }, { text: "Volte sempre ao Açaí do Chalala!", size: 8, align: "center" });
    const rendered = rows.flatMap(row => {
      doc.setFont("helvetica", row.bold ? "bold" : "normal");
      doc.setFontSize(row.size);
      return doc.splitTextToSize(row.text, 74).map(text => ({ ...row, text }));
    });
    const pageHeight = rendered.reduce((height, row) => height + row.size * 0.48 + 2, 10);
    doc.internal.pageSize.setHeight(pageHeight);
    let y = 5;
    for (const row of rendered) {
      doc.setFont("helvetica", row.bold ? "bold" : "normal");
      doc.setFontSize(row.size);
      doc.text(row.text, row.align === "center" ? 40 : row.align === "right" ? 77 : 3, y, { align: row.align ?? "left" });
      y += row.size * 0.48 + 2;
    }
    doc.save(`comprovante-venda-${sale.receipt_number}.pdf`);
    setError("");
  };

  if (!active) return null;

  return <div className={`sales-screen ${role === "operator" ? "operator-sales-view" : ""}`}>
    <section className="sales-workspace">
      <header className="sales-workspace-heading"><div><span className="modal-kicker">RELATÓRIOS DO PDV</span><h2>Vendas e relatórios</h2><p>Consulte faturamento, produtos, formas de pagamento e vendas por cliente.</p></div><button className="sales-refresh" onClick={() => void loadSales()} disabled={loading} aria-label="Atualizar vendas"><RefreshCw size={16}/></button></header>
      {notice && <div className="sales-notice">{notice}<button onClick={() => setNotice("")} aria-label="Fechar aviso"><X size={14}/></button></div>}
      {error && !editing && <div className="sales-error" role="alert">{error}</div>}
      <SalesReportTabs value={reportTab} onChange={setReportTab}/>
      {loading ? <div className="sales-empty">Carregando vendas…</div> : reportTab !== "daily" ? <SalesReportPanel report={reportTab} sales={sales}/> : <><SalesReportPanel report="daily" sales={sales} onDateRangeChange={syncDetailDateRange}/><h3 className="sales-history-subheading">Detalhamento das vendas</h3>{detailSales.length === 0 ? <div className="sales-empty"><strong>Nenhuma venda nesta data</strong><span>Não há vendas no período selecionado acima.</span></div> : <div className="sales-table-wrap"><table className="sales-table"><thead><tr><th>Venda</th><th>Data e hora</th><th>Itens</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead><tbody>{detailSales.map(sale => <tr key={sale.id}><td><b className="order-id">#{sale.receipt_number}</b></td><td>{dateTime(sale.created_at)}</td><td><div className="sales-items-summary">{sale.sale_items.map(item => <span key={item.id}>{item.quantity}× {item.product_name}</span>)}</div></td><td className="amount">{money(sale.total)}</td><td><span className={`sales-status ${sale.status}`}>{sale.status === "completed" ? "Concluída" : "Cancelada"}</span></td><td><div className="sales-actions"><button onClick={() => reprintSale(sale)} aria-label={`Gerar PDF do cupom da venda ${sale.receipt_number}`}><Printer size={15}/> Gerar PDF</button><button onClick={() => startEdit(sale)} disabled={sale.status !== "completed"} aria-label={`Editar venda ${sale.receipt_number}`}><Pencil size={15}/> Editar</button><button className="sales-cancel" onClick={() => void cancelSale(sale)} disabled={sale.status !== "completed"} aria-label={`Cancelar venda ${sale.receipt_number}`}><Ban size={15}/> Cancelar</button>{role === "admin" && <button className="sales-delete" onClick={() => void deleteSale(sale)} disabled={deleting === sale.id} aria-label={`Excluir venda ${sale.receipt_number}`}><Trash2 size={15}/> {deleting === sale.id ? "Excluindo…" : "Excluir"}</button>}</div></td></tr>)}</tbody></table></div>}</>}
    </section>

    {editing && <div className="modal-backdrop sales-edit-backdrop"><form className="catalog-modal sales-edit-modal" onSubmit={saveEdit}><button type="button" className="modal-close" onClick={() => setEditing(null)} aria-label="Fechar"><X size={18}/></button><div className="modal-kicker">EDIÇÃO DA VENDA · {editing.receipt_number}</div><h2>Editar produtos e pagamentos</h2><p>Os preços serão recalculados pelo catálogo atual.</p><div className="sales-edit-lines"><div className="sales-edit-line-head"><span>Produto</span><span>Qtd.</span><span>Valor</span><span/></div>{items.map((item, index) => { const product = productById.get(item.productId); const lineTotal = product ? (Number(product.price) + item.extras.reduce((sum, extra) => sum + Number(extra.price), 0)) * item.quantity : 0; return <div className="sales-edit-line" key={item.key}><select aria-label={`Produto ${index + 1}`} required value={item.productId} onChange={event => setItems(current => current.map((line, lineIndex) => lineIndex === index ? { ...line, productId: event.target.value, extras: [] } : line))}><option value="">Selecione produto</option>{products.map(option => <option key={option.id} value={option.id}>{option.name} · {money(option.price)}</option>)}</select><input aria-label={`Quantidade ${index + 1}`} type="number" min="1" step="1" required value={item.quantity} onChange={event => setItems(current => current.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: Math.max(1, Number(event.target.value)) } : line))}/><b>{money(lineTotal)}</b><button type="button" className="sales-remove-line" onClick={() => setItems(current => current.filter((_, lineIndex) => lineIndex !== index))} aria-label="Remover item"><X size={15}/></button></div>; })}</div><button type="button" className="secondary-action sales-add-line" onClick={() => setItems(current => [...current, { key: crypto.randomUUID(), productId: "", quantity: 1, extras: [] }])}><Plus size={15}/> Adicionar produto</button><div className="sales-payment-edit"><div className="payment-heading"><h3>Pagamentos</h3><button type="button" className="secondary-action" onClick={() => setPayments(current => [...current, { key: crypto.randomUUID(), method: "Pix", amount: 0 }])}><Plus size={14}/> Adicionar pagamento</button></div>{payments.map((payment, index) => <div className="sales-payment-row" key={payment.key}><select aria-label={`Pagamento ${index + 1}`} value={payment.method} onChange={event => setPayments(current => current.map((line, lineIndex) => lineIndex === index ? { ...line, method: event.target.value as PaymentMethod } : line))}>{methods.map(method => <option key={method}>{method}</option>)}</select><input aria-label={`Valor do pagamento ${index + 1}`} type="number" min="0" step="0.01" required value={payment.amount} onChange={event => setPayments(current => current.map((line, lineIndex) => lineIndex === index ? { ...line, amount: Number(event.target.value) } : line))}/><button type="button" className="sales-remove-line" onClick={() => setPayments(current => current.filter((_, lineIndex) => lineIndex !== index))} aria-label="Remover pagamento"><X size={15}/></button></div>)}</div>{payments.some(payment => payment.method === "Crediário") && <div className="credit-fields"><label>Cliente do crediário<input value={creditCustomer} onChange={event => setCreditCustomer(event.target.value)}/></label><label>Vencimento<input type="date" value={creditDueDate} onChange={event => setCreditDueDate(event.target.value)}/></label></div>}{payments.some(payment => payment.method === "Dinheiro") && <label className="change-field">Troco a devolver<input type="number" min="0" step="0.01" value={changeAmount} onChange={event => setChangeAmount(event.target.value)}/></label>}<div className="sales-edit-total"><span>Total atualizado</span><b>{money(editTotal)}</b></div>{error && <small className="discount-error" role="alert">{error}</small>}<div className="modal-actions"><button type="button" className="secondary-action" onClick={() => setEditing(null)} disabled={saving}>Voltar</button><button className="primary-button" disabled={saving || items.length === 0 || payments.length === 0}>{saving ? "Salvando…" : "Salvar alterações"}</button></div></form></div>}
  </div>;
}

export default SalesManagement;
