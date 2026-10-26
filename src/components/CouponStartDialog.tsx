import { useState } from "react";
import { Check, UserRound, UserRoundX, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import "./coupon-start-dialog.css";

export type CouponCustomer = { id: string; name: string; whatsapp: string };
type Props = { open: boolean; onCancel: () => void; onConfirm: (customer: CouponCustomer | null) => void };

export default function CouponStartDialog({ open, onCancel, onConfirm }: Props) {
  const [anonymous, setAnonymous] = useState(false);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const start = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (anonymous) {
      onConfirm(null);
      return;
    }
    const customerName = name.trim().toLocaleUpperCase("pt-BR");
    const customerWhatsapp = whatsapp.trim();
    if (!customerName || !customerWhatsapp) {
      setError("Informe o nome e o WhatsApp ou escolha cupom sem identificação.");
      return;
    }
    setSaving(true);
    const { data: existing, error: lookupError } = await supabase.from("customers").select("id,name,whatsapp").eq("whatsapp", customerWhatsapp).maybeSingle();
    if (lookupError) {
      setSaving(false);
      setError("Não foi possível verificar o cadastro do cliente.");
      return;
    }
    if (existing) {
      setSaving(false);
      onConfirm(existing as CouponCustomer);
      return;
    }
    const { data: created, error: createError } = await supabase.from("customers").insert({ name: customerName, whatsapp: customerWhatsapp }).select("id,name,whatsapp").single();
    setSaving(false);
    if (createError || !created) {
      setError("Não foi possível salvar o cliente para este cupom.");
      return;
    }
    onConfirm(created as CouponCustomer);
  };

  return <div className="coupon-start-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onCancel(); }}><form className="coupon-start-dialog" onSubmit={start} role="dialog" aria-modal="true" aria-labelledby="coupon-start-title"><button type="button" className="coupon-start-close" onClick={onCancel} aria-label="Fechar" disabled={saving}><X size={18}/></button><span className="coupon-start-kicker">NOVO PEDIDO</span><h2 id="coupon-start-title">Identificação do cupom</h2><p>Informe quem será identificado no cupom ou escolha continuar sem identificação.</p><div className="coupon-start-options"><label className={`coupon-option ${!anonymous ? "coupon-option-active" : ""}`}><input type="radio" name="coupon-identity" checked={!anonymous} onChange={() => setAnonymous(false)}/><UserRound size={17}/><span>Identificar cliente</span></label><label className={`coupon-option ${anonymous ? "coupon-option-active" : ""}`}><input type="radio" name="coupon-identity" checked={anonymous} onChange={() => setAnonymous(true)}/><UserRoundX size={17}/><span>Cupom sem identificação</span></label></div>{!anonymous && <div className="coupon-customer-fields"><label>Nome do cliente <i>Obrigatório</i><input autoFocus required maxLength={160} value={name} onChange={event => setName(event.target.value.toLocaleUpperCase("pt-BR"))} placeholder="NOME COMPLETO"/></label><label>WhatsApp <i>Obrigatório</i><input type="tel" required maxLength={30} value={whatsapp} onChange={event => setWhatsapp(event.target.value)} placeholder="(32) 99999-9999"/></label><small>Se o WhatsApp já estiver cadastrado, o cupom será vinculado ao cadastro existente.</small></div>}{error && <p className="coupon-start-error" role="alert">{error}</p>}<footer><button type="button" className="coupon-start-cancel" onClick={onCancel} disabled={saving}>Cancelar</button><button className="coupon-start-confirm" disabled={saving}><Check size={16}/>{saving ? "Preparando cupom…" : "Abrir cupom"}</button></footer></form></div>;
}
