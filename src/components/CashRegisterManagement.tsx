import { useEffect, useState } from "react";
import { Check, Monitor, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import "./cash-register-management.css";

type Register = { id: string; name: string; is_active: boolean };

export default function CashRegisterManagement() {
  const [registers, setRegisters] = useState<Register[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Register | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase.from("cash_registers").select("id,name,is_active").order("name");
    if (loadError) setError("Não foi possível carregar os PDVs cadastrados.");
    else setRegisters((data ?? []) as Register[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const openForm = (register?: Register) => {
    setEditing(register ?? null);
    setFormOpen(true);
    setName(register?.name ?? "");
    setActive(register?.is_active ?? true);
    setError("");
    setSuccess("");
  };

  const closeForm = () => {
    setEditing(null);
    setFormOpen(false);
    setName("");
    setActive(true);
    setError("");
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    const { error: saveError } = await supabase.rpc("save_cash_register", {
      p_register_id: editing?.id ?? null,
      p_name: name.trim(),
      p_is_active: active,
    });
    setSaving(false);
    if (saveError) {
      setError(saveError.message || "Não foi possível salvar o PDV.");
      return;
    }
    closeForm();
    setSuccess(editing ? "PDV atualizado." : "PDV cadastrado e disponível para abertura de caixa.");
    await load();
  };

  return <section className="cash-register-management">
    <header className="cash-register-heading"><div><span className="auth-kicker">CADASTROS DA LOJA</span><h2>PDVs e caixas físicos</h2><p>Cadastre os terminais que poderão ser selecionados na abertura do caixa.</p></div><button className="secondary-action" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/> Atualizar</button></header>
    {error && !editing && <p className="cash-register-message error" role="alert">{error}</p>}
    {success && <p className="cash-register-message success" role="status">{success}</p>}
    <div className="cash-register-toolbar"><div><Monitor size={18}/><span>{registers.filter(register => register.is_active).length} PDVs ativos</span></div><button className="primary-button" onClick={() => openForm()}><Plus size={16}/> Cadastrar PDV</button></div>
    {loading ? <div className="cash-register-empty">Carregando PDVs…</div> : registers.length ? <div className="cash-register-list">{registers.map(register => <article key={register.id} className="cash-register-row"><span className="cash-register-icon"><Monitor size={18}/></span><div className="cash-register-info"><b>{register.name}</b><small>{register.is_active ? "Disponível para abertura" : "Inativo"}</small></div><span className={`cash-register-state ${register.is_active ? "active" : "inactive"}`}>{register.is_active ? "Ativo" : "Inativo"}</span><button className="cash-register-edit" onClick={() => openForm(register)} aria-label={`Editar ${register.name}`}><Pencil size={15}/> Editar</button></article>)}</div> : <div className="cash-register-empty">Nenhum PDV cadastrado. Cadastre um para selecioná-lo ao abrir o caixa.</div>}
    {formOpen && <div className="cash-register-backdrop"><form className="cash-register-form" onSubmit={save}><button type="button" className="cash-register-close" onClick={closeForm} aria-label="Fechar"><X size={17}/></button><span className="auth-kicker">TERMINAL DE VENDA</span><h3>{editing ? "Editar PDV" : "Cadastrar PDV"}</h3><p>O nome será exibido no seletor de caixa físico.</p><label>Nome do PDV<input autoFocus required maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Caixa 01"/></label><label className="cash-register-active-toggle"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)}/> Disponível para abertura de caixa</label>{error && <p className="cash-register-message error" role="alert">{error}</p>}<div className="cash-register-actions"><button type="button" className="secondary-action" onClick={closeForm} disabled={saving}>Cancelar</button><button className="primary-button" disabled={saving}><Check size={15}/>{saving ? "Salvando…" : "Salvar PDV"}</button></div></form></div>}
  </section>;
}
