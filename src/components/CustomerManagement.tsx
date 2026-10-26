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
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    const { data, error: requestError } = await supabase.from("customers").select("id,name,whatsapp,street,address_number,neighborhood,city,address_complement,postal_code").order("name");
    if (requestError) setError("Não foi possível carregar os clientes.");
    else {
      setCustomers((data ?? []) as Customer[]);
      setError("");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (active) void loadCustomers();
  }, [active, loadCustomers]);

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
    <div className="customer-toolbar"><label className="customer-search"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por nome, WhatsApp ou bairro"/></label><span>{customers.length} {customers.length === 1 ? "cliente" : "clientes"}</span></div>
    {error && !editing && <p className="customer-page-error" role="alert">{error}</p>}
    {loading ? <div className="customer-empty">Carregando clientes…</div> : filteredCustomers.length ? <div className="customer-grid">{filteredCustomers.map(customer => <article className="customer-card" key={customer.id}><div className="customer-card-top"><div className="customer-avatar"><UserRound size={19}/></div><button className="customer-edit" onClick={() => openForm(customer)} aria-label={`Editar ${customer.name}`}><Pencil size={15}/></button></div><h3>{customer.name}</h3><a href={`https://wa.me/${customer.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="customer-whatsapp">{customer.whatsapp}</a>{address(customer) && <p className="customer-address"><MapPin size={14}/><span>{address(customer)}</span></p>}</article>)}</div> : <div className="customer-empty"><div className="customer-empty-icon"><UserRound size={22}/></div><b>{query ? "Nenhum cliente encontrado" : "Ainda não há clientes cadastrados"}</b><span>{query ? "Tente buscar usando outro termo." : "Adicione um cliente para criar sua base de contatos."}</span>{!query && <button className="customer-secondary" onClick={() => openForm()}><Plus size={15}/> Cadastrar primeiro cliente</button>}</div>}
    {formOpen && <div className="customer-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) { setEditing(null); setFormOpen(false); } }}><form className="customer-form" onSubmit={saveCustomer}><button type="button" className="customer-form-close" onClick={() => { setEditing(null); setFormOpen(false); }} aria-label="Fechar"><X size={18}/></button><span className="customer-kicker">CADASTRO DE CLIENTE</span><h3>{editing ? "Editar cliente" : "Novo cliente"}</h3><p>Nome e WhatsApp são obrigatórios. Os dados de endereço são opcionais.</p><div className="customer-form-grid"><label className="customer-field customer-field-wide">Nome <i>Obrigatório</i><input autoFocus required maxLength={160} value={form.name} onChange={event => updateField("name", event.target.value)} placeholder="NOME COMPLETO"/></label><label className="customer-field customer-field-wide">WhatsApp <i>Obrigatório</i><input type="tel" required maxLength={30} value={form.whatsapp} onChange={event => updateField("whatsapp", event.target.value)} placeholder="(32) 99999-9999"/></label>{optionalFields.map(field => <label className={`customer-field ${field.name === "address_complement" ? "customer-field-wide" : ""}`} key={field.name}>{field.label}<input maxLength={field.name === "postal_code" ? 12 : 160} value={form[field.name] ?? ""} onChange={event => updateField(field.name, event.target.value)} placeholder={field.placeholder}/></label>)}</div>{error && <p className="customer-form-error" role="alert">{error}</p>}<footer className="customer-form-actions"><button type="button" className="customer-secondary" onClick={() => { setEditing(null); setFormOpen(false); }} disabled={saving}>Cancelar</button><button className="customer-primary" disabled={saving}><Check size={15}/>{saving ? "Salvando…" : "Salvar cliente"}</button></footer></form></div>}
    {notice && <div className="customer-notice" role="status">{notice}</div>}
  </section></div>;
}
