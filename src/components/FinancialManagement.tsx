import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, CalendarDays, Check, Clock3, CreditCard, Plus, RefreshCw, Search, Wallet, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import "./financial-management.css";

type FinancialTab = "overview" | "income" | "expenses";
type RangePreset = "today" | "yesterday" | "7days" | "month" | "custom";
type Payment = { id: string; method: string; amount: number };
type Receipt = { id: string; receipt_number: string; customer_name: string | null; created_by: string; created_at: string; status: "completed" | "cancelled"; total: number; change_amount: number; sale_payments: Payment[] };
type IndividualIncome = { id: string; description: string; category: string; amount: number; received_at: string; payment_method: string; notes: string | null; created_by: string };
type Expense = { id: string; description: string; category: string; supplier: string | null; amount: number; due_date: string; paid_at: string | null; payment_method: string | null; status: "pending" | "paid" | "cancelled"; notes: string | null; created_by: string; updated_by: string; created_at: string };
type ExpenseForm = { description: string; category: string; supplier: string; amount: string; due_date: string; notes: string };
type IncomeForm = { description: string; category: string; amount: string; received_at: string; payment_method: string; notes: string };
const categories = ["Fornecedores", "Mercadorias e insumos", "Aluguel", "Energia", "Água", "Internet", "Salários", "Marketing", "Manutenção", "Outras despesas"];
const incomeCategories = ["Vendas diversas", "Serviços", "Rendimentos", "Outras receitas"];
const methods = ["Dinheiro", "Pix", "Cartão de débito", "Cartão de crédito", "Transferência", "Boleto", "Outro"];
const money = (value: number) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const todayKey = () => dateKey(new Date());
const startMonth = () => `${todayKey().slice(0, 8)}01`;
const emptyForm = (): ExpenseForm => ({ description: "", category: categories[0], supplier: "", amount: "", due_date: todayKey(), notes: "" });
const emptyIncome = (): IncomeForm => ({ description: "", category: incomeCategories[0], amount: "", received_at: new Date().toISOString().slice(0, 16), payment_method: methods[0], notes: "" });
const dateLabel = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default function FinancialManagement({ active }: { active: boolean }) {
  const [tab, setTab] = useState<FinancialTab>("overview");
  const [preset, setPreset] = useState<RangePreset>("month");
  const [from, setFrom] = useState(startMonth);
  const [to, setTo] = useState(todayKey);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [individualIncomes, setIndividualIncomes] = useState<IndividualIncome[]>([]);
  const [openReceivableTotal, setOpenReceivableTotal] = useState(0);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [expenseStatus, setExpenseStatus] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState<ExpenseForm>(emptyForm());
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [incomeForm, setIncomeForm] = useState<IncomeForm>(emptyIncome());
  const [paying, setPaying] = useState<Expense | null>(null);
  const [payMethod, setPayMethod] = useState(methods[0]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    setError("");
    const fromDate = new Date(`${from}T00:00:00`).toISOString();
    const toExclusive = new Date(`${to}T00:00:00`);
    toExclusive.setDate(toExclusive.getDate() + 1);
    const [{ data: receiptData, error: receiptError }, { data: incomeData, error: incomeError }, { data: expenseData, error: expenseError }, { data: profileData, error: profileError }, { data: receivableData, error: receivableError }] = await Promise.all([
      supabase.from("sales").select("id,receipt_number,customer_name,created_by,created_at,status,total,change_amount,sale_payments(id,method,amount)").gte("created_at", fromDate).lt("created_at", toExclusive.toISOString()).order("created_at", { ascending: false }).limit(5000),
      supabase.from("individual_income").select("id,description,category,amount,received_at,payment_method,notes,created_by").gte("received_at", fromDate).lt("received_at", toExclusive.toISOString()).order("received_at", { ascending: false }).limit(5000),
      supabase.from("expenses").select("id,description,category,supplier,amount,due_date,paid_at,payment_method,status,notes,created_by,updated_by,created_at").order("due_date", { ascending: true }).limit(5000),
      supabase.from("profiles").select("id,display_name").eq("is_active", true),
      supabase.from("sale_payments").select("amount,sales!inner(status)").eq("method", "Crediário").eq("sales.status", "completed").limit(5000),
    ]);
    if (receiptError || incomeError || expenseError || profileError || receivableError) setError("Não foi possível carregar todos os dados financeiros. Tente atualizar.");
    setReceipts((receiptData ?? []) as unknown as Receipt[]);
    setIndividualIncomes((incomeData ?? []) as IndividualIncome[]);
    setOpenReceivableTotal((receivableData ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0));
    setExpenses((expenseData ?? []) as Expense[]);
    setProfiles(new Map((profileData ?? []).map(profile => [profile.id, profile.display_name])));
    setLoading(false);
  }, [active, from, to]);

  useEffect(() => { void load(); }, [load]);

  const completedSales = useMemo(() => receipts.filter(sale => sale.status === "completed"), [receipts]);
  const grossSales = useMemo(() => completedSales.reduce((sum, sale) => sum + Number(sale.total), 0), [completedSales]);
  const received = useMemo(() => completedSales.reduce((sum, sale) => {
    const cashPayments = sale.sale_payments.filter(payment => payment.method === "Dinheiro");
    const otherPayments = sale.sale_payments.filter(payment => payment.method !== "Dinheiro" && payment.method !== "Crediário");
    return sum + otherPayments.reduce((total, payment) => total + Number(payment.amount), 0) + Math.max(0, cashPayments.reduce((total, payment) => total + Number(payment.amount), 0) - Number(sale.change_amount));
  }, 0) + individualIncomes.reduce((sum, income) => sum + Number(income.amount), 0), [completedSales, individualIncomes]);
  const periodExpenses = useMemo(() => expenses.filter(expense => expense.status === "paid" && expense.paid_at && dateKey(new Date(expense.paid_at)) >= from && dateKey(new Date(expense.paid_at)) <= to), [expenses, from, to]);
  const paidOut = useMemo(() => periodExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0), [periodExpenses]);
  const openPayables = useMemo(() => expenses.filter(expense => expense.status === "pending").reduce((sum, expense) => sum + Number(expense.amount), 0), [expenses]);
  const openReceivables = openReceivableTotal;
  const chartDays = useMemo(() => {
    const start = new Date(`${from}T12:00:00`);
    const finish = new Date(`${to}T12:00:00`);
    const days: { key: string; income: number; expense: number }[] = [];
    for (const cursor = new Date(start); cursor <= finish; cursor.setDate(cursor.getDate() + 1)) {
      const key = dateKey(cursor);
      const dayIncome = completedSales.reduce((sum, sale) => {
        if (dateKey(new Date(sale.created_at)) !== key) return sum;
        const cash = sale.sale_payments.filter(payment => payment.method === "Dinheiro").reduce((value, payment) => value + Number(payment.amount), 0);
        const others = sale.sale_payments.filter(payment => payment.method !== "Dinheiro" && payment.method !== "Crediário").reduce((value, payment) => value + Number(payment.amount), 0);
        return sum + others + Math.max(0, cash - Number(sale.change_amount));
      }, 0) + individualIncomes.filter(income => dateKey(new Date(income.received_at)) === key).reduce((sum, income) => sum + Number(income.amount), 0);
      const dayExpense = periodExpenses.filter(expense => dateKey(new Date(expense.paid_at!)) === key).reduce((sum, expense) => sum + Number(expense.amount), 0);
      days.push({ key, income: dayIncome, expense: dayExpense });
    }
    return days;
  }, [from, to, completedSales, individualIncomes, periodExpenses]);
  const filteredReceipts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return receipts.filter(sale => !term || `${sale.receipt_number} ${sale.customer_name ?? ""} ${profiles.get(sale.created_by) ?? ""} ${sale.sale_payments.map(payment => payment.method).join(" ")}`.toLocaleLowerCase("pt-BR").includes(term));
  }, [receipts, search, profiles]);
  const filteredIndividualIncomes = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return individualIncomes.filter(income => !term || `${income.description} ${income.category} ${income.payment_method} ${profiles.get(income.created_by) ?? ""}`.toLocaleLowerCase("pt-BR").includes(term));
  }, [individualIncomes, search, profiles]);
  const filteredExpenses = useMemo(() => expenses.filter(expense => (expenseStatus === "all" || expense.status === expenseStatus) && (!search.trim() || `${expense.description} ${expense.category} ${expense.supplier ?? ""}`.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")))), [expenses, expenseStatus, search]);

  if (!active) return null;

  const setRange = (value: RangePreset) => {
    setPreset(value);
    const today = new Date();
    const end = dateKey(today);
    const start = new Date(today);
    if (value === "today") { setFrom(end); setTo(end); }
    if (value === "yesterday") { start.setDate(start.getDate() - 1); setFrom(dateKey(start)); setTo(dateKey(start)); }
    if (value === "7days") { start.setDate(start.getDate() - 6); setFrom(dateKey(start)); setTo(end); }
    if (value === "month") { setFrom(`${end.slice(0, 8)}01`); setTo(end); }
  };
  const openExpenseForm = (expense?: Expense) => {
    setEditing(expense ?? null);
    setForm(expense ? { description: expense.description, category: expense.category, supplier: expense.supplier ?? "", amount: String(expense.amount), due_date: expense.due_date, notes: expense.notes ?? "" } : emptyForm());
    setFormOpen(true);
    setError("");
  };
  const saveIndividualIncome = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(incomeForm.amount);
    if (!incomeForm.description.trim() || !Number.isFinite(amount) || amount <= 0) return;
    setSaving(true);
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Sessão não encontrada."); setSaving(false); return; }
    const receivedAt = new Date(incomeForm.received_at).toISOString();
    const { error: insertError } = await supabase.from("individual_income").insert({ description: incomeForm.description.trim(), category: incomeForm.category, amount, received_at: receivedAt, payment_method: incomeForm.payment_method, notes: incomeForm.notes.trim() || null, created_by: user.id });
    setSaving(false);
    if (insertError) { setError("Não foi possível registrar a receita individual."); return; }
    setIncomeOpen(false);
    setIncomeForm(emptyIncome());
    await load();
  };
  const saveExpense = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!form.description.trim() || !Number.isFinite(amount) || amount <= 0 || !form.due_date) return;
    setSaving(true);
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Sessão não encontrada."); setSaving(false); return; }
    const values = { description: form.description.trim(), category: form.category, supplier: form.supplier.trim() || null, amount, due_date: form.due_date, notes: form.notes.trim() || null, updated_by: user.id, updated_at: new Date().toISOString() };
    const result = editing
      ? await supabase.from("expenses").update(values).eq("id", editing.id).eq("status", "pending").select("id").maybeSingle()
      : await supabase.from("expenses").insert({ ...values, created_by: user.id, status: "pending" });
    setSaving(false);
    if (result.error || (editing && !result.data)) { setError("Não foi possível salvar. Apenas despesas pendentes podem ser editadas."); return; }
    setFormOpen(false);
    setEditing(null);
    await load();
  };
  const confirmPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!paying) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Sessão não encontrada."); setSaving(false); return; }
    const paidAt = new Date().toISOString();
    const { data, error: payError } = await supabase.from("expenses").update({ status: "paid", paid_at: paidAt, payment_method: payMethod, updated_by: user.id, updated_at: paidAt }).eq("id", paying.id).eq("status", "pending").select("id").maybeSingle();
    setSaving(false);
    if (payError || !data) { setError("Não foi possível registrar o pagamento. Atualize e verifique o status."); return; }
    setPaying(null);
    await load();
  };
  const cancelExpense = async (expense: Expense) => {
    if (expense.status !== "pending" || !window.confirm(`Cancelar a despesa “${expense.description}”?`)) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const updatedAt = new Date().toISOString();
    const { data, error: cancelError } = await supabase.from("expenses").update({ status: "cancelled", updated_by: user.id, updated_at: updatedAt }).eq("id", expense.id).eq("status", "pending").select("id").maybeSingle();
    if (cancelError || !data) setError("Não foi possível cancelar a despesa.");
    else await load();
  };
  const removeExpense = async (expense: Expense) => cancelExpense(expense);

  const maximum = Math.max(...chartDays.flatMap(day => [day.income, day.expense]), 1);

  return <div className="finance-screen"><section className="finance-workspace">
    <header className="finance-heading"><div><span className="finance-kicker">GESTÃO FINANCEIRA</span><h2>Financeiro</h2><p>Entradas e saídas reais do seu negócio.</p></div><button className="finance-refresh" onClick={() => void load()} disabled={loading} aria-label="Atualizar financeiro"><RefreshCw size={16}/></button></header>
    <div className="finance-tabs" role="tablist" aria-label="Financeiro"><button role="tab" aria-selected={tab === "overview"} className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Visão geral</button><button role="tab" aria-selected={tab === "income"} className={tab === "income" ? "active" : ""} onClick={() => setTab("income")}>Receitas</button><button role="tab" aria-selected={tab === "expenses"} className={tab === "expenses" ? "active" : ""} onClick={() => setTab("expenses")}>Despesas</button></div>
    <div className="finance-filters"><div><CalendarDays size={16}/><b>Período</b></div><select aria-label="Período do financeiro" value={preset} onChange={event => setRange(event.target.value as RangePreset)}><option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="7days">Últimos 7 dias</option><option value="month">Este mês</option><option value="custom">Personalizado</option></select><label>De<input type="date" value={from} max={to} onChange={event => { setPreset("custom"); setFrom(event.target.value); }}/></label><label>Até<input type="date" value={to} min={from} onChange={event => { setPreset("custom"); setTo(event.target.value); }}/></label></div>
    {error && <div className="finance-error" role="alert">{error}</div>}
    {loading ? <div className="finance-empty">Carregando dados financeiros…</div> : <>
      {tab === "overview" && <>
        <div className="finance-kpi-grid"><article><span><Banknote size={15}/> Receitas recebidas</span><b>{money(received)}</b><small>Recebimentos válidos no período</small></article><article><span><Wallet size={15}/> Despesas pagas</span><b>{money(paidOut)}</b><small>Pagamentos efetuados no período</small></article><article className={received - paidOut >= 0 ? "finance-net-positive" : "finance-net-negative"}><span><CreditCard size={15}/> Resultado de caixa</span><b>{money(received - paidOut)}</b><small>Entradas menos saídas; não representa lucro líquido</small></article><article><span><Clock3 size={15}/> Contas a pagar</span><b>{money(openPayables)}</b><small>Despesas pendentes</small></article><article><span><Clock3 size={15}/> Contas a receber</span><b>{money(openReceivables)}</b><small>Crediário ainda não recebido</small></article><article><span><Check size={15}/> Vendas concluídas</span><b>{completedSales.length}</b><small>No período selecionado</small></article></div>
        <section className="finance-chart-card"><header><div><h3>Entradas e saídas</h3><p>Recebimentos de vendas e despesas pagas por dia.</p></div><div className="finance-chart-legend"><span><i className="income-dot"/> Entradas</span><span><i className="expense-dot"/> Saídas</span></div></header><div className="finance-chart-scroll"><div className="finance-bars">{chartDays.map(day => <div className="finance-bar-day" key={day.key} title={`${day.key} · Entradas ${money(day.income)} · Saídas ${money(day.expense)}`}><div className="finance-bar-pair"><i className="finance-income-bar" style={{ height: `${Math.max(day.income / maximum * 100, day.income ? 4 : 0)}%` }}/><i className="finance-expense-bar" style={{ height: `${Math.max(day.expense / maximum * 100, day.expense ? 4 : 0)}%` }}/></div><small>{new Date(`${day.key}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</small></div>)}</div></div>{chartDays.length === 0 && <div className="finance-empty">Sem movimentações no período.</div>}</section>
        <div className="finance-turnover" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 14, padding: "12px 14px", border: "1px solid #eee8f1", borderRadius: 11, background: "#fcfafc" }}><span style={{ color: "#716779", fontSize: 11, fontWeight: 650 }}>Faturamento de vendas concluídas no período</span><b style={{ color: "#4b235e", font: "750 16px Manrope, sans-serif" }}>{money(grossSales)}</b><small style={{ marginLeft: "auto", color: "#817985", fontSize: 10 }}>Faturamento não equivale a recebimentos nem a lucro líquido.</small></div><div className="finance-note">Receitas recebidas mostram valores pagos, sem crediário pendente e sem contar troco como entrada.</div>
      </>}
      {tab === "income" && <section className="finance-list-card"><header><div><h3>Receitas de vendas e individuais</h3><p>Pagamentos de vendas concluídas e receitas individuais cadastradas manualmente.</p></div><button className="finance-primary" onClick={() => { setIncomeForm(emptyIncome()); setIncomeOpen(true); setError(""); }}><Plus size={16}/> Adicionar receita</button></header><div className="finance-list-tools"><label className="finance-search"><Search size={15}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Venda, descrição, cliente ou forma"/></label></div><div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Data e hora</th><th>Origem / descrição</th><th>Cliente / categoria</th><th>Forma</th><th>Valor recebido</th><th>Operador</th><th>Status</th></tr></thead><tbody>{filteredReceipts.flatMap(sale => {
        if (sale.status === "cancelled") return [<tr key={sale.id}><td>{dateLabel(sale.created_at)}</td><td>Venda #{sale.receipt_number}</td><td>{sale.customer_name ?? "Cliente avulso"}</td><td>—</td><td className="finance-amount">{money(0)}</td><td>{profiles.get(sale.created_by) ?? "—"}</td><td><span className="finance-status cancelled">Cancelada · não contabilizada</span></td></tr>];
        const cash = sale.sale_payments.filter(payment => payment.method === "Dinheiro");
        const cashTotal = cash.reduce((sum, payment) => sum + Number(payment.amount), 0);
        let remainingChange = Number(sale.change_amount);
        const validPayments = sale.sale_payments.filter(payment => payment.method !== "Crediário").map(payment => {
          let amount = Number(payment.amount);
          if (payment.method === "Dinheiro" && cashTotal > 0) { const deduction = Math.min(amount, remainingChange); amount -= deduction; remainingChange -= deduction; }
          return { ...payment, receivedAmount: amount };
        }).filter(payment => payment.receivedAmount > 0);
        return validPayments.map((payment, index) => <tr key={`${sale.id}-${payment.id}`}><td>{index === 0 ? dateLabel(sale.created_at) : ""}</td><td>{index === 0 ? `Venda #${sale.receipt_number}` : ""}</td><td>{index === 0 ? sale.customer_name ?? "Cliente avulso" : ""}</td><td>{payment.method}</td><td className="finance-amount">{money(payment.receivedAmount)}</td><td>{index === 0 ? profiles.get(sale.created_by) ?? "—" : ""}</td><td><span className="finance-status paid">Recebida</span></td></tr>);
      })}{filteredIndividualIncomes.map(income => <tr key={`individual-${income.id}`}><td>{dateLabel(income.received_at)}</td><td><b>{income.description}</b><small className="finance-subtext">Receita individual</small></td><td>{income.category}</td><td>{income.payment_method}</td><td className="finance-amount">{money(Number(income.amount))}</td><td>{profiles.get(income.created_by) ?? "—"}</td><td><span className="finance-status paid">Recebida</span></td></tr>)}</tbody></table>{filteredReceipts.length === 0 && filteredIndividualIncomes.length === 0 && <div className="finance-empty">Nenhum recebimento encontrado no período.</div>}</div></section>}
      {tab === "expenses" && <section className="finance-list-card"><header><div><h3>Despesas</h3><p>Contas a pagar e despesas quitadas.</p></div><button className="finance-primary" onClick={() => openExpenseForm()}><Plus size={16}/> Nova despesa</button></header><div className="finance-list-tools"><label className="finance-search"><Search size={15}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar descrição, categoria ou fornecedor"/></label><select value={expenseStatus} onChange={event => setExpenseStatus(event.target.value)} aria-label="Filtrar status"><option value="all">Todos os status</option><option value="pending">Pendentes</option><option value="paid">Pagas</option><option value="cancelled">Canceladas</option></select></div><div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Descrição</th><th>Categoria / fornecedor</th><th>Vencimento</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead><tbody>{filteredExpenses.map(expense => <tr key={expense.id}><td><b>{expense.description}</b><small className="finance-subtext">{expense.notes || `Responsável: ${profiles.get(expense.created_by) ?? "—"}`}</small></td><td>{expense.category}<small className="finance-subtext">{expense.supplier || "—"}</small></td><td>{new Date(`${expense.due_date}T12:00:00`).toLocaleDateString("pt-BR")}{expense.paid_at && <small className="finance-subtext">Pago: {dateLabel(expense.paid_at)}</small>}</td><td className="finance-amount">{money(Number(expense.amount))}</td><td><span className={`finance-status ${expense.status}`}>{expense.status === "pending" ? "Pendente" : expense.status === "paid" ? `Paga · ${expense.payment_method}` : "Cancelada"}</span></td><td><div className="finance-expense-actions">{expense.status === "pending" && <><button onClick={() => openExpenseForm(expense)}>Editar</button><button className="finance-pay-action" onClick={() => { setPaying(expense); setPayMethod(methods[0]); }}>Pagar</button><button className="finance-cancel-action" onClick={() => void removeExpense(expense)} aria-label={`Cancelar ${expense.description}`}>Cancelar</button></>}</div></td></tr>)}</tbody></table>{filteredExpenses.length === 0 && <div className="finance-empty">Nenhuma despesa encontrada.</div>}</div></section>}
    </>}
    {incomeOpen && <div className="finance-modal-backdrop"><form className="finance-modal" onSubmit={saveIndividualIncome}><button type="button" className="finance-modal-close" onClick={() => setIncomeOpen(false)} aria-label="Fechar"><X size={18}/></button><span className="finance-kicker">ENTRADA AVULSA</span><h3>Adicionar receita individual</h3><label>Descrição<input required maxLength={180} value={incomeForm.description} onChange={event => setIncomeForm(current => ({ ...current, description: event.target.value }))} placeholder="Ex.: Serviço, rendimento, venda avulsa"/></label><div className="finance-form-grid"><label>Categoria<select value={incomeForm.category} onChange={event => setIncomeForm(current => ({ ...current, category: event.target.value }))}>{incomeCategories.map(category => <option key={category}>{category}</option>)}</select></label><label>Valor recebido (R$)<input required type="number" min="0.01" step="0.01" value={incomeForm.amount} onChange={event => setIncomeForm(current => ({ ...current, amount: event.target.value }))} placeholder="0,00"/></label><label>Data de recebimento<input required type="datetime-local" value={incomeForm.received_at} onChange={event => setIncomeForm(current => ({ ...current, received_at: event.target.value }))}/></label><label>Forma de recebimento<select value={incomeForm.payment_method} onChange={event => setIncomeForm(current => ({ ...current, payment_method: event.target.value }))}>{methods.map(method => <option key={method}>{method}</option>)}</select></label></div><label>Observações<textarea rows={3} maxLength={1000} value={incomeForm.notes} onChange={event => setIncomeForm(current => ({ ...current, notes: event.target.value }))}/></label>{error && <p className="finance-error">{error}</p>}<footer><button type="button" className="finance-secondary" onClick={() => setIncomeOpen(false)}>Cancelar</button><button className="finance-primary" disabled={saving}><Check size={15}/>{saving ? "Salvando…" : "Salvar receita"}</button></footer></form></div>}
    {formOpen && <div className="finance-modal-backdrop"><form className="finance-modal" onSubmit={saveExpense}><button type="button" className="finance-modal-close" onClick={() => setFormOpen(false)} aria-label="Fechar"><X size={18}/></button><span className="finance-kicker">CONTAS A PAGAR</span><h3>{editing ? "Editar despesa" : "Cadastrar despesa"}</h3><label>Descrição<input required maxLength={180} value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} placeholder="Ex.: Conta de energia"/></label><div className="finance-form-grid"><label>Categoria<select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))}>{categories.map(category => <option key={category}>{category}</option>)}</select></label><label>Valor (R$)<input required type="number" min="0.01" step="0.01" value={form.amount} onChange={event => setForm(current => ({ ...current, amount: event.target.value }))} placeholder="0,00"/></label><label>Vencimento<input required type="date" value={form.due_date} onChange={event => setForm(current => ({ ...current, due_date: event.target.value }))}/></label><label>Fornecedor (opcional)<input maxLength={160} value={form.supplier} onChange={event => setForm(current => ({ ...current, supplier: event.target.value }))}/></label></div><label>Observações<textarea rows={3} maxLength={1000} value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))}/></label>{error && <p className="finance-error">{error}</p>}<footer><button type="button" className="finance-secondary" onClick={() => setFormOpen(false)}>Cancelar</button><button className="finance-primary" disabled={saving}><Check size={15}/>{saving ? "Salvando…" : "Salvar despesa"}</button></footer></form></div>}
    {paying && <div className="finance-modal-backdrop"><form className="finance-modal finance-pay-modal" onSubmit={confirmPayment}><button type="button" className="finance-modal-close" onClick={() => setPaying(null)} aria-label="Fechar"><X size={18}/></button><span className="finance-kicker">REGISTRO DE PAGAMENTO</span><h3>{paying.description}</h3><p>Valor a pagar <b>{money(Number(paying.amount))}</b></p><label>Forma de pagamento<select value={payMethod} onChange={event => setPayMethod(event.target.value)}>{methods.map(method => <option key={method}>{method}</option>)}</select></label>{error && <p className="finance-error">{error}</p>}<footer><button type="button" className="finance-secondary" onClick={() => setPaying(null)}>Cancelar</button><button className="finance-primary" disabled={saving}><Check size={15}/>{saving ? "Registrando…" : "Confirmar pagamento"}</button></footer></form></div>}
  </section></div>;
}
