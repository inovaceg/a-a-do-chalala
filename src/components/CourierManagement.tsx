import { useEffect, useState } from "react";
import { Bike, Check, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import "./courier-management.css";

type Courier = { id: string; name: string; whatsapp: string; is_active: boolean };
export default function CourierManagement() {
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error: queryError } = await supabase.from("couriers").select("id,name,whatsapp,is_active").order("name");
    setLoading(false);
    if (queryError) { setError("Não foi possível carregar os motoboys cadastrados."); return; }
    setCouriers((data ?? []) as Courier[]);
    setError("");
  };
  useEffect(() => { void load(); }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    const values = { name: name.trim().toLocaleUpperCase("pt-BR"), whatsapp: whatsapp.trim() };
    const result = editing
      ? await supabase.from("couriers").update(values).eq("id", editing)
      : await supabase.from("couriers").insert(values);
    setSaving(false);
    if (result.error) { setError("Não foi possível salvar o motoboy. Confira os dados e tente novamente."); return; }
    setNotice(editing ? "Cadastro atualizado." : "Motoboy cadastrado.");
    setName("");
    setWhatsapp("");
    setEditing(null);
    await load();
  };

  const startEdit = (courier: Courier) => {
    setEditing(courier.id);
    setName(courier.name);
    setWhatsapp(courier.whatsapp);
  };

  const toggleStatus = async (courier: Courier) => {
    const { error: updateError } = await supabase.from("couriers").update({ is_active: !courier.is_active }).eq("id", courier.id);
    if (updateError) { setError("Não foi possível atualizar o status do motoboy."); return; }
    await load();
  };

  return <section className="courier-management"><div className="courier-heading"><div><span className="auth-kicker">CADASTRO DE ENTREGADORES</span><h2>Motoboys</h2><p>Cadastre entregadores para selecionar ao iniciar pedidos delivery.</p></div><button className="secondary-action" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/> Atualizar</button></div>
    <div className="courier-layout"><form className="courier-form" onSubmit={save}><span className="courier-form-icon"><Bike size={19}/></span><h3>{editing ? "Alterar motoboy" : "Novo motoboy"}</h3><label>Nome completo<input required maxLength={160} value={name} onChange={event => setName(event.target.value.toLocaleUpperCase("pt-BR"))} placeholder="NOME DO ENTREGADOR"/></label><label>WhatsApp<input required type="tel" maxLength={30} value={whatsapp} onChange={event => setWhatsapp(event.target.value)} placeholder="(32) 99999-9999"/></label>{error && <p className="courier-error" role="alert">{error}</p>}{notice && <p className="courier-notice" role="status">{notice}</p>}<div className="courier-form-actions">{editing && <button type="button" className="secondary-action" onClick={() => { setEditing(null); setName(""); setWhatsapp(""); }}>Cancelar</button>}<button className="primary-button" disabled={saving}>{saving ? "Salvando…" : <><Check size={15}/>{editing ? "Salvar alterações" : "Cadastrar motoboy"}</>}</button></div></form>
      <section className="courier-list"><header><div><h3>Entregadores cadastrados</h3><p>{couriers.filter(courier => courier.is_active).length} ativos · {couriers.length} no total</p></div></header>{loading ? <div className="courier-empty">Carregando motoboys…</div> : couriers.length ? couriers.map(courier => <article className="courier-row" key={courier.id}><span className="courier-avatar"><Bike size={17}/></span><span className="courier-info"><b>{courier.name}</b><small>{courier.whatsapp}</small></span><button className="courier-edit" onClick={() => startEdit(courier)} aria-label={`Editar ${courier.name}`}><Pencil size={15}/></button><button className={`courier-status ${courier.is_active ? "active" : "inactive"}`} onClick={() => void toggleStatus(courier)}>{courier.is_active ? "Ativo" : "Inativo"}</button></article>) : <div className="courier-empty">Cadastre o primeiro motoboy para habilitar entregas.</div>}</section></div>
  </section>;
}
