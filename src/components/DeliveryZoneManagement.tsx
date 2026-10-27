import { useEffect, useState } from "react";
import { MapPin, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import "./delivery-zone-management.css";

type Zone = { id: string; store_id: string; neighborhood: string; delivery_fee: number };
const currency = (amount: number) => Number(amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function DeliveryZoneManagement() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [storeId, setStoreId] = useState("");
  const [name, setName] = useState("");
  const [fee, setFee] = useState("");
  const [editing, setEditing] = useState<Zone | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Não foi possível identificar a sessão."); setLoading(false); return; }
    const { data: memberships, error: membershipError } = await supabase.from("store_memberships").select("store_id").eq("user_id", user.id).limit(1);
    const membership = memberships?.[0];
    if (membershipError || !membership) { setError("Não foi possível localizar a loja deste usuário."); setLoading(false); return; }
    setStoreId(membership.store_id);
    const { data, error: queryError } = await supabase.from("delivery_zones").select("id,store_id,neighborhood,delivery_fee").eq("store_id", membership.store_id).order("neighborhood");
    if (queryError) setError("Não foi possível carregar os bairros e taxas.");
    else setZones((data ?? []).map(zone => ({ ...zone, delivery_fee: Number(zone.delivery_fee) })) as Zone[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const clearForm = () => { setName(""); setFee(""); setEditing(null); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!storeId) return;
    setSaving(true); setError(""); setNotice("");
    const record = { store_id: storeId, neighborhood: name.trim().toLocaleUpperCase("pt-BR"), delivery_fee: Number(fee) };
    const request = editing
      ? supabase.from("delivery_zones").update({ neighborhood: record.neighborhood, delivery_fee: record.delivery_fee }).eq("id", editing.id).eq("store_id", storeId)
      : supabase.from("delivery_zones").insert(record);
    const { error: saveError } = await request;
    setSaving(false);
    if (saveError) { setError(saveError.code === "23505" ? "Este bairro já tem uma taxa cadastrada." : "Não foi possível salvar a taxa. Verifique os dados e tente novamente."); return; }
    setNotice(editing ? "Taxa atualizada." : "Bairro e taxa cadastrados.");
    clearForm();
    await load();
  };

  const edit = (zone: Zone) => { setEditing(zone); setName(zone.neighborhood); setFee(String(zone.delivery_fee)); setError(""); };
  const remove = async (zone: Zone) => {
    if (!window.confirm(`Remover a taxa de entrega do bairro ${zone.neighborhood}?`)) return;
    const { error: deleteError } = await supabase.from("delivery_zones").delete().eq("id", zone.id).eq("store_id", storeId);
    if (deleteError) { setError("Não foi possível remover esta taxa."); return; }
    setZones(current => current.filter(item => item.id !== zone.id));
    setNotice(`Taxa de ${zone.neighborhood} removida.`);
  };

  return <section className="delivery-zone-management"><header className="delivery-zone-header"><div><span className="auth-kicker">TARIFAS LOCAIS</span><h2>Taxas de entrega</h2><p>Cadastre bairros atendidos na cidade da loja e o valor cobrado pela entrega.</p></div><button className="secondary-action" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/> Atualizar</button></header>
    <div className="delivery-zone-layout"><form className="delivery-zone-form" onSubmit={save}><div className="delivery-zone-form-title"><span><MapPin size={18}/></span><div><h3>{editing ? "Editar bairro" : "Novo bairro"}</h3><p>A taxa será aplicada automaticamente aos cupons delivery.</p></div></div><label>Nome do bairro<input required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: São Benedito"/></label><label>Taxa de entrega (R$)<input required type="number" min="0" step="0.01" value={fee} onChange={event => setFee(event.target.value)} placeholder="0,00"/></label>{error && <p className="delivery-zone-error" role="alert">{error}</p>}{notice && <p className="delivery-zone-notice" role="status">{notice}</p>}<div className="delivery-zone-form-actions">{editing && <button type="button" className="secondary-action" onClick={clearForm}>Cancelar edição</button>}<button className="primary-button" disabled={saving || !storeId}>{saving ? "Salvando…" : <><Plus size={15}/>{editing ? "Salvar alteração" : "Cadastrar taxa"}</>}</button></div></form>
      <section className="delivery-zone-list"><header><div><h3>Bairros cadastrados</h3><p>{zones.length} {zones.length === 1 ? "localidade" : "localidades"}</p></div></header>{loading ? <div className="delivery-zone-empty">Carregando taxas…</div> : zones.length ? <div className="delivery-zone-rows">{zones.map(zone => <article key={zone.id}><span className="delivery-zone-icon"><MapPin size={16}/></span><div><b>{zone.neighborhood}</b><small>Taxa de entrega</small></div><strong>{currency(zone.delivery_fee)}</strong><button onClick={() => edit(zone)} aria-label={`Editar ${zone.neighborhood}`}><Pencil size={15}/></button><button className="delivery-zone-delete" onClick={() => void remove(zone)} aria-label={`Remover ${zone.neighborhood}`}><Trash2 size={15}/></button></article>)}</div> : <div className="delivery-zone-empty">Nenhum bairro cadastrado. Adicione o primeiro bairro e a taxa correspondente.</div>}</section></div>
  </section>;
}
