import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banknote, ClipboardCheck, Clock3, DoorOpen, History, MinusCircle, PlusCircle, Printer, RefreshCw, Wallet } from "lucide-react";
import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import "./cash-management.css";

type Role = "admin" | "operator";
type Register = { id: string; name: string; is_active: boolean; is_open: boolean };
type Session = { id: string; register_id: string; opened_by: string; closed_by: string | null; status: "open" | "closed"; opening_amount: number; closing_amount: number | null; opened_at: string; closed_at: string | null; opening_note: string | null; shift_name: string; closing_note: string | null; expected_cash: number | null; cash_difference: number | null; non_cash_count: Record<string, number>; cash_registers?: { name: string } | null; profiles?: { display_name: string } | null };
type Movement = { id: string; movement_type: string; amount: number; note: string | null; created_at: string; created_by: string };
type Summary = { session: Session; payment_totals: Record<string, number>; cash_sales: number; supplies: number; withdrawals: number; refunds: number; expected_cash: number };
const methods = ["Pix", "Cartão de débito", "Cartão de crédito", "Vale alimentação"];
const money = (value: number) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const when = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export default function CashManagement({ active, role, onSessionChange }: { active: boolean; role: Role; onSessionChange: (session: { id: string; register_id: string } | null) => void }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [registers, setRegisters] = useState<Register[]>([]);
  const [userId, setUserId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [registerId, setRegisterId] = useState("");
  const [openingAmount, setOpeningAmount] = useState("0");
  const [openingNote, setOpeningNote] = useState("");
  const [shiftName, setShiftName] = useState("Turno principal");
  const [movementType, setMovementType] = useState<"supply" | "withdrawal">("supply");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementNote, setMovementNote] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [nonCashCount, setNonCashCount] = useState<Record<string, string>>({});
  const [closingNote, setClosingNote] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [operatorFilter, setOperatorFilter] = useState("");
  const [registerFilter, setRegisterFilter] = useState("");
  const onSessionChangeRef = useRef(onSessionChange);
  useEffect(() => { onSessionChangeRef.current = onSessionChange; }, [onSessionChange]);

  const load = useCallback(async (preferredId?: string) => {
    if (!active) return;
    setLoading(true);
    setError("");
    const [{ data: authData }, { data: registerData, error: registerError }, { data: sessionData, error: sessionError }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.rpc("list_cash_registers"),
      supabase.from("cash_sessions").select("id,register_id,opened_by,closed_by,status,opening_amount,closing_amount,opened_at,closed_at,opening_note,shift_name,closing_note,expected_cash,cash_difference,non_cash_count,cash_registers(name),profiles!cash_sessions_opened_by_fkey(display_name)").order("opened_at", { ascending: false }).limit(300),
    ]);
    if (registerError || sessionError) setError("Não foi possível carregar as sessões e caixas.");
    const currentUser = authData.user?.id ?? "";
    setUserId(currentUser);
    const loadedSessions = (sessionData ?? []) as unknown as Session[];
    setSessions(loadedSessions);
    setRegisters((registerData ?? []) as Register[]);
    const openOwned = loadedSessions.find(session => session.status === "open" && session.opened_by === currentUser);
    const nextId = preferredId ?? openOwned?.id ?? (role === "admin" ? loadedSessions.find(session => session.status === "open")?.id : undefined) ?? "";
    setSelectedId(nextId);
    const current = loadedSessions.find(session => session.id === nextId);
    if (current?.status === "open") onSessionChangeRef.current({ id: current.id, register_id: current.register_id });
    else if (openOwned) onSessionChangeRef.current({ id: openOwned.id, register_id: openOwned.register_id });
    else onSessionChangeRef.current(null);
    setLoading(false);
  }, [active, role]);

  useEffect(() => { void load(); }, [load]);

  const selectedSession = useMemo(() => sessions.find(session => session.id === selectedId) ?? null, [sessions, selectedId]);
  const loadDetails = useCallback(async (sessionId: string) => {
    const [{ data: summaryData, error: summaryError }, { data: movementData, error: movementError }] = await Promise.all([
      supabase.rpc("cash_session_summary", { p_session_id: sessionId }),
      supabase.from("cash_movements").select("id,movement_type,amount,note,created_at,created_by").eq("cash_session_id", sessionId).order("created_at", { ascending: false }),
    ]);
    if (summaryError || movementError) { setError("Não foi possível carregar os detalhes do caixa."); return; }
    const details = summaryData as Summary;
    setSummary(details);
    setMovements((movementData ?? []) as Movement[]);
    setCountedCash(String(details.expected_cash ?? 0));
    setNonCashCount(Object.fromEntries(methods.map(method => [method, String(details.payment_totals?.[method] ?? 0)])));
    setClosingNote("");
  }, []);

  useEffect(() => {
    if (active && selectedSession?.status === "open") void loadDetails(selectedSession.id);
    else { setSummary(null); setMovements([]); }
  }, [active, selectedSession?.id, selectedSession?.status, loadDetails]);

  const openSession = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setError(""); setSuccess("");
    const { data, error: requestError } = await supabase.rpc("open_cash_session", { p_register_id: registerId, p_opening_amount: Number(openingAmount), p_opening_note: openingNote.trim() || null, p_shift_name: shiftName.trim() });
    setSaving(false);
    if (requestError || !data) { setError(requestError?.message || "Não foi possível abrir o caixa."); return; }
    const opened = data as Session;
    setSuccess("Caixa aberto com sucesso.");
    setRegisterId(""); setOpeningAmount("0"); setOpeningNote("");
    await load(opened.id);
    onSessionChange({ id: opened.id, register_id: opened.register_id });
  };

  const saveMovement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedSession) return;
    setSaving(true); setError(""); setSuccess("");
    const { error: requestError } = await supabase.rpc("record_cash_movement", { p_session_id: selectedSession.id, p_movement_type: movementType, p_amount: Number(movementAmount), p_note: movementNote.trim(), p_idempotency_key: crypto.randomUUID() });
    setSaving(false);
    if (requestError) { setError(requestError.message || "Não foi possível registrar a movimentação."); return; }
    setMovementAmount(""); setMovementNote(""); setSuccess(movementType === "supply" ? "Suprimento registrado." : "Sangria registrada.");
    await loadDetails(selectedSession.id); await load(selectedSession.id);
  };

  const closeSession = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedSession || !window.confirm("Confirma o fechamento desta sessão? Depois do fechamento, não será possível registrar novas movimentações.")) return;
    setSaving(true); setError(""); setSuccess("");
    const { error: requestError } = await supabase.rpc("close_cash_session", { p_session_id: selectedSession.id, p_counted_cash: Number(countedCash), p_non_cash_count: Object.fromEntries(methods.map(method => [method, Number(nonCashCount[method] || 0)])), p_note: closingNote.trim() || null });
    setSaving(false);
    if (requestError) { setError(requestError.message || "Não foi possível fechar o caixa."); return; }
    setSuccess("Caixa fechado e conferência registrada.");
    onSessionChange(null);
    await load(selectedSession.id);
  };

  const filteredSessions = useMemo(() => sessions.filter(session => {
    const day = session.opened_at.slice(0, 10);
    return (!fromDate || day >= fromDate) && (!toDate || day <= toDate) && (!operatorFilter || session.opened_by === operatorFilter) && (!registerFilter || session.register_id === registerFilter);
  }), [sessions, fromDate, toDate, operatorFilter, registerFilter]);
  const operators = useMemo(() => [...new Map(sessions.map(session => [session.opened_by, session.profiles?.display_name || session.opened_by])).entries()], [sessions]);

  const printCloseout = (session: Session) => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const currentSummary = summary?.session.id === session.id ? summary : null;
    const rows = ["RELATÓRIO DE FECHAMENTO DE CAIXA", `Terminal: ${session.cash_registers?.name ?? "Caixa"}`, `Turno: ${session.shift_name}`, `Operador: ${session.profiles?.display_name ?? session.opened_by}`, `Abertura: ${when(session.opened_at)}`, `Fechamento: ${when(session.closed_at)}`, `Saldo inicial: ${money(Number(session.opening_amount))}`, `Dinheiro esperado: ${money(Number(session.expected_cash ?? currentSummary?.expected_cash ?? 0))}`, `Dinheiro contado: ${money(Number(session.closing_amount ?? 0))}`, `Diferença: ${money(Number(session.cash_difference ?? 0))}`, `Justificativa: ${session.closing_note || "—"}`, "", "Totais por forma de pagamento:", ...methods.map(method => `${method}: ${money(Number(session.non_cash_count?.[method] ?? currentSummary?.payment_totals?.[method] ?? 0))}`), `Dinheiro recebido líquido: ${money(Number(currentSummary?.cash_sales ?? 0))}`, `Suprimentos: ${money(Number(currentSummary?.supplies ?? 0))}`, `Sangrias: ${money(Number(currentSummary?.withdrawals ?? 0))}`];
    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text(rows[0], 18, 20);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.text(rows.slice(1), 18, 31, { lineHeightFactor: 1.55 });
    doc.save(`fechamento-caixa-${session.cash_registers?.name ?? session.id}.pdf`);
  };

  if (!active) return null;
  const availableRegisters = registers.filter(register => register.is_active && !register.is_open);
  const expectedNonCash = summary?.payment_totals ?? {};
  const display = (movement: Movement) => movement.movement_type === "supply" ? "Suprimento" : movement.movement_type === "withdrawal" ? "Sangria" : movement.movement_type === "sale" ? "Venda" : movement.movement_type === "refund" ? "Estorno" : movement.movement_type === "closing" ? "Fechamento" : movement.movement_type === "opening" ? "Abertura" : movement.movement_type;

  return <div className="cash-screen"><section className="cash-workspace">
    <header className="cash-heading"><div><span className="cash-kicker">CONTROLE DE TURNO</span><h2>Caixa</h2><p>Abertura, movimentações, conferência e histórico por terminal.</p></div><button className="cash-refresh" onClick={() => void load(selectedId)} disabled={loading}><RefreshCw size={16}/> Atualizar</button></header>
    {error && <div className="cash-message cash-error" role="alert">{error}</div>}{success && <div className="cash-message cash-success" role="status">{success}</div>}
    {loading ? <div className="cash-empty">Carregando sessões…</div> : <>
      <div className="cash-session-picker"><label>Sessão selecionada<select value={selectedId} onChange={event => setSelectedId(event.target.value)}><option value="">Selecione uma sessão</option>{sessions.map(session => <option key={session.id} value={session.id}>{session.cash_registers?.name ?? "Caixa"} · {session.shift_name} · {session.status === "open" ? "Aberto" : "Fechado"} · {when(session.opened_at)}</option>)}</select></label>{selectedSession && <span className={`cash-status ${selectedSession.status}`}>{selectedSession.status === "open" ? "Aberto" : "Fechado"}</span>}</div>
      {!selectedSession && <form className="cash-card cash-open-form" onSubmit={openSession}><div className="cash-card-title"><span className="cash-icon"><DoorOpen size={18}/></span><div><h3>Abertura de caixa</h3><p>Informe o terminal, o valor inicial e o turno.</p></div></div><div className="cash-form-grid"><label>Caixa físico<select required value={registerId} onChange={event => setRegisterId(event.target.value)}><option value="">Selecione um caixa disponível</option>{availableRegisters.map(register => <option key={register.id} value={register.id}>{register.name}</option>)}</select></label><label>Turno<input required maxLength={80} value={shiftName} onChange={event => setShiftName(event.target.value)}/></label><label>Saldo inicial em dinheiro<input required type="number" min="0" step="0.01" value={openingAmount} onChange={event => setOpeningAmount(event.target.value)}/></label><label className="cash-wide">Observações<textarea maxLength={500} value={openingNote} onChange={event => setOpeningNote(event.target.value)} placeholder="Observação da abertura (opcional)"/></label></div>{availableRegisters.length === 0 && <p className="cash-hint">Não há caixa físico disponível no momento; cada caixa pode ter somente uma sessão aberta.</p>}<button className="cash-primary" disabled={saving || !registerId}><DoorOpen size={16}/>{saving ? "Abrindo…" : "Abrir caixa"}</button></form>}
      {selectedSession && summary && <>
        <div className="cash-session-banner"><div><span className="cash-status open">CAIXA ABERTO</span><h3>{selectedSession.cash_registers?.name ?? "Caixa"} · {selectedSession.shift_name}</h3><p>Aberto por {selectedSession.profiles?.display_name ?? "Operador"} em {when(selectedSession.opened_at)}</p></div><div><small>Saldo inicial</small><b>{money(Number(selectedSession.opening_amount))}</b></div></div>
        <div className="cash-kpis"><article><span>Dinheiro esperado</span><b>{money(summary.expected_cash)}</b><small>Inicial + vendas + suprimentos − sangrias</small></article><article><span>Dinheiro recebido líquido</span><b>{money(summary.cash_sales)}</b><small>Após o troco devolvido</small></article><article><span>Suprimentos</span><b>{money(summary.supplies)}</b><small>Entradas adicionais</small></article><article><span>Sangrias</span><b>{money(summary.withdrawals)}</b><small>Retiradas registradas</small></article></div>
        <section className="cash-card"><div className="cash-card-title"><span className="cash-icon"><Banknote size={18}/></span><div><h3>Recebimentos por forma</h3><p>Vendas confirmadas; crediário pendente não entra como recebimento.</p></div></div><div className="cash-method-grid"><div><span>Dinheiro</span><b>{money(summary.cash_sales)}</b></div>{Object.entries(summary.payment_totals).filter(([method]) => method !== "Dinheiro").map(([method, amount]) => <div key={method}><span>{method}</span><b>{money(Number(amount))}</b></div>)}</div></section>
        {selectedSession.status === "open" && <div className="cash-work-grid"><form className="cash-card" onSubmit={saveMovement}><div className="cash-card-title"><span className="cash-icon"><PlusCircle size={18}/></span><div><h3>Suprimento ou sangria</h3><p>Movimentação em dinheiro, registrada com operador e horário.</p></div></div><label>Tipo<select value={movementType} onChange={event => setMovementType(event.target.value as "supply" | "withdrawal")}><option value="supply">Suprimento · entrada</option><option value="withdrawal">Sangria · retirada</option></select></label><label>Valor<input required type="number" min="0.01" step="0.01" value={movementAmount} onChange={event => setMovementAmount(event.target.value)}/></label><label>Motivo<textarea required minLength={3} maxLength={500} value={movementNote} onChange={event => setMovementNote(event.target.value)} placeholder="Informe o motivo"/></label><button className="cash-primary" disabled={saving}><PlusCircle size={16}/>{saving ? "Registrando…" : "Registrar movimentação"}</button></form>
          <form className="cash-card cash-close-form" onSubmit={closeSession}><div className="cash-card-title"><span className="cash-icon"><ClipboardCheck size={18}/></span><div><h3>Fechamento e conferência</h3><p>Conte o dinheiro físico e confira os meios não monetários separadamente.</p></div></div><label>Dinheiro contado<input required type="number" min="0" step="0.01" value={countedCash} onChange={event => setCountedCash(event.target.value)}/></label><div className="cash-count-methods">{methods.map(method => <label key={method}>{method}<input type="number" min="0" step="0.01" value={nonCashCount[method] ?? "0"} onChange={event => setNonCashCount(current => ({ ...current, [method]: event.target.value }))}/><small>Esperado: {money(Number(expectedNonCash[method] ?? 0))}</small></label>)}</div><div className="cash-difference-preview"><span>Diferença de dinheiro</span><b>{money((Number(countedCash) || 0) - summary.expected_cash)}</b></div><label>Justificativa de diferenças<textarea maxLength={1000} value={closingNote} onChange={event => setClosingNote(event.target.value)} placeholder="Obrigatória quando houver divergência"/></label><button className="cash-danger" disabled={saving}><ClipboardCheck size={16}/>{saving ? "Fechando…" : "Conferir e fechar caixa"}</button></form></div>}
        <section className="cash-card"><div className="cash-card-title"><span className="cash-icon"><History size={18}/></span><div><h3>Movimentações da sessão</h3><p>Registros históricos do turno; nenhuma linha é apagada.</p></div></div>{movements.length ? <div className="cash-movement-list">{movements.map(movement => <div key={movement.id}><span>{display(movement)}<small>{movement.note || "—"}</small></span><b className={movement.movement_type === "withdrawal" || movement.movement_type === "refund" ? "negative" : ""}>{movement.movement_type === "withdrawal" || movement.movement_type === "refund" ? "− " : "+ "}{money(Number(movement.amount))}</b><time>{when(movement.created_at)}</time></div>)}</div> : <div className="cash-empty">Nenhuma movimentação registrada.</div>}</section>
      </>}
      {selectedSession?.status === "closed" && <section className="cash-card cash-closed-summary"><div className="cash-card-title"><span className="cash-icon"><ClipboardCheck size={18}/></span><div><h3>Conferência do fechamento</h3><p>Fechado em {when(selectedSession.closed_at)}.</p></div><button className="cash-secondary" onClick={() => printCloseout(selectedSession)}><Printer size={15}/> Imprimir relatório</button></div><div className="cash-method-grid"><div><span>Dinheiro esperado</span><b>{money(Number(selectedSession.expected_cash ?? 0))}</b></div><div><span>Dinheiro contado</span><b>{money(Number(selectedSession.closing_amount ?? 0))}</b></div><div><span>Diferença</span><b className={Number(selectedSession.cash_difference) < 0 ? "negative" : ""}>{money(Number(selectedSession.cash_difference ?? 0))}</b></div>{methods.map(method => <div key={method}><span>{method} contado</span><b>{money(Number(selectedSession.non_cash_count?.[method] ?? 0))}</b></div>)}</div>{selectedSession.closing_note && <p className="cash-hint">Justificativa: {selectedSession.closing_note}</p>}</section>}
      <section className="cash-card cash-history"><div className="cash-card-title"><span className="cash-icon"><History size={18}/></span><div><h3>Histórico de sessões</h3><p>{filteredSessions.length} sessões visíveis para seu perfil.</p></div></div><div className="cash-filters"><label>De<input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)}/></label><label>Até<input type="date" value={toDate} onChange={event => setToDate(event.target.value)}/></label>{role === "admin" && <><label>Operador<select value={operatorFilter} onChange={event => setOperatorFilter(event.target.value)}><option value="">Todos</option>{operators.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>Terminal<select value={registerFilter} onChange={event => setRegisterFilter(event.target.value)}><option value="">Todos</option>{registers.map(register => <option key={register.id} value={register.id}>{register.name}</option>)}</select></label></>}</div>{filteredSessions.length ? <div className="cash-history-table"><table><thead><tr><th>Terminal / turno</th><th>Operador</th><th>Abertura</th><th>Fechamento</th><th>Status</th><th>Diferença</th><th/></tr></thead><tbody>{filteredSessions.map(session => <tr key={session.id}><td><b>{session.cash_registers?.name ?? "Caixa"}</b><small>{session.shift_name}</small></td><td>{session.profiles?.display_name ?? "—"}</td><td>{when(session.opened_at)}</td><td>{when(session.closed_at)}</td><td><span className={`cash-status ${session.status}`}>{session.status === "open" ? "Aberto" : "Fechado"}</span></td><td>{session.cash_difference === null ? "—" : money(Number(session.cash_difference))}</td><td><button className="cash-secondary" onClick={() => setSelectedId(session.id)}>Detalhes</button></td></tr>)}</tbody></table></div> : <div className="cash-empty">Nenhuma sessão no período selecionado.</div>}</section>
    </>}
  </section></div>;
}
