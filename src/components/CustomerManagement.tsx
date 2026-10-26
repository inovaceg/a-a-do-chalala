import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, MapPin, Pencil, Plus, Search, UserRound, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import "./customer-management.css";

type Customer = {
  id: string;
  name: string;
  whatsapp: string;
  street: string | null;
  address_number: string | null;
  neighborhood: string | null;
  city: string | null;
  address_complement: string | null;
  postal_code: string | null;
};

type CustomerForm = Omit<Customer, "id">;
type CustomerConsumption = { customer_id: string; items: { product_name: string; quantity: number }[] };
const emptyForm: CustomerForm = { name: "", whatsapp: "", street: "", address_number: "", neighborhood: "", city: "", address_complement: "", postal_code: "" };
const optionalFields: { name: keyof CustomerForm; label: string; placeholder: string }[] = [
  { name: "street", label: "Rua", placeholder: "Nome da rua" },
  { name: "address_number", label: "Número", placeholder: "Número" },
  { name: "neighborhood", label: "Bairro", placeholder: "Bairro" },
  { name: "city", label: "Cidade", placeholder: "Cidade" },
  { name: "address_complement", label: "Complemento", placeholder: "Apartamento, referência…" },
  { name: "postal_code", label: "CEP", placeholder: "00000-000" },
];

