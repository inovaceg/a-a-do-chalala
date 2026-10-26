import { useState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import "./extra-management.css";

type Extra = { id?: string; name: string; price: number; cost_price: number; is_active?: boolean };
const money = (value: number) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ExtraManagement({ active, extras, onSaved }: { active: boolean; extras: Extra[]; onSaved: (extra: Extra) => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Extra | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!active) return null;

  const openForm = (extra?: Extra) => {
    setEditing(extra ?? null);
    setFormOpen(true);
    setName(extra?.name ?? "");
    setPrice(extra ? String(extra.price) : "");
    setCostPrice(extra ? String(extra.cost_price ?? 0) : "");
    setError("");
  };

  const closeForm = () => {
    setEditing(null);
    setFormOpen(false);
    setName("");
    setPrice("");
    setCostPrice("");
    setError("");
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanName = name.trim();
    const numericPrice = Number(price);
    const numericCost = Number(costPrice);
    if (!cleanName || !Number.isFinite(numericPrice) || numericPrice < 0 || !Number.isFinite(numericCost) || numericCost < 0) {
      setError("Informe um nome, preço e custo válidos, iguais ou maiores que zero.");
      return;
    }
    setSaving(true);
    setError("");
    const { data, error: saveError } = await supabase.rpc("save_extra", {
      p_extra_id: editing?.id ?? null,
      p_name: cleanName,
      p_price: numericPrice,
      p_cost_price: numericCost,
    });
    setSaving(false);
    if (saveError || !data) {
      setError(saveError?.message.toLowerCase().includes("already exists") ? "Já existe um complemento com esse nome." : "Não foi possível salvar o complemento.");
      return;
    }
    const saved = data as Extra;
    onSaved({ ...saved, price: Number(saved.price), cost_price: Number(saved.cost_price) });
    closeForm();
  };

  return <>
    <button className="extra-manager-trigger" onClick={() => setOpen(value => !value)} aria-expanded={open}>
      <Plus size={16}/>{open ? "Fechar complementos" : "Gerenciar complementos"}
    </button>
    {open && <section className="extra-manager-panel" aria-label="Gerenciar complementos">
      <header className="extra-manager-heading"><div><span className="modal-kicker">PRODUTOS & ESTOQUE</span><h2>Complementos</h2></div><button onClick={() => setOpen(false)} aria-label="Fechar"><X size={18}/></button></header>
      <button className="primary-button extra-new-button" onClick={() => openForm()}><Plus size={15}/> Novo complemento</button>
      {extras.length ? <div className="extra-manager-list">{extras.map(extra => <article key={extra.id} className="extra-manager-row"><div><b>{extra.name}</b><span>Venda: {money(Number(extra.price))}</span><span>Custo: {money(Number(extra.cost_price ?? 0))} · Ganho: {money(Number(extra.price) - Number(extra.cost_price ?? 0))}</span></div><button onClick={() => openForm(extra)} aria-label={`Editar ${extra.name}`}><Pencil size={15}/> Editar</button></article>)}</div> : <p className="extra-manager-empty">Nenhum complemento cadastrado.</p>}
      {formOpen && <div className="extra-manager-backdrop"><form className="extra-manager-form" onSubmit={save}><button type="button" className="extra-manager-close" onClick={closeForm} aria-label="Fechar formulário"><X size={17}/></button><span className="modal-kicker">CATÁLOGO AÇAÍ DO CHALALA</span><h3>{editing ? "Editar complemento" : "Novo complemento"}</h3><label>Nome<input autoFocus required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Morango"/></label><label>Preço de venda (R$)<input required type="number" min="0" step="0.01" value={price} onChange={event => setPrice(event.target.value)} placeholder="0,00"/></label><label>Custo unitário (R$)<input required type="number" min="0" step="0.01" value={costPrice} onChange={event => setCostPrice(event.target.value)} placeholder="0,00"/></label><p className="extra-cost-preview">Ganho por complemento: <b>{money((Number(price) || 0) - (Number(costPrice) || 0))}</b></p>{error && <p className="extra-manager-error" role="alert">{error}</p>}<div className="extra-manager-actions"><button type="button" className="secondary-action" onClick={closeForm} disabled={saving}>Cancelar</button><button className="primary-button" disabled={saving}><Check size={15}/>{saving ? "Salvando…" : "Salvar complemento"}</button></div></form></div>}
    </section>}
  </>;
}
