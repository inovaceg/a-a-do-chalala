import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, X } from "lucide-react";

type Method = "Dinheiro" | "Cartão de débito" | "Cartão de crédito" | "Pix" | "Vale alimentação" | "Crediário";
type Line = { method: Method; amount: number };
type Props = { total: number; onCancel: () => void; onComplete: (payment: { discount: number; payments: Line[]; change: number; creditCustomer: string; creditDueDate: string }) => void };
const currency = (amount: number) => amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PaymentCheckout({ total, onCancel, onComplete }: Props) {
  const [lines, setLines] = useState<Line[]>([{ method: "Dinheiro", amount: total }]);
  const [discountType, setDiscountType] = useState<"value" | "percent">("value");
  const [discountValue, setDiscountValue] = useState("");
  const [password, setPassword] = useState("");
  const [approvedDiscount, setApprovedDiscount] = useState(false);
  const [error, setError] = useState("");
  const [change, setChange] = useState("");
  const [customer, setCustomer] = useState("");
  const [dueDate, setDueDate] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const proposedDiscount = discountType === "percent" ? total * Math.min(Number(discountValue) || 0, 100) / 100 : Number(discountValue) || 0;
  const discount = approvedDiscount ? Math.min(total, proposedDiscount) : 0;
  const due = Math.max(0, total - discount);
  const paid = useMemo(() => lines.reduce((sum, item) => sum + (Number(item.amount) || 0), 0), [lines]);
  const needsChange = lines.some(item => item.method === "Dinheiro") && paid > due;
  useEffect(() => {
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === "F9") {
        event.preventDefault();
        finish();
        return;
      }
      if (event.key !== "Enter" || !(event.target instanceof HTMLElement) || !dialogRef.current) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
        event.preventDefault();
        const fields = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('input:not([disabled]), select:not([disabled])'));
        const next = fields[fields.indexOf(event.target) + 1];
        if (next) next.focus();
        else dialogRef.current.querySelector<HTMLButtonElement>(".checkout-submit")?.focus();
      }
    };
    window.addEventListener("keydown", handleKeys);
    return () => window.removeEventListener("keydown", handleKeys);
  });
  const authorize = async () => {
    setError("");
    try {
      const response = await fetch("/api/authorize-discount", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.statusMessage || "Senha inválida ou senha da administradora não configurada no servidor.");
      }
      setApprovedDiscount(true);
    } catch (cause) {
      setApprovedDiscount(false);
      setError(cause instanceof Error ? cause.message : "Não foi possível validar a senha.");
    }
  };
  const finish = () => {
    const hasCredit = lines.some(item => item.method === "Crediário" && item.amount > 0);
    if (Number(discountValue) > 0 && !approvedDiscount) return setError("Autorize a senha da administradora para aplicar o desconto.");
    if (paid < due) return setError("Os pagamentos informados não cobrem o total do pedido.");
    if (hasCredit && (!customer.trim() || !dueDate)) return setError("Informe o cliente e o vencimento do crediário.");
    if (needsChange && (Number(change) < paid - due)) return setError("Informe o troco correto a devolver.");
    onComplete({ discount, payments: lines, change: Number(change) || 0, creditCustomer: customer.trim(), creditDueDate: dueDate });
  };

  return <div className="modal-backdrop checkout-backdrop"><section ref={dialogRef} className="catalog-modal checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
    <button className="modal-close" onClick={onCancel} aria-label="Fechar"><X size={18}/></button><div className="modal-kicker">FECHAMENTO DO PEDIDO</div><h2 id="checkout-title">Pagamento e troco</h2>
    <div className="checkout-total"><span>Total dos itens</span><b>{currency(total)}</b></div>
    <section className="discount-section"><h3>Desconto protegido</h3><div className="discount-fields"><select aria-label="Tipo de desconto" value={discountType} onChange={e => { setDiscountType(e.target.value as "value" | "percent"); setApprovedDiscount(false); }}><option value="value">Valor (R$)</option><option value="percent">Percentual (%)</option></select><input aria-label="Valor do desconto" type="number" min="0" step="0.01" value={discountValue} onChange={e => { setDiscountValue(e.target.value); setApprovedDiscount(false); }} placeholder="Desconto"/><input aria-label="Senha da administradora" type="password" value={password} onChange={e => { setPassword(e.target.value); setApprovedDiscount(false); }} placeholder="Senha da administradora"/><button className="secondary-action" onClick={authorize} disabled={!Number(discountValue) || !password}>Autorizar</button></div>{approvedDiscount && <small className="discount-ok">Desconto autorizado: − {currency(discount)}</small>}</section>
    <div className="checkout-total final-total"><span>Total a pagar</span><b>{currency(due)}</b></div>
    <div className="payment-heading"><h3>Formas de pagamento</h3><button className="secondary-action" onClick={() => setLines(items => [...items, { method: "Pix", amount: 0 }])}><Plus size={14}/> Adicionar forma</button></div>
    <div className="payment-line-list">{lines.map((line, index) => <div className="payment-row" key={index}><select aria-label={`Forma de pagamento ${index + 1}`} value={line.method} onChange={e => setLines(items => items.map((item, i) => i === index ? { ...item, method: e.target.value as Method } : item))}><option>Dinheiro</option><option>Cartão de débito</option><option>Cartão de crédito</option><option>Pix</option><option>Vale alimentação</option><option>Crediário</option></select><label>Valor<input autoFocus={index === 0} aria-label={`Valor da forma ${index + 1}`} type="number" min="0" step="0.01" value={line.amount} onChange={e => setLines(items => items.map((item, i) => i === index ? { ...item, amount: Number(e.target.value) } : item))}/></label>{lines.length > 1 && <button className="remove-payment" onClick={() => setLines(items => items.filter((_, i) => i !== index))} aria-label="Remover forma de pagamento"><X size={15}/></button>}</div>)}</div>
    {lines.some(item => item.method === "Crediário") && <div className="credit-fields"><label>Cliente do crediário<input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Nome do cliente"/></label><label>Vencimento<input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}/></label></div>}
    {needsChange && <label className="change-field">Troco a devolver (R$)<input type="number" min="0" step="0.01" value={change} onChange={e => setChange(e.target.value)} placeholder={currency(paid - due)}/></label>}
    <div className="checkout-total paid-total"><span>Total informado</span><b>{currency(paid)}</b></div>{error && <small className="discount-error">{error}</small>}
    <div className="checkout-shortcut">Pressione <kbd>Enter</kbd> para avançar pelos campos · <kbd>F9</kbd> para concluir a venda</div><div className="modal-actions"><button className="secondary-action" onClick={onCancel}>Voltar ao pedido</button><button className="primary-button checkout-submit" onClick={finish}><Check size={15}/> Concluir venda <kbd>F9</kbd></button></div>
  </section></div>;
}