export default function CustomerManagement({ active }: { active: boolean }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [consumption, setConsumption] = useState<Map<string, { name: string; quantity: number }[]>>(new Map());
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

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    const [{ data, error: requestError }, { data: salesData, error: salesError }] = await Promise.all([
      supabase.from("customers").select("id,name,whatsapp,street,address_number,neighborhood,city,address_complement,postal_code").order("name"),
      supabase.from("sales").select("customer_id,sale_items(product_name,quantity)").eq("status", "completed").not("customer_id", "is", null),
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
      (salesData ?? []).forEach(sale => {
        if (!sale.customer_id) return;
        const customerItems = totals.get(sale.customer_id) ?? new Map<string, number>();
        (sale.sale_items ?? []).forEach(item => customerItems.set(item.product_name, (customerItems.get(item.product_name) ?? 0) + Number(item.quantity)));
        totals.set(sale.customer_id, customerItems);
      });
      setConsumption(new Map([...totals].map(([id, items]) => [id, [...items].map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "pt-BR")).slice(0, 2)])));
      setConsumptionError("");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (active) void loadCustomers();
  }, [active, loadCustomers]);

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
      street: customer.street ?? "",
      address_number: customer.address_number ?? "",
      neighborhood: customer.neighborhood ?? "",
      city: customer.city ?? "",
      address_complement: customer.address_complement ?? "",
      postal_code: customer.postal_code ?? "",
    } : emptyForm);
    setError("");
  };

  const saveCustomer = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload: CustomerForm = {
      name: form.name.trim().toLocaleUpperCase("pt-BR"),
      whatsapp: form.whatsapp.trim(),
      street: form.street?.trim().toLocaleUpperCase("pt-BR") || null,
      address_number: form.address_number?.trim().toLocaleUpperCase("pt-BR") || null,
      neighborhood: form.neighborhood?.trim().toLocaleUpperCase("pt-BR") || null,
      city: form.city?.trim().toLocaleUpperCase("pt-BR") || null,
      address_complement: form.address_complement?.trim().toLocaleUpperCase("pt-BR") || null,
      postal_code: form.postal_code?.trim() || null,
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

  const updateField = (field: keyof CustomerForm, value: string) => setForm(current => ({ ...current, [field]: field === "whatsapp" || field === "postal_code" ? value : value.toLocaleUpperCase("pt-BR") }));
  const address = (customer: Customer) => [customer.street, customer.address_number, customer.address_complement, customer.neighborhood, customer.city, customer.postal_code].filter(Boolean).join(" · ");

  return <div className="customer-management-overlay"><section className="customer-management">
    <header className="customer-page-heading"><div><span className="customer-kicker">RELACIONAMENTO</span><h2>Clientes</h2><p>Cadastre e consulte os contatos da sua loja.</p></div><button className="customer-primary" onClick={() => openForm()}><Plus size={17}/> Novo cliente</button></header>
    <div className="customer-report-tabs" role="tablist" aria-label="Visualização de clientes"><button role="tab" aria-selected={activeTab === "directory"} className={activeTab === "directory" ? "active" : ""} onClick={() => setActiveTab("directory")}><UserRound size={15}/> Cadastro de clientes</button><button role="tab" aria-selected={activeTab === "consumption"} className={activeTab === "consumption" ? "active" : ""} onClick={() => setActiveTab("consumption")}><Search size={15}/> Itens mais consumidos</button></div>
    <div className="customer-toolbar"><label className="customer-search"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por nome, WhatsApp ou bairro"/></label><span>{filteredCustomers.length} {filteredCustomers.length === 1 ? "cliente" : "clientes"}</span></div>
    {activeTab === "consumption" && <section className="customer-consumption-panel"><header><div><h3>Consumo por cliente</h3><p>Produtos ordenados pela quantidade comprada em vendas concluídas.</p></div></header>{consumptionError && <p className="customer-page-error" role="alert">{consumptionError}</p>}{loading ? <div className="customer-empty">Carregando histórico…</div> : filteredCustomers.length ? <div className="customer-consumption-table-wrap"><table className="customer-consumption-table"><thead><tr><th>Cliente</th><th>WhatsApp</th><th>Itens mais consumidos</th></tr></thead><tbody>{filteredCustomers.map(customer => { const favoriteItems = consumption.get(customer.id) ?? []; return <tr key={customer.id}><td><b>{customer.name}</b></td><td><a href={`https://wa.me/${customer.whatsapp.replace(/\\D/g, "")}`} target="_blank" rel="noreferrer">{customer.whatsapp}</a></td><td>{favoriteItems.length ? <div className="customer-favorite-items">{favoriteItems.slice(0, 3).map((item, index) => <span key={item.name}><i>{index + 1}</i><b>{item.name}</b><small>{item.quantity} {item.quantity === 1 ? "unidade" : "unidades"}</small></span>)}</div> : <span className="customer-no-consumption">Sem compras registradas</span>}</td></tr>; })}</tbody></table></div> : <div className="customer-empty">Nenhum cliente encontrado.</div>}</section>}
    {error && !editing && <p className="customer-page-error" role="alert">{error}</p>}
    {loading ? <div className="customer-empty">Carregando clientes…</div> : filteredCustomers.length ? <div className="customer-grid">{filteredCustomers.map(customer => <article className="customer-card" key={customer.id}><div className="customer-card-top"><div className="customer-avatar"><UserRound size={19}/></div><button className="customer-edit" onClick={() => openForm(customer)} aria-label={`Editar ${customer.name}`}><Pencil size={15}/></button></div><h3>{customer.name}</h3><a href={`https://wa.me/${customer.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="customer-whatsapp">{customer.whatsapp}</a>{address(customer) && <p className="customer-address"><MapPin size={14}/><span>{address(customer)}</span></p>}</article>)}</div> : <div className="customer-empty"><div className="customer-empty-icon"><UserRound size={22}/></div><b>{query ? "Nenhum cliente encontrado" : "Ainda não há clientes cadastrados"}</b><span>{query ? "Tente buscar usando outro termo." : "Adicione um cliente para criar sua base de contatos."}</span>{!query && <button className="customer-secondary" onClick={() => openForm()}><Plus size={15}/> Cadastrar primeiro cliente</button>}</div>}
    {formOpen && <div className="customer-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) { setEditing(null); setFormOpen(false); } }}><form className="customer-form" onSubmit={saveCustomer}><button type="button" className="customer-form-close" onClick={() => { setEditing(null); setFormOpen(false); }} aria-label="Fechar"><X size={18}/></button><span className="customer-kicker">CADASTRO DE CLIENTE</span><h3>{editing ? "Editar cliente" : "Novo cliente"}</h3><p>Nome e WhatsApp são obrigatórios. Os dados de endereço são opcionais.</p><div className="customer-form-grid"><label className="customer-field customer-field-wide">Nome <i>Obrigatório</i><input autoFocus required maxLength={160} value={form.name} onChange={event => updateField("name", event.target.value)} placeholder="NOME COMPLETO"/></label><label className="customer-field customer-field-wide">WhatsApp <i>Obrigatório</i><input type="tel" required maxLength={30} value={form.whatsapp} onChange={event => updateField("whatsapp", event.target.value)} placeholder="(32) 99999-9999"/></label>{optionalFields.map(field => <label className={`customer-field ${field.name === "address_complement" ? "customer-field-wide" : ""}`} key={field.name}>{field.label}<input maxLength={field.name === "postal_code" ? 12 : 160} value={form[field.name] ?? ""} onChange={event => updateField(field.name, event.target.value)} placeholder={field.placeholder}/></label>)}</div>{error && <p className="customer-form-error" role="alert">{error}</p>}<footer className="customer-form-actions"><button type="button" className="customer-secondary" onClick={() => { setEditing(null); setFormOpen(false); }} disabled={saving}>Cancelar</button><button className="customer-primary" disabled={saving}><Check size={15}/>{saving ? "Salvando…" : "Salvar cliente"}</button></footer></form></div>}
    {notice && <div className="customer-notice" role="status">{notice}</div>}
  </section></div>;
}
