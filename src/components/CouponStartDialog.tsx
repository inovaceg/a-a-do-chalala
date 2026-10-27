import { useEffect, useState } from "react";
import { Check, MapPin, Search, UserRound, UserRoundX, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import "./coupon-start-dialog.css";
import "./courier-management.css";
import "./delivery-fee.css";

export type CouponCustomer = { id: string; name: string; whatsapp: string; street: string | null; address_number: string | null; neighborhood: string | null; city: string | null; address_complement: string | null; postal_code: string | null };
export type DeliveryCourier = { id: string; name: string; whatsapp: string };
export type CouponSelection = { customer: CouponCustomer | null; delivery: boolean; deliveryAddress: string; deliveryFee: number; courier: DeliveryCourier | null };
type DeliveryZone = { neighborhood: string; delivery_fee: number };
type CustomerFields = Omit<CouponCustomer, "id">;
type Props = { open: boolean; onCancel: () => void; onConfirm: (selection: CouponSelection) => void };
const customerColumns = "id,name,whatsapp,street,address_number,neighborhood,city,address_complement,postal_code";
const emptyFields: CustomerFields = { name: "", whatsapp: "", street: "", address_number: "", neighborhood: "", city: "", address_complement: "", postal_code: "" };
const addressFields: { key: keyof CustomerFields; label: string; placeholder: string }[] = [
  { key: "street", label: "Rua", placeholder: "Rua" },
  { key: "address_number", label: "Número", placeholder: "Número" },
  { key: "neighborhood", label: "Bairro", placeholder: "Bairro" },
  { key: "city", label: "Cidade", placeholder: "Cidade" },
  { key: "address_complement", label: "Complemento", placeholder: "Apartamento, referência…" },
  { key: "postal_code", label: "CEP", placeholder: "00000-000" },
];
const fullAddress = (fields: CustomerFields) => [fields.street, fields.address_number, fields.address_complement, fields.neighborhood, fields.city, fields.postal_code ? `CEP ${fields.postal_code}` : ""].filter(Boolean).join(", ");

export default function CouponStartDialog({ open, onCancel, onConfirm }: Props) {
  const [anonymous, setAnonymous] = useState(false);
  const [delivery, setDelivery] = useState(false);
  const [fields, setFields] = useState<CustomerFields>(emptyFields);
  const [nameMatches, setNameMatches] = useState<CouponCustomer[]>([]);
  const [whatsappMatches, setWhatsappMatches] = useState<CouponCustomer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CouponCustomer | null>(null);
  const [couriers, setCouriers] = useState<DeliveryCourier[]>([]);
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [deliveryZonesLoading, setDeliveryZonesLoading] = useState(false);
  const [selectedCourierId, setSelectedCourierId] = useState("");
  const [couriersLoading, setCouriersLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setAnonymous(false);
      setDelivery(false);
      setFields(emptyFields);
      setNameMatches([]);
      setWhatsappMatches([]);
      setSelectedCustomer(null);
      setCouriers([]);
      setDeliveryZones([]);
      setSelectedCourierId("");
      setError("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const loadZones = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: memberships } = await supabase.from("store_memberships").select("store_id").eq("user_id", user.id).limit(1);
      const storeId = memberships?.[0]?.store_id;
      if (!storeId) return;
      const { data } = await supabase.from("delivery_zones").select("neighborhood,delivery_fee").eq("store_id", storeId);
      if (active) setDeliveryZones((data ?? []).map(zone => ({ ...zone, delivery_fee: Number(zone.delivery_fee) })) as DeliveryZone[]);
    };
    void loadZones();
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (!open || !delivery) return;
    let active = true;
    setCouriersLoading(true);
    supabase.from("couriers").select("id,name,whatsapp").eq("is_active", true).order("name").then(({ data, error: courierError }) => {
      if (!active) return;
      setCouriersLoading(false);
      if (courierError) {
        setError("Não foi possível carregar os motoboys disponíveis.");
        setCouriers([]);
        return;
      }
      setCouriers((data ?? []) as DeliveryCourier[]);
      setError("");
    });
    return () => { active = false; };
  }, [open, delivery]);

  useEffect(() => {
    document.querySelector(".coupon-courier-field")?.remove();
    if (!open || !delivery) return;
    const addressSection = document.querySelector(".coupon-address-section");
    if (!addressSection) return;
    const field = document.createElement("label");
    field.className = "coupon-courier-field";
    const title = document.createElement("span");
    title.textContent = "Motoboy responsável";
    const required = document.createElement("i");
    required.textContent = "Obrigatório";
    title.append(required);
    const select = document.createElement("select");
    select.required = true;
    select.setAttribute("aria-label", "Motoboy responsável");
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = couriersLoading ? "Carregando motoboys…" : "Selecione um motoboy";
    select.append(placeholder);
    couriers.forEach(courier => {
      const option = document.createElement("option");
      option.value = courier.id;
      option.textContent = `${courier.name} · ${courier.whatsapp}`;
      select.append(option);
    });
    select.value = selectedCourierId;
    select.disabled = couriersLoading || couriers.length === 0;
    select.addEventListener("change", () => setSelectedCourierId(select.value));
    field.append(title, select);
    if (!couriersLoading && couriers.length === 0) {
      const help = document.createElement("small");
      help.textContent = "Cadastre um motoboy ativo em Cadastros para selecionar.";
      field.append(help);
    }
    addressSection.before(field);
    return () => field.remove();
  }, [open, delivery, couriers, couriersLoading, selectedCourierId]);

  useEffect(() => {
    const term = fields.name.trim();
    if (!open || anonymous || term.length < 3 || selectedCustomer?.name === term.toLocaleUpperCase("pt-BR")) {
      setNameMatches([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      const { data } = await supabase.from("customers").select(customerColumns).ilike("name", `%${term}%`).order("name").limit(6);
      if (active) setNameMatches((data ?? []) as CouponCustomer[]);
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [fields.name, open, anonymous, selectedCustomer]);

  useEffect(() => {
    const term = fields.whatsapp.trim();
    if (!open || anonymous || term.length < 3 || selectedCustomer?.whatsapp === term) {
      setWhatsappMatches([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      const { data } = await supabase.from("customers").select(customerColumns).ilike("whatsapp", `%${term}%`).order("name").limit(6);
      if (active) setWhatsappMatches((data ?? []) as CouponCustomer[]);
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [fields.whatsapp, open, anonymous, selectedCustomer]);

  if (!open) return null;

  const updateField = (key: keyof CustomerFields, value: string) => {
    setFields(current => ({ ...current, [key]: key === "whatsapp" || key === "postal_code" ? value : value.toLocaleUpperCase("pt-BR") }));
    if (key === "whatsapp") setSelectedCustomer(null);
  };

  const chooseCustomer = (customer: CouponCustomer) => {
    setSelectedCustomer(customer);
    setFields({ name: customer.name, whatsapp: customer.whatsapp, street: customer.street ?? "", address_number: customer.address_number ?? "", neighborhood: customer.neighborhood ?? "", city: customer.city ?? "", address_complement: customer.address_complement ?? "", postal_code: customer.postal_code ?? "" });
    setNameMatches([]);
    setWhatsappMatches([]);
  };
  const feeForNeighborhood = (neighborhood: string | null | undefined) => deliveryZones.find(zone => zone.neighborhood.trim().toLocaleLowerCase("pt-BR") === neighborhood?.trim().toLocaleLowerCase("pt-BR"))?.delivery_fee ?? 0;
  const currentDeliveryFee = delivery ? feeForNeighborhood(fields.neighborhood) : 0;

  const start = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const courier = delivery ? couriers.find(item => item.id === selectedCourierId) ?? null : null;
    if (delivery && !courier) {
      setError("Selecione um motoboy para este pedido delivery.");
      return;
    }
    if (anonymous) {
      onConfirm({ customer: null, delivery, deliveryAddress: delivery ? fullAddress(fields) : "", deliveryFee: delivery ? feeForNeighborhood(fields.neighborhood) : 0, courier });
      return;
    }
    const name = fields.name.trim().toLocaleUpperCase("pt-BR");
    const whatsapp = fields.whatsapp.trim();
    if (!name || !whatsapp) {
      setError("Nome e WhatsApp são obrigatórios, ou escolha cupom sem identificação.");
      return;
    }
    const optional = Object.fromEntries(addressFields.map(field => [field.key, fields[field.key]?.trim() || null])) as Pick<CustomerFields, "street" | "address_number" | "neighborhood" | "city" | "address_complement" | "postal_code">;
    setSaving(true);
    if (selectedCustomer && selectedCustomer.whatsapp === whatsapp) {
      const updates = Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== null));
      const { data, error: updateError } = await supabase.from("customers").update({ name, whatsapp, ...updates }).eq("id", selectedCustomer.id).select(customerColumns).single();
      if (updateError || !data) {
        setSaving(false);
        setError("Não foi possível atualizar o cadastro do cliente.");
        return;
      }
      const customer = data as CouponCustomer;
      setSaving(false);
      onConfirm({ customer, delivery, deliveryAddress: delivery ? [customer.street, customer.address_number, customer.address_complement, customer.neighborhood, customer.city, customer.postal_code ? `CEP ${customer.postal_code}` : ""].filter(Boolean).join(", ") || fullAddress(fields) : "", deliveryFee: delivery ? feeForNeighborhood(customer.neighborhood) : 0, courier });
      return;
    }
    const { data: existing, error: lookupError } = await supabase.from("customers").select(customerColumns).eq("whatsapp", whatsapp).limit(1).maybeSingle();
    if (lookupError) {
      setSaving(false);
      setError("Não foi possível verificar o cadastro do cliente.");
      return;
    }
    let customer: CouponCustomer | null = null;
    if (existing) {
      const { data, error: updateError } = await supabase.from("customers").update({ name, whatsapp, ...Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== null)) }).eq("id", existing.id).select(customerColumns).single();
      if (updateError || !data) {
        setSaving(false);
        setError("Não foi possível atualizar o cadastro do cliente.");
        return;
      }
      customer = data as CouponCustomer;
    } else {
      const { data, error: createError } = await supabase.from("customers").insert({ name, whatsapp, ...optional }).select(customerColumns).single();
      if (createError || !data) {
        setSaving(false);
        setError("Não foi possível salvar o cliente para este cupom.");
        return;
      }
      customer = data as CouponCustomer;
    }
    setSaving(false);
    const savedAddress = [customer.street, customer.address_number, customer.address_complement, customer.neighborhood, customer.city, customer.postal_code ? `CEP ${customer.postal_code}` : ""].filter(Boolean).join(", ");
    onConfirm({ customer, delivery, deliveryAddress: delivery ? savedAddress || fullAddress(fields) : "", deliveryFee: delivery ? feeForNeighborhood(customer.neighborhood) : 0, courier });
  };

  return <div className="coupon-start-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onCancel(); }}><form className="coupon-start-dialog" onSubmit={start} role="dialog" aria-modal="true" aria-labelledby="coupon-start-title"><button type="button" className="coupon-start-close" onClick={onCancel} aria-label="Fechar" disabled={saving}><X size={18}/></button><span className="coupon-start-kicker">NOVO PEDIDO</span><h2 id="coupon-start-title">Identificação do cupom</h2><p>Preencha os dados do cliente ou escolha continuar sem identificação.</p><div className="coupon-start-options"><label className={`coupon-option ${!anonymous ? "coupon-option-active" : ""}`}><input type="radio" name="coupon-identity" checked={!anonymous} onChange={() => setAnonymous(false)}/><UserRound size={17}/><span>Identificar cliente</span></label><label className={`coupon-option ${anonymous ? "coupon-option-active" : ""}`}><input type="radio" name="coupon-identity" checked={anonymous} onChange={() => setAnonymous(true)}/><UserRoundX size={17}/><span>Cupom sem identificação</span></label></div>{!anonymous && <div className="coupon-customer-fields"><div className="coupon-whatsapp-search"><label>Nome do cliente <i>Obrigatório · digite para localizar</i><input autoFocus required maxLength={160} value={fields.name} onChange={event => updateField("name", event.target.value)} placeholder="NOME COMPLETO"/></label>{nameMatches.length > 0 && <div className="coupon-customer-matches" role="listbox" aria-label="Clientes encontrados pelo nome">{nameMatches.map(customer => <button type="button" key={customer.id} onClick={() => chooseCustomer(customer)}><Search size={13}/><span><b>{customer.name}</b><small>{customer.whatsapp}</small></span></button>)}</div>}</div><div className="coupon-whatsapp-search"><label>WhatsApp <i>Obrigatório · digite para localizar</i><input type="tel" required maxLength={30} value={fields.whatsapp} onChange={event => updateField("whatsapp", event.target.value)} placeholder="(32) 99999-9999"/></label>{whatsappMatches.length > 0 && <div className="coupon-customer-matches" role="listbox" aria-label="Clientes encontrados pelo WhatsApp">{whatsappMatches.map(customer => <button type="button" key={customer.id} onClick={() => chooseCustomer(customer)}><Search size={13}/><span><b>{customer.name}</b><small>{customer.whatsapp}</small></span></button>)}</div>}</div></div>}<label className="coupon-delivery-toggle"><input type="checkbox" checked={delivery} onChange={event => setDelivery(event.target.checked)}/><span className="coupon-delivery-icon"><MapPin size={17}/></span><span><b>Este pedido é delivery</b><small>Será contado no relatório diário de entregas.</small></span></label><section className="coupon-address-section"><header><MapPin size={15}/><b>Endereço para entrega</b><small>Opcional</small></header><div className="coupon-address-fields">{addressFields.map(field => <label className={field.key === "address_complement" ? "coupon-address-wide" : ""} key={field.key}>{field.label}<input maxLength={field.key === "postal_code" ? 12 : 160} value={fields[field.key] ?? ""} onChange={event => updateField(field.key, event.target.value)} placeholder={field.placeholder}/></label>)}</div>{delivery && <div className="coupon-delivery-fee"><span>Taxa de entrega{fields.neighborhood ? ` · ${fields.neighborhood}` : ""}</span><b>{currentDeliveryFee.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b>{fields.neighborhood && currentDeliveryFee === 0 && <small>Sem taxa cadastrada para este bairro; será cobrado R$ 0,00.</small>}</div>}</section>{error && <p className="coupon-start-error" role="alert">{error}</p>}<footer><button type="button" className="coupon-start-cancel" onClick={onCancel} disabled={saving}>Cancelar</button><button className="coupon-start-confirm" disabled={saving}><Check size={16}/>{saving ? "Salvando cliente…" : "Abrir cupom"}</button></footer></form></div>;
}
