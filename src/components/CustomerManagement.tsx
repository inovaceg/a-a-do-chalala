import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, MapPin, MessageCircle, Pencil, Plus, Search, UserRound, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import "./customer-management.css";
import "./customer-personal-fields.css";
import "./customer-marketing.css";

type Customer = {
  id: string;
  name: string;
  whatsapp: string;
  gender: string | null;
  birth_date: string | null;
  street: string | null;
  address_number: string | null;
  neighborhood: string | null;
  city: string | null;
  address_complement: string | null;
  postal_code: string | null;
  marketing_opt_out: boolean;
};
type CustomerForm = Omit<Customer, "id">;
type FavoriteItem = { name: string; quantity: number };
const emptyForm: CustomerForm = { name: "", whatsapp: "", gender: "", birth_date: "", street: "", address_number: "", neighborhood: "", city: "", address_complement: "", postal_code: "", marketing_opt_out: false };
const optionalFields: { name: Exclude<keyof CustomerForm, "marketing_opt_out">; label: string; placeholder: string }[] = [
  { name: "street", label: "Rua", placeholder: "Nome da rua" },
  { name: "address_number", label: "Número", placeholder: "Número" },
  { name: "neighborhood", label: "Bairro", placeholder: "Bairro" },
  { name: "city", label: "Cidade", placeholder: "Cidade" },
  { name: "address_complement", label: "Complemento", placeholder: "Apartamento, referência…" },
  { name: "postal_code", label: "CEP", placeholder: "00000-000" },
];
const digitsOnly = (value: string) => value.replace(/\D/g, "");
const offerMessage = (customerName: string, favorites: FavoriteItem[]) => {
  const firstName = customerName.trim().split(/\s+/)[0] || customerName;
  const favoriteText = favorites.length > 1
    ? `dos seus favoritos: ${favorites[0].name} e ${favorites[1].name}? 😋💜`
    : `do seu favorito: ${favorites[0].name}? 😋💜`;
  return `💜 Oi, ${firstName}! Tudo bem? 😍\n\nBateu aquela vontade de comer algo gostoso? 🍧\n\nQue tal matar a saudade ${favoriteText}\n\nAqui no Açaí do Chalala, suas delícias favoritas estão te esperando!\n\n🛵 Peça agora pelo nosso delivery, sem sair de casa!\n\n👇 FAÇA SEU PEDIDO PELO WHATSAPP:\nhttps://wa.me/553287026461\n\n💜 AÇAÍ DO CHALALA\nSeu sabor favorito está a um clique de distância!`;
};

export default function CustomerManagement({ active }: { active: boolean }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [consumption, setConsumption] = useState<Map<string, FavoriteItem[]>>(new Map());
  const [activeTab, setActiveTab] = useState<"directory" | "consumption">("directory");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [consumptionError, setConsumptionError] = useState("");
  const [notice, setNotice] = useState("");
  const [marketingCustomer, setMarketingCustomer] = useState<Customer | null>(null);
  const [marketingMessage, setMarketingMessage] = useState("");

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    const [{ data, error: requestError }, { data: consumptionData, error: salesError }] = await Promise.all([
      supabase.from("customers").select("id,name,whatsapp,gender,birth_date,street,address_number,neighborhood,city,address_complement,postal_code,marketing_opt_out").order("name"),
      supabase.rpc("customer_item_consumption"),
    ]);
    if (requestError) setError("Não foi possível carregar os clientes.");
    else {
      setCustomers((data ?? []) as Customer[]);
      setError("");
    }
    if (salesError) {
      setConsumption(new Map());
      setConsumptionError("Não foi possível carregar o histórico de compras.");
    } else {
      const totals = new Map<string, Map<string, number>>();
      (consumptionData ?? []).forEach(item => {
        const customerItems = totals.get(item.customer_id) ?? new Map<string, number>();
        customerItems.set(item.product_name, Number(item.quantity));
        totals.set(item.customer_id, customerItems);
      });
      setConsumption(new Map([...totals].map(([id, items]) => [id, [...items].map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "pt-BR")).slice(0, 2)] as const)));
      setConsumptionError("");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (active) void loadCustomers();
  }, [active, loadCustomers]);

  useEffect(() => {
    if (!formOpen) return;
    const grid = document.querySelector<HTMLElement>(".customer-form-grid");
    const whatsapp = grid?.querySelector(".customer-field:nth-child(2)");
    if (!grid || !whatsapp) return;
    const fields = document.createElement("div");
    fields.className = "customer-personal-fields";
    const genderLabel = document.createElement("label");
    genderLabel.className = "customer-field";
    genderLabel.append("Gênero");
    const gender = document.createElement("select");
    gender.innerHTML = '<option value="">Não informado</option><option value="Feminino">Feminino</option><option value="Masculino">Masculino</option><option value="Outro">Outro</option><option value="Prefiro não informar">Prefiro não informar</option>';
    gender.value = form.gender ?? "";
    gender.addEventListener("change", () => updateField("gender", gender.value));
    genderLabel.append(gender);
    const birthLabel = document.createElement("label");
    birthLabel.className = "customer-field";
    birthLabel.append("Data de nascimento");
    const birthDate = document.createElement("input");
    birthDate.type = "date";
    birthDate.value = form.birth_date ?? "";
    birthDate.addEventListener("change", () => updateField("birth_date", birthDate.value));
    birthLabel.append(birthDate);
    fields.append(genderLabel, birthLabel);
    whatsapp.after(fields);
    return () => fields.remove();
  }, [formOpen, editing]);

  useEffect(() => {
    const panel = document.querySelector<HTMLElement>(".customer-management");
    panel?.classList.toggle("showing-consumption", activeTab === "consumption");
  }, [active, activeTab]);

  const filteredCustomers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return customers.filter(customer => `${customer.name} ${customer.whatsapp} ${customer.neighborhood ?? ""} ${customer.city ?? ""}`.toLocaleLowerCase("pt-BR").includes(normalized));
  }, [customers, query]);

  if (!active) return null;

  const openForm = (customer?: Customer) => {
    setEditing(customer ?? null);
    setFormOpen(true);
    setForm(customer ? {
      name: customer.name,
      whatsapp: customer.whatsapp,
      gender: customer.gender ?? "",
      birth_date: customer.birth_date ?? "",
      street: customer.street ?? "",
      address_number: customer.address_number ?? "",
      neighborhood: customer.neighborhood ?? "",
      city: customer.city ?? "",
      address_complement: customer.address_complement ?? "",
      postal_code: customer.postal_code ?? "",
      marketing_opt_out: customer.marketing_opt_out,
    } : emptyForm);
    setError("");
  };

  const saveCustomer = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload: CustomerForm = {
      name: form.name.trim().toLocaleUpperCase("pt-BR"),
      whatsapp: form.whatsapp.trim(),
      gender: form.gender || null,
      birth_date: form.birth_date || null,
      street: form.street?.trim().toLocaleUpperCase("pt-BR") || null,
      address_number: form.address_number?.trim().toLocaleUpperCase("pt-BR") || null,
      neighborhood: form.neighborhood?.trim().toLocaleUpperCase("pt-BR") || null,
      city: form.city?.trim().toLocaleUpperCase("pt-BR") || null,
      address_complement: form.address_complement?.trim().toLocaleUpperCase("pt-BR") || null,
      postal_code: form.postal_code?.trim() || null,
      marketing_opt_out: form.marketing_opt_out,
    };
    setSaving(true);
    setError("");
    const result = editing
      ? await supabase.from("customers").update(payload).eq("id", editing.id)
      : await supabase.from("customers").insert(payload);
    setSaving(false);
    if (result.error) {
      setError("Não foi possível salvar o cliente. Confira os campos e tente novamente.");
      return;
    }
    setEditing(null);
    setFormOpen(false);
    setNotice(editing ? "Cadastro atualizado." : "Cliente cadastrado.");
    window.setTimeout(() => setNotice(""), 3000);
    await loadCustomers();
  };

  const updateField = (field: Exclude<keyof CustomerForm, "marketing_opt_out">, value: string) => setForm(current => ({ ...current, [field]: ["whatsapp", "postal_code", "gender", "birth_date"].includes(field) ? value : value.toLocaleUpperCase("pt-BR") }));
  const address = (customer: Customer) => [customer.street, customer.address_number, customer.address_complement, customer.neighborhood, customer.city, customer.postal_code].filter(Boolean).join(" · ");
  const startMarketingPreview = (customer: Customer) => {
    const favorites = consumption.get(customer.id) ?? [];
    if (customer.marketing_opt_out || favorites.length === 0) return;
    setMarketingCustomer(customer);
    setMarketingMessage(offerMessage(customer.name, favorites));
  };
  const openWhatsApp = () => {
    if (!marketingCustomer || marketingCustomer.marketing_opt_out) return;
    const phone = digitsOnly(marketingCustomer.whatsapp);
    if (phone.length < 10 || phone.length > 15 || !marketingMessage.trim()) return;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(marketingMessage)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setMarketingCustomer(null);
  };

  return <div className="customer-management-overlay"><section className="customer-management">
    <header className="customer-page-heading"><div><span className="customer-kicker">RELACIONAMENTO</span><h2>Clientes</h2><p>Cadastre e consulte os contatos da sua loja.</p></div><button className="customer-primary" onClick={() => openForm()}><Plus size={17}/> Novo cliente</button></header>
    <div className="customer-report-tabs" role="tablist" aria-label="Visualização de clientes"><button role="tab" aria-selected={activeTab === "directory"} className={activeTab === "directory" ? "active" : ""} onClick={() => setActiveTab("directory")}><UserRound size={15}/> Cadastro de clientes</button><button role="tab" aria-selected={activeTab === "consumption"} className={activeTab === "consumption" ? "active" : ""} onClick={() => setActiveTab("consumption")}><Search size={15}/> Itens mais consumidos</button></div>
    <div className="customer-toolbar"><label className="customer-search"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por nome, WhatsApp ou bairro"/></label><span>{filteredCustomers.length} {filteredCustomers.length === 1 ? "cliente" : "clientes"}</span></div>
    {activeTab === "consumption" && <section className="customer-consumption-panel"><header><div><h3>Consumo por cliente</h3><p>Produtos ordenados pela quantidade comprada em vendas concluídas.</p></div></header>{consumptionError && <p className="customer-page-error" role="alert">{consumptionError}</p>}{loading ? <div className="customer-empty">Carregando histórico…</div> : filteredCustomers.length ? <div className="customer-consumption-table-wrap"><table className="customer-consumption-table"><thead><tr><th>Cliente</th><th>WhatsApp</th><th>Itens mais consumidos</th><th>Ações</th></tr></thead><tbody>{filteredCustomers.map(customer => { const favoriteItems = consumption.get(customer.id) ?? []; const phone = digitsOnly(customer.whatsapp); const phoneValid = phone.length >= 10 && phone.length <= 15; const canOffer = !customer.marketing_opt_out && favoriteItems.length > 0 && phoneValid; const disabledReason = customer.marketing_opt_out ? "Cliente optou por não receber ofertas" : favoriteItems.length === 0 ? "Sem produtos favoritos" : "WhatsApp inválido"; return <tr key={customer.id}><td><b>{customer.name}</b></td><td>{customer.whatsapp}</td><td>{favoriteItems.length ? <div className="customer-favorite-items">{favoriteItems.map((item, index) => <span key={item.name}><i>{index + 1}</i><b>{item.name}</b><small>{item.quantity} {item.quantity === 1 ? "unidade" : "unidades"}</small></span>)}</div> : <span className="customer-no-consumption">Sem compras registradas</span>}</td><td><div className="customer-offer-action"><button className="customer-offer-button" disabled={!canOffer} title={!canOffer ? disabledReason : "Enviar oferta via WhatsApp"} onClick={() => startMarketingPreview(customer)}><MessageCircle size={15}/> Enviar oferta via WhatsApp</button>{!canOffer && <small className="customer-offer-unavailable">{disabledReason}</small>}</div></td></tr>; })}</tbody></table></div> : <div className="customer-empty">Nenhum cliente encontrado.</div>}</section>}
    {error && !editing && <p className="customer-page-error" role="alert">{error}</p>}
    {loading ? <div className="customer-empty">Carregando clientes…</div> : filteredCustomers.length ? <div className="customer-grid">{filteredCustomers.map(customer => <article className="customer-card" key={customer.id}><div className="customer-card-top"><div className="customer-avatar"><UserRound size={19}/></div><button className="customer-edit" onClick={() => openForm(customer)} aria-label={`Editar ${customer.name}`}><Pencil size={15}/></button></div><h3>{customer.name}</h3><a href={`https://wa.me/${digitsOnly(customer.whatsapp)}`} target="_blank" rel="noreferrer" className="customer-whatsapp">{customer.whatsapp}</a>{address(customer) && <p className="customer-address"><MapPin size={14}/><span>{address(customer)}</span></p>}</article>)}</div> : <div className="customer-empty"><div className="customer-empty-icon"><UserRound size={22}/></div><b>{query ? "Nenhum cliente encontrado" : "Ainda não há clientes cadastrados"}</b><span>{query ? "Tente buscar usando outro termo." : "Adicione um cliente para criar sua base de contatos."}</span>{!query && <button className="customer-secondary" onClick={() => openForm()}><Plus size={15}/> Cadastrar primeiro cliente</button>}</div>}
    {formOpen && <div className="customer-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) { setEditing(null); setFormOpen(false); } }}><form className="customer-form" onSubmit={saveCustomer}><button type="button" className="customer-form-close" onClick={() => { setEditing(null); setFormOpen(false); }} aria-label="Fechar"><X size={18}/></button><span className="customer-kicker">CADASTRO DE CLIENTE</span><h3>{editing ? "Editar cliente" : "Novo cliente"}</h3><p>Nome e WhatsApp são obrigatórios. Os dados de endereço são opcionais.</p><div className="customer-form-grid"><label className="customer-field customer-field-wide">Nome <i>Obrigatório</i><input autoFocus required maxLength={160} value={form.name} onChange={event => updateField("name", event.target.value)} placeholder="NOME COMPLETO"/></label><label className="customer-field customer-field-wide">WhatsApp <i>Obrigatório</i><input type="tel" required maxLength={30} value={form.whatsapp} onChange={event => updateField("whatsapp", event.target.value)} placeholder="(32) 99999-9999"/></label>{optionalFields.map(field => <label className={`customer-field ${field.name === "address_complement" ? "customer-field-wide" : ""}`} key={field.name}>{field.label}<input maxLength={field.name === "postal_code" ? 12 : 160} value={form[field.name] ?? ""} onChange={event => updateField(field.name, event.target.value as string)} placeholder={field.placeholder}/></label>)}<label className="customer-marketing-consent"><input type="checkbox" checked={form.marketing_opt_out} onChange={event => setForm(current => ({ ...current, marketing_opt_out: event.target.checked }))}/><span><b>Cliente optou por não receber ofertas promocionais</b><small>Marque para bloquear o envio de ofertas para este cliente.</small></span></label></div>{error && <p className="customer-form-error" role="alert">{error}</p>}<footer className="customer-form-actions"><button type="button" className="customer-secondary" onClick={() => { setEditing(null); setFormOpen(false); }} disabled={saving}>Cancelar</button><button className="customer-primary" disabled={saving}><Check size={15}/>{saving ? "Salvando…" : "Salvar cliente"}</button></footer></form></div>}
    {marketingCustomer && <div className="customer-modal-backdrop marketing-preview-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setMarketingCustomer(null); }}><section className="marketing-preview" role="dialog" aria-modal="true" aria-labelledby="marketing-preview-title"><button type="button" className="customer-form-close" onClick={() => setMarketingCustomer(null)} aria-label="Fechar"><X size={18}/></button><span className="customer-kicker">OFERTA PERSONALIZADA · WHATSAPP</span><h3 id="marketing-preview-title">Revise a mensagem</h3><div className="marketing-preview-details"><p><b>Cliente</b><span>{marketingCustomer.name}</span></p><p><b>WhatsApp destinatário</b><span>{marketingCustomer.whatsapp}</span></p><p><b>Produtos favoritos</b><span>{(consumption.get(marketingCustomer.id) ?? []).map(item => item.name).join(" · ")}</span></p></div><label className="marketing-message-field">Mensagem<textarea rows={14} value={marketingMessage} onChange={event => setMarketingMessage(event.target.value)}/></label><div className="marketing-preview-actions"><button className="customer-secondary" onClick={() => setMarketingCustomer(null)}>Cancelar</button><button className="customer-offer-button marketing-open-button" onClick={openWhatsApp} disabled={!marketingMessage.trim() || digitsOnly(marketingCustomer.whatsapp).length < 10 || digitsOnly(marketingCustomer.whatsapp).length > 15}><MessageCircle size={16}/> Abrir WhatsApp</button></div><p className="marketing-preview-note">A mensagem não será enviada automaticamente. Você poderá confirmar o envio no WhatsApp.</p></section></div>}
    {notice && <div className="customer-notice" role="status">{notice}</div>}
  </section></div>;
}
