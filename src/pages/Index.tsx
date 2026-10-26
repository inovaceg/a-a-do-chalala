import { useEffect, useMemo, useState } from "react";
import PaymentCheckout from "@/components/PaymentCheckout";
import CouponStartDialog, { type CouponCustomer, type CouponSelection } from "@/components/CouponStartDialog";
import TeamManagement from "@/components/TeamManagement";
import SalesManagement from "@/components/SalesManagement";
import CustomerManagement from "@/components/CustomerManagement";
import ExtraManagement from "@/components/ExtraManagement";
import { supabase } from "@/integrations/supabase/client";
import { Activity, ArrowUpRight, Banknote, Bell, Boxes, CalendarDays, Check, ChevronDown, Clock3, Coffee, CreditCard, LayoutDashboard, Menu, Minus, Plus, Printer, Search, ShoppingBag, ShoppingCart, Users, UserCog, Wallet, LogOut, X } from "lucide-react";
import "./pos-keyboard.css";
import "./product-edit.css";
import "./combo-editor.css";

type Extra = { id?: string; name: string; price: number; is_active?: boolean };
type ComboComponent = { id: string; name: string; type: "product"; quantity: number };
type Product = { id?: string; name: string; category: string; price: number; color: string; emoji: string; kind?: "combo" | "product"; extras?: Extra[]; combo_items?: ComboComponent[]; is_active?: boolean };
type CartItem = { id: number; product: Product; extras: Extra[] };
type PaymentMethod = "Dinheiro" | "Cartão de débito" | "Cartão de crédito" | "Pix" | "Vale alimentação" | "Crediário";
type PaymentLine = { method: PaymentMethod; amount: number };
const initialProducts: Product[] = [
  { name: "Açaí Tradicional", category: "Açaí • 500ml", price: 18, color: "berry", emoji: "🍇", extras: [{ name: "Morango", price: 3 }, { name: "Nutella", price: 4 }, { name: "Leite Ninho", price: 3 }] },
  { name: "Açaí Especial", category: "Açaí • 700ml", price: 25, color: "lilac", emoji: "🍓", extras: [{ name: "Morango", price: 3 }, { name: "Nutella", price: 4 }, { name: "Leite Ninho", price: 3 }] },
  { name: "Açaí com Ninho", category: "Açaí • 500ml", price: 22, color: "cream", emoji: "🥛", extras: [{ name: "Morango", price: 3 }, { name: "Nutella", price: 4 }] },
  { name: "Açaí com Nutella", category: "Açaí • 500ml", price: 24, color: "peach", emoji: "🍫", extras: [{ name: "Morango", price: 3 }, { name: "Leite Ninho", price: 3 }] },
  { name: "Açaí na Tigela", category: "Açaí • 400ml", price: 16, color: "berry", emoji: "🥣", extras: [{ name: "Morango", price: 3 }, { name: "Nutella", price: 4 }, { name: "Leite Ninho", price: 3 }] },
  { name: "Suco Natural", category: "Bebidas • 300ml", price: 9, color: "green", emoji: "🥤", extras: [] },
];
const navItems = [{ label: "Visão geral", icon: LayoutDashboard }, { label: "PDV", icon: ShoppingCart }, { label: "Vendas", icon: Banknote }, { label: "Produtos & estoque", icon: Boxes }, { label: "Clientes", icon: Users }, { label: "Financeiro", icon: Wallet }, { label: "Equipe", icon: UserCog }];
const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const loadProducts = (): Product[] => { try { const stored = localStorage.getItem("chalala-products"); return stored ? JSON.parse(stored) as Product[] : initialProducts; } catch { return initialProducts; } };

export default function Index({ role, displayName, email }: { role: "admin" | "operator"; displayName: string; email: string }) {
  const [active, setActive] = useState(role === "admin" ? "Visão geral" : "PDV");
  const visibleNavItems = role === "admin" ? navItems : navItems.filter(item => item.label === "PDV" || item.label === "Vendas" || item.label === "Clientes");
  const initials = displayName.split(" ").map(part => part[0]).slice(0,2).join("").toUpperCase();
  const [products, setProducts] = useState<Product[]>(loadProducts);
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<"product" | "extra" | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [customize, setCustomize] = useState<Product | null>(null);
  const [closedSale, setClosedSale] = useState<{ items: CartItem[]; total: number; id: string; discount: number; payments: PaymentLine[]; change: number; creditCustomer: string; creditDueDate: string; customer: CouponCustomer | null; delivery: boolean; deliveryAddress: string } | null>(null);
  const [currentSaleCustomer, setCurrentSaleCustomer] = useState<CouponCustomer | null>(null);
  const [currentSaleDelivery, setCurrentSaleDelivery] = useState(false);
  const [currentDeliveryAddress, setCurrentDeliveryAddress] = useState("");
  const [couponStartOpen, setCouponStartOpen] = useState(false);
  const [couponStarted, setCouponStarted] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [selectedExtraIndex, setSelectedExtraIndex] = useState(0);
  const [formName, setFormName] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formCategory, setFormCategory] = useState("Açaí");
  const [formCombo, setFormCombo] = useState(false);
  const [formExtras, setFormExtras] = useState<string[]>([]);
  const [cashSession, setCashSession] = useState<{ id: string; register_id: string } | null>(null);
  const [checkoutSaving, setCheckoutSaving] = useState(false);
  useEffect(() => {
    let mounted = true;
    const catalogQuery = supabase.from("products").select("id,name,category,price,color,emoji,kind,extras,combo_items,is_active");
    if (role !== "admin") catalogQuery.eq("is_active", true);
    Promise.all([
      catalogQuery,
      supabase.rpc("open_cash_session"),
      supabase.from("extras").select("id,name,price,is_active").eq("is_active", true).order("name"),
    ]).then(([catalog, session, availableExtras]) => {
      if (!mounted) return;
      if (catalog.data) {
        const savedProducts = catalog.data.map(product => ({ ...product, price: Number(product.price) })) as Product[];
        setCatalogProducts(savedProducts);
        setProducts(savedProducts.length ? savedProducts : initialProducts);
      }
      setExtras((availableExtras.data ?? []).map(extra => ({ ...extra, price: Number(extra.price) })) as Extra[]);
      if (session.data) setCashSession(session.data as { id: string; register_id: string });
      if (session.error) setNotice("Não foi possível abrir um caixa. Verifique se há um caixa disponível.");
      if (availableExtras.error) setNotice("Não foi possível carregar os complementos cadastrados.");
    });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    const modal = document.querySelector<HTMLFormElement>(".catalog-modal");
    if (!modal) return;
    modal.querySelector(".combo-composition-editor")?.remove();
    if (dialog !== "product" || !formCombo) return;
    let cancelled = false;
    const editor = document.createElement("section");
    editor.className = "combo-composition-editor form-extras";
    const heading = document.createElement("b");
    heading.textContent = "Itens incluídos no combo";
    const help = document.createElement("small");
    help.textContent = "Carregando produtos do catálogo…";
    editor.append(heading, help);
    modal.insertBefore(editor, modal.querySelector(".modal-actions"));
    const loadCatalogProducts = async () => {
      const { data, error } = await supabase.from("products").select("id,name,category,price,color,emoji,kind,extras,combo_items,is_active").eq("is_active", true).order("name");
      if (cancelled || !editor.isConnected) return;
      if (error) {
        help.textContent = "Não foi possível carregar os produtos cadastrados.";
        return;
      }
      const componentOptions = (data ?? []).filter(product => product.kind !== "combo" && product.id !== editingProduct?.id);
      help.textContent = componentOptions.length
        ? "O preço informado é o valor final do combo. Marque os produtos cadastrados que ele inclui."
        : "Cadastre primeiro os produtos que farão parte do combo.";
      const choices = document.createElement("div");
      for (const component of componentOptions) {
        const label = document.createElement("label");
        label.className = "extra-check";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = component.id;
        checkbox.dataset.productName = component.name;
        checkbox.checked = Boolean(editingProduct?.combo_items?.some(item => item.id === component.id));
        const text = document.createElement("span");
        text.textContent = component.name;
        label.append(checkbox, text);
        choices.append(label);
      }
      editor.append(choices);
    };
    void loadCatalogProducts();
    return () => { cancelled = true; editor.remove(); };
  }, [dialog, formCombo, editingProduct]);
  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + item.product.price + item.extras.reduce((n, extra) => n + extra.price, 0), 0), [cart]);
  const filtered = products.filter(p => p.is_active !== false && `${p.name} ${p.category}`.toLowerCase().includes(query.toLowerCase()));
  const saveProducts = (next: Product[]) => { setProducts(next); setCatalogProducts(next); localStorage.setItem("chalala-products", JSON.stringify(next)); };
  const add = (product: Product, picked: Extra[] = []) => { setCart(c => [...c, { id: Date.now() + Math.random(), product, extras: picked }]); };
  const availableExtras = () => extras;
  const beginProduct = (product: Product) => { const choices = availableExtras(); if (choices.length) { setCustomize({ ...product, extras: choices }); setSelectedExtras([]); } else add(product); };
  const submitCatalog = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = formName.trim().toLocaleUpperCase("pt-BR");
    const price = Number(formPrice);
    if (!name || !Number.isFinite(price) || price < 0) return;
    if (dialog === "product") {
      const productExtras = formExtras.map(n => extras.find(e => e.name === n)).filter((e): e is Extra => Boolean(e));
      const selectedComboItems = Array.from(document.querySelectorAll<HTMLInputElement>(".combo-composition-editor input:checked")).map(input => {
        const id = input.value;
        const name = input.dataset.productName;
        return name ? { id, name, type: "product" as const, quantity: 1 } : null;
      }).filter((component): component is ComboComponent => component !== null);
      const category = `${formCategory}${formCombo ? " • Combo" : ""}`;
      const { data, error } = await supabase.rpc("save_product", { p_product_id: editingProduct?.id ?? null, p_name: name, p_category: category, p_price: price, p_kind: formCombo ? "combo" : "product", p_extras: productExtras, p_combo_items: selectedComboItems });
      if (error || !data) { setNotice("Não foi possível salvar o produto."); return; }
      const saved = { ...(data as Product), price: Number((data as Product).price), color: editingProduct?.color ?? "lilac", emoji: editingProduct?.emoji ?? (formCombo ? "🍨" : "🥣"), extras: productExtras };
      saveProducts(editingProduct ? catalogProducts.map(product => product.id === editingProduct.id ? saved : product) : [...catalogProducts, saved]);
      setNotice(editingProduct ? "Produto atualizado com sucesso." : formCombo ? "Combo cadastrado com sucesso." : "Produto cadastrado com sucesso.");
    } else {
      const { data, error } = await supabase.rpc("save_extra", { p_extra_id: null, p_name: name, p_price: price });
      if (error || !data) { setNotice(error?.message.toLowerCase().includes("already exists") ? "Já existe um complemento com esse nome." : "Não foi possível salvar o complemento."); return; }
      const saved = { ...(data as Extra), price: Number((data as Extra).price) };
      setExtras(current => [...current, saved].sort((a, b) => a.name.localeCompare(b.name)));
      setNotice("Complemento cadastrado com sucesso.");
    }
    setFormName("");
    setFormPrice("");
    setFormExtras([]);
    setDialog(null);
    window.setTimeout(() => setNotice(""), 3000);
  };
  const pay = () => { if (cart.length) setCheckoutOpen(true); };
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key === "F9" && active === "PDV" && !checkoutOpen && !customize && !dialog && cart.length > 0) {
        event.preventDefault();
        setCheckoutOpen(true);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [active, checkoutOpen, customize, dialog, cart.length]);

  useEffect(() => {
    if (!customize) return;
    setSelectedExtraIndex(0);
    const frame = window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>(".customize-modal .customize-extras input[type=checkbox]")?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [customize]);

  useEffect(() => {
    if (!customize) return;
    const handleCustomizeKeys = (event: KeyboardEvent) => {
      const modal = document.querySelector<HTMLElement>(".customize-modal");
      if (!modal || !modal.contains(event.target as Node)) return;
      const choices = Array.from(modal.querySelectorAll<HTMLInputElement>(".customize-extras input[type=checkbox]"));
      const focusedIndex = choices.indexOf(document.activeElement as HTMLInputElement);
      if ((event.key === "ArrowDown" || event.key === "ArrowUp") && choices.length) {
        event.preventDefault();
        const current = focusedIndex < 0 ? selectedExtraIndex : focusedIndex;
        const next = Math.max(0, Math.min(choices.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)));
        setSelectedExtraIndex(next);
        choices[next]?.focus();
      } else if (event.key === "Enter" && focusedIndex >= 0) {
        event.preventDefault();
        const name = (customize.extras ?? extras)[focusedIndex]?.name;
        if (name) setSelectedExtras(current => current.includes(name) ? current.filter(extra => extra !== name) : [...current, name]);
        const next = choices[focusedIndex + 1];
        if (next) {
          setSelectedExtraIndex(focusedIndex + 1);
          next.focus();
        } else {
          modal.querySelector<HTMLButtonElement>(".modal-actions .primary-button")?.focus();
        }
      } else if (event.key === "F8") {
        event.preventDefault();
        add(customize, (customize.extras ?? extras).filter(extra => selectedExtras.includes(extra.name)));
        setCustomize(null);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setCustomize(null);
      }
    };
    window.addEventListener("keydown", handleCustomizeKeys);
    return () => window.removeEventListener("keydown", handleCustomizeKeys);
  }, [customize, extras, selectedExtraIndex, selectedExtras, add]);

  const completeCheckout = async (payment: { discount: number; payments: PaymentLine[]; change: number; creditCustomer: string; creditDueDate: string }) => {
    if (!cashSession) { setNotice("Não há uma sessão de caixa aberta para esta venda."); return; }
    if (cart.some(item => !item.product.id)) { setNotice("Um produto do pedido não está sincronizado com o catálogo. Atualize o catálogo antes de vender."); return; }
    setCheckoutSaving(true);
    const { data, error } = await supabase.rpc("record_sale_with_customer", {
      p_cash_session_id: cashSession.id,
      p_discount: payment.discount,
      p_change: payment.change,
      p_credit_customer: payment.creditCustomer || null,
      p_credit_due_date: payment.creditDueDate || null,
      p_items: cart.map(item => ({ product_id: item.product.id, extras: item.extras })),
      p_payments: payment.payments,
      p_customer_id: currentSaleCustomer?.id ?? null,
      p_delivery_address: currentDeliveryAddress || null,
      p_is_delivery: currentSaleDelivery,
    });
    setCheckoutSaving(false);
    if (error || !data) { setNotice(error?.message.includes("discount") ? "Somente uma administradora pode aplicar desconto." : error?.message || "Não foi possível registrar a venda."); return; }
    setClosedSale({ items: [...cart], total: Number(data.total), id: data.receipt_number, customer: currentSaleCustomer, delivery: currentSaleDelivery, deliveryAddress: currentDeliveryAddress, ...payment });
    setCurrentSaleCustomer(null);
    setCurrentSaleDelivery(false);
    setCurrentDeliveryAddress("");
    setCouponStarted(false);
    setCart([]);
    setCheckoutOpen(false);
  };
  useEffect(() => {
    const receipt = document.querySelector<HTMLElement>(".sale-receipt");
    if (!receipt || !closedSale) return;
    receipt.querySelector(".coupon-receipt-identity")?.remove();
    const identity = document.createElement("div");
    identity.className = "coupon-receipt-identity";
    const label = document.createElement("b");
    label.textContent = "IDENTIFICAÇÃO DO CUPOM";
    const detail = document.createElement("span");
    detail.textContent = closedSale.customer ? `${closedSale.customer.name} · WhatsApp ${closedSale.customer.whatsapp}` : "CUPOM SEM IDENTIFICAÇÃO";
    identity.append(label, detail);
    if (closedSale.delivery) {
      const delivery = document.createElement("span");
      delivery.textContent = `DELIVERY${closedSale.deliveryAddress ? ` · ${closedSale.deliveryAddress}` : ""}`;
      identity.append(delivery);
    }
    receipt.insertBefore(identity, receipt.querySelector(".receipt-items"));
    return () => identity.remove();
  }, [closedSale]);
  const totalOf = (item: CartItem) => item.product.price + item.extras.reduce((sum, e) => sum + e.price, 0);
  const openForm = (type: "product" | "extra", product?: Product) => { setEditingProduct(product ?? null); setFormName(product?.name ?? ""); setFormPrice(product ? String(product.price) : ""); setFormCategory(product?.category.split(" • ")[0] ?? "Açaí"); setFormCombo(product?.kind === "combo" || Boolean(product?.category.includes("Combo"))); setFormExtras(product?.extras?.map(extra => extra.name) ?? []); setDialog(type); };
  useEffect(() => {
    if (role !== "admin" || active !== "Produtos & estoque") return;
    const rows = Array.from(document.querySelectorAll<HTMLElement>(".catalog-list-row"));
    rows.forEach((row, index) => {
      const product = products[index];
      row.querySelectorAll(":scope > .product-status-toggle, :scope > .product-edit-trigger").forEach(element => element.remove());
      if (!product?.id) return;
      let actions = row.querySelector<HTMLDivElement>(".product-row-actions");
      if (!actions) {
        actions = document.createElement("div");
        actions.className = "product-row-actions";
        const statusButton = document.createElement("button");
        statusButton.type = "button";
        statusButton.className = "product-status-toggle";
        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "product-edit-trigger";
        editButton.textContent = "Alterar";
        actions.append(statusButton, editButton);
        row.append(actions);
      }
      const button = actions.querySelector<HTMLButtonElement>(".product-status-toggle")!;
      button.textContent = product.is_active === false ? "Reativar" : "Inativar";
      button.setAttribute("aria-label", `${product.is_active === false ? "Reativar" : "Inativar"} ${product.name}`);
    });
    const handleProductRow = async (event: MouseEvent) => {
      if (role !== "admin" || active !== "Produtos & estoque") return;
      const target = event.target as HTMLElement;
      const row = target.closest<HTMLElement>(".catalog-list-row");
      if (!row) return;
      const rowIndex = rows.indexOf(row);
      const product = products[rowIndex];
      if (!product?.id) return;
      if (target.closest(".product-status-toggle")) {
        event.stopPropagation();
        const nextActive = product.is_active === false;
        const { error } = await supabase.rpc("set_product_active", { p_product_id: product.id, p_is_active: nextActive });
        if (error) { setNotice("Não foi possível alterar a situação do produto."); return; }
        const update = (items: Product[]) => items.map(item => item.id === product.id ? { ...item, is_active: nextActive } : item);
        setProducts(update);
        setCatalogProducts(update);
        setNotice(nextActive ? "Produto reativado e disponível no PDV." : "Produto inativado e removido do PDV.");
        window.setTimeout(() => setNotice(""), 3000);
        return;
      }
      openForm("product", product);
    };
    document.addEventListener("click", handleProductRow);
    return () => document.removeEventListener("click", handleProductRow);
  }, [active, products, role]);
  const startNewSale = () => {
    if (active === "PDV" && cart.length) {
      setNotice("Finalize ou limpe o pedido atual antes de iniciar outra venda.");
      window.setTimeout(() => setNotice(""), 3200);
      return;
    }
    setCouponStartOpen(true);
  };
  const openCoupon = (selection: CouponSelection) => {
    setCurrentSaleCustomer(selection.customer);
    setCurrentSaleDelivery(selection.delivery);
    setCurrentDeliveryAddress(selection.deliveryAddress);
    setCouponStarted(true);
    setCart([]);
    setClosedSale(null);
    setCouponStartOpen(false);
    setActive("PDV");
    setNotice(selection.delivery ? "Cupom iniciado para delivery." : selection.customer ? `Cupom identificado para ${selection.customer.name}.` : "Cupom sem identificação iniciado.");
    window.setTimeout(() => setNotice(""), 3200);
  };
  const cancelCouponStart = () => {
    setCouponStartOpen(false);
    if (!couponStarted && active === "PDV") setActive(role === "admin" ? "Visão geral" : "Vendas");
  };
  useEffect(() => {
    if (active === "PDV" && !couponStarted && !closedSale) setCouponStartOpen(true);
  }, [active, couponStarted, closedSale]);

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}><div className="brand-lockup"><div className="brand-mark">a<span>ç</span></div><div><strong>AÇAÍ DO<br/>CHALALA</strong><small>Sistema de Gestão e Vendas</small></div><button className="mobile-close" onClick={() => setMobileMenu(false)} aria-label="Fechar menu"><X size={18}/></button></div><div className="store-select"><span className="store-dot"/><span><b>Loja principal</b><small>Caixa 01 · Aberto</small></span><ChevronDown size={16}/></div><p className="nav-caption">MENU PRINCIPAL</p><nav>{visibleNavItems.map(item => <button key={item.label} onClick={() => { setActive(item.label); setMobileMenu(false); }} className={`nav-item ${active === item.label ? "selected" : ""}`}><item.icon size={19}/><span>{item.label}</span>{item.label === "PDV" && <span className="live-dot"/>}</button>)}</nav><div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><Coffee size={18}/></div><div><b>Precisa de ajuda?</b><span>Fale com a gente</span></div><a href="https://wa.me/553287026461" target="_blank" rel="noreferrer" aria-label="Fale pelo WhatsApp">↗</a></div><div className="user-row"><div className="avatar">{initials}</div><div><b>{displayName}</b><small>{role === "admin" ? "Administradora" : "Operadora"}</small></div><button aria-label="Sair" title="Sair" onClick={async () => { const { error } = await supabase.auth.signOut({ scope: "local" }); if (error) { setNotice("Não foi possível encerrar a sessão."); return; } window.location.assign("/login"); }}><LogOut size={16}/></button></div></div></aside>
    {mobileMenu && <button className="mobile-scrim" aria-label="Fechar menu" onClick={() => setMobileMenu(false)}/>}
    <main className="main-area"><header className="topbar"><div className="topbar-left"><button className="menu-trigger" onClick={() => setMobileMenu(true)} aria-label="Abrir menu"><Menu/></button><div className="crumb">Açaí do Chalala <span>/</span> <b>{active}</b></div></div><div className="top-actions"><div className="today"><CalendarDays size={16}/> <span>Quarta-feira, 18 de junho</span></div><button className="icon-button notification" aria-label="Notificações"><Bell size={19}/><i/></button><div className="top-user"><div className="avatar">{initials}</div><ChevronDown size={15}/></div></div></header>
      <div className="page-content"><div className="page-heading"><div><div className="eyebrow">QUARTA-FEIRA, 18 JUNHO 2025 <span className="status-pill"><i/> Loja aberta</span></div><h1>{active === "Visão geral" ? "Bom dia, Mariana" : active}</h1><p>{active === "Visão geral" ? "Aqui está o resumo da sua loja hoje." : `Acompanhe e gerencie ${active.toLowerCase()} da sua loja.`}</p></div><button className="primary-button" onClick={startNewSale}><Plus size={17}/> Nova venda</button></div>
        {active === "Visão geral" ? <><section className="stats-grid"><article className="stat-card"><div className="stat-top"><span>Vendas de hoje</span><span className="stat-icon purple"><Banknote size={19}/></span></div><strong>R$ 1.284,50</strong><div className="stat-foot"><span className="trend"><ArrowUpRight size={14}/> 12,8%</span><span>vs. ontem</span></div></article><article className="stat-card"><div className="stat-top"><span>Pedidos realizados</span><span className="stat-icon green"><ShoppingBag size={18}/></span></div><strong>38 <small>pedidos</small></strong><div className="stat-foot"><span className="trend"><ArrowUpRight size={14}/> 8,2%</span><span>vs. ontem</span></div></article><article className="stat-card"><div className="stat-top"><span>Ticket médio</span><span className="stat-icon lilac"><Activity size={18}/></span></div><strong>R$ 33,80</strong><div className="stat-foot"><span className="trend"><ArrowUpRight size={14}/> 4,5%</span><span>vs. ontem</span></div></article><article className="stat-card"><div className="stat-top"><span>Produtos no estoque</span><span className="stat-icon orange"><Boxes size={18}/></span></div><strong>{products.length} <small>itens</small></strong><div className="stat-foot"><span>{extras.length} complementos</span></div></article></section><section className="dashboard-grid"><article className="panel sales-panel"><div className="panel-heading"><div><h2>Visão de vendas</h2><p>Acompanhe o desempenho da sua loja</p></div><button className="select-button">Esta semana <ChevronDown size={15}/></button></div><div className="chart-summary"><strong>R$ 8.462,90</strong><span className="trend"><ArrowUpRight size={14}/> 16,4%</span><small>em relação à semana passada</small></div><div className="chart"><div className="y-labels"><span>R$ 2.000</span><span>R$ 1.500</span><span>R$ 1.000</span><span>R$ 500</span><span>R$ 0</span></div><div className="chart-area"><div className="chart-grid"><i/><i/><i/><i/><i/></div><svg viewBox="0 0 680 165" preserveAspectRatio="none" aria-label="Gráfico de vendas da semana"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#7b2da0" stopOpacity=".18"/><stop offset="1" stopColor="#7b2da0" stopOpacity="0"/></linearGradient></defs><path d="M0 135 C40 128 55 84 100 98 S160 120 195 78 S250 60 290 85 S345 40 390 52 S445 102 485 63 S540 79 580 31 S635 56 680 16 V165 H0Z" fill="url(#fill)"/><path d="M0 135 C40 128 55 84 100 98 S160 120 195 78 S250 60 290 85 S345 40 390 52 S445 102 485 63 S540 79 580 31 S635 56 680 16" fill="none" stroke="#74309a" strokeWidth="3" vectorEffect="non-scaling-stroke"/></svg><div className="x-labels"><span>Qui</span><span>Sex</span><span>Sáb</span><span>Dom</span><span>Seg</span><span>Ter</span><span>Qua</span></div></div></div></article><article className="panel quick-panel"><div className="panel-heading"><div><h2>Acesso rápido</h2><p>O que você deseja fazer?</p></div></div><div className="quick-actions"><button onClick={startNewSale}><span className="quick-icon qi-purple"><ShoppingCart size={20}/></span><b>Nova venda</b><small>Iniciar atendimento</small><span className="quick-arrow">↗</span></button><button onClick={() => setActive("Produtos & estoque")}><span className="quick-icon qi-lilac"><Boxes size={20}/></span><b>Adicionar produto</b><small>Atualizar seu catálogo</small><span className="quick-arrow">↗</span></button><button onClick={() => setActive("Clientes")}><span className="quick-icon qi-green"><Users size={20}/></span><b>Novo cliente</b><small>Cadastrar consumidor</small><span className="quick-arrow">↗</span></button></div></article></section><section className="panel orders-panel"><div className="panel-heading"><div><h2>Vendas recentes</h2><p>As últimas movimentações da sua loja</p></div><button className="text-button" onClick={() => setActive("Vendas")}>Ver todas <span>→</span></button></div><div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Horário</th><th>Pagamento</th><th>Valor</th><th>Status</th></tr></thead><tbody><tr><td><b className="order-id">#CH-1048</b></td><td>Ana Beatriz</td><td>14:32</td><td>Cartão</td><td className="amount">R$ 42,00</td><td><span className="order-status done"><i/> Concluída</span></td></tr><tr><td><b className="order-id">#CH-1047</b></td><td>Rafael Lima</td><td>14:18</td><td>Dinheiro</td><td className="amount">R$ 28,50</td><td><span className="order-status done"><i/> Concluída</span></td></tr></tbody></table></div></section></> : active === "PDV" ? <section className="pos-layout"><div className="panel catalog-panel"><div className="catalog-top"><div><h2>Monte seu pedido</h2><p>Selecione os produtos para adicionar à venda</p></div><span className="cash-chip"><span/> Caixa 01</span></div><div className="catalog-controls"><div className="search-field"><Search size={17}/><input placeholder="Buscar produto..." value={query} onChange={e => setQuery(e.target.value)}/></div><button className="filter-button" onClick={() => openForm("extra")}>+ Complemento</button></div><div className="category-row"><button className="category active-category">Todos <span>{products.length}</span></button><button className="category">Açaí</button><button className="category">Bebidas</button><button className="category">Combos</button></div><div className="product-grid">{filtered.map(p => <article className="product-card" key={`${p.name}-${p.category}`}><div className={`product-art art-${p.color}`}><span>{p.emoji}</span><button aria-label={`Adicionar ${p.name}`} onClick={() => beginProduct(p)}><Plus size={17}/></button></div><div className="product-info"><small>{p.category}</small><b>{p.name}</b><strong>{money(p.price)}</strong></div></article>)}</div></div><aside className="panel cart-panel"><div className="cart-header"><div><h2>Pedido atual</h2><p>Comanda #CH-1049</p></div><button className="clear-button" onClick={() => setCart([])}>Limpar</button></div><div className="customer-select"><span className="customer-add"><Users size={16}/></span><span><b>Cliente avulso</b><small>Selecionar cliente</small></span><ChevronDown size={16}/></div><div className="cart-items">{cart.length ? cart.map(item => <div className="cart-item" key={item.id}><span className={`mini-product art-${item.product.color}`}>{item.product.emoji}</span><div className="cart-item-info"><b>{item.product.name}</b><small>{money(item.product.price)}{item.extras.length ? ` + ${item.extras.map(e => e.name).join(", ")}` : ""}</small></div><div className="quantity-control"><button aria-label={`Remover ${item.product.name}`} onClick={() => setCart(c => c.filter(i => i.id !== item.id))}><Minus size={13}/></button><span>1</span><button aria-label={`Duplicar ${item.product.name}`} onClick={() => add(item.product, item.extras)}><Plus size={13}/></button></div><b className="line-total">{money(totalOf(item))}</b></div>) : <div className="empty-cart"><div><ShoppingCart size={23}/></div><b>Seu pedido está vazio</b><span>Adicione produtos para começar</span></div>}</div><div className="cart-bottom"><button className="discount-button" onClick={() => setNotice("Desconto disponível no fechamento da venda.")}><Plus size={15}/> Adicionar desconto</button><div className="subtotal-line"><span>Subtotal</span><b>{money(cartTotal)}</b></div><div className="total-line"><b>Total</b><strong>{money(cartTotal)}</strong></div><button className="finish-button" disabled={!cart.length} onClick={pay}><Check size={18}/> Cobrar pedido <span>{money(cartTotal)}</span></button><div className="shortcut-note">F9 · Cobrar pedido</div><div className="secure-note"><Clock3 size={13}/> Caixa aberto desde 08:02</div></div></aside></section> : active === "Equipe" && role === "admin" ? <TeamManagement/> : active === "Produtos & estoque" && role === "admin" ? <section className="panel inventory-panel"><div className="catalog-top"><div><h2>Catálogo e estoque</h2><p>Cadastre produtos, combos e complementos cobrados à parte.</p></div></div><div className="inventory-actions"><button className="primary-button" onClick={() => openForm("product")}><Plus size={16}/> Novo produto</button><button className="secondary-action" onClick={() => openForm("extra")}><Plus size={16}/> Novo complemento</button></div><div className="catalog-list">{products.map(p => <div className="catalog-list-row" key={`${p.name}-${p.category}`}><span className={`mini-product art-${p.color}`}>{p.emoji}</span><span><b>{p.name}</b><small>{p.category} {p.kind === "combo" ? "· Combo" : ""}</small></span><strong>{money(p.price)}</strong><span className="extra-summary">{p.extras?.length ? `${p.extras.length} adicionais` : "Sem adicionais"}</span></div>)}</div><h3 className="extra-heading">Complementos cobrados à parte</h3><div className="extras-list">{extras.map(extra => <span key={extra.name}>{extra.name}<b>+ {money(extra.price)}</b></span>)}</div></section> : <section className="panel coming-panel"><div className="coming-icon"><ActiveIcon active={active}/></div><h2>{active}</h2><p>Seu espaço de gestão está pronto para acompanhar a operação do AÇAÍ DO CHALALA.</p><div className="coming-stats"><span><b>38</b><small>registros de hoje</small></span><button className="primary-button" onClick={startNewSale}><Plus size={16}/> Nova venda</button></div></section>}
        <footer className="footer"><span><b>AÇAÍ DO CHALALA</b><i/> Sistema PDV</span><div><a href="https://wa.me/553287026461" target="_blank" rel="noreferrer">WhatsApp: (32) 9-8702-6461</a><a href="https://www.instagram.com/acai_do_chalala/" target="_blank" rel="noreferrer">Instagram: @acai_do_chalala</a></div></footer></div></main>
    {dialog && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setDialog(null); }}><form className="catalog-modal" onSubmit={submitCatalog}><button type="button" className="modal-close" onClick={() => setDialog(null)} aria-label="Fechar"><X size={18}/></button><div className="modal-kicker">CATÁLOGO AÇAÍ DO CHALALA</div><h2>{dialog === "product" ? "Cadastrar produto ou combo" : "Cadastrar complemento"}</h2><p>{dialog === "product" ? "Defina preço base e adicionais opcionais para a venda." : "Este valor será somado ao produto no pedido."}</p><label>Nome<input autoFocus required value={formName} onChange={e => setFormName(e.target.value)} placeholder={dialog === "product" ? "Ex.: Açaí completo" : "Ex.: Nutella"}/></label><div className="form-row"><label>Preço (R$)<input required type="number" min="0" step="0.01" value={formPrice} onChange={e => setFormPrice(e.target.value)} placeholder="0,00"/></label>{dialog === "product" && <label>Categoria<select value={formCategory} onChange={e => setFormCategory(e.target.value)}><option>Açaí</option><option>Bebidas</option><option>Sobremesas</option></select></label>}</div>{dialog === "product" && <><label className="check-label"><input type="checkbox" checked={formCombo} onChange={e => setFormCombo(e.target.checked)}/> Este cadastro é um combo</label><div className="form-extras"><b>Complementos opcionais disponíveis</b><small>Marque os adicionais que podem ser escolhidos neste produto.</small><div>{extras.map(extra => <label key={extra.name} className="extra-check"><input type="checkbox" checked={formExtras.includes(extra.name)} onChange={e => setFormExtras(current => e.target.checked ? [...current, extra.name] : current.filter(n => n !== extra.name))}/><span>{extra.name}</span><b>+ {money(extra.price)}</b></label>)}</div></div></>}<div className="modal-actions"><button type="button" className="secondary-action" onClick={() => setDialog(null)}>Cancelar</button><button type="submit" className="primary-button"><Check size={15}/> Salvar cadastro</button></div></form></div>}
    {customize && <div className="modal-backdrop"><section className="catalog-modal customize-modal"><button className="modal-close" onClick={() => setCustomize(null)} aria-label="Fechar"><X size={18}/></button><div className="modal-kicker">PERSONALIZE SEU PEDIDO</div><h2>{customize.name}</h2><p>Escolha os complementos; cada adicional é cobrado por fora.</p><div className="customize-base"><span>Produto base</span><b>{money(customize.price)}</b></div><div className="customize-extras">{(customize.extras ?? extras).map(extra => <label key={extra.name}><input type="checkbox" checked={selectedExtras.includes(extra.name)} onChange={e => setSelectedExtras(current => e.target.checked ? [...current, extra.name] : current.filter(n => n !== extra.name))}/><span>{extra.name}</span><b>+ {money(extra.price)}</b></label>)}</div><div className="customize-total"><span>Total deste item</span><b>{money(customize.price + (customize.extras ?? extras).filter(e => selectedExtras.includes(e.name)).reduce((sum, e) => sum + e.price, 0))}</b></div><div className="modal-actions"><button className="secondary-action" onClick={() => setCustomize(null)}>Cancelar</button><button className="primary-button" onClick={() => { add(customize, (customize.extras ?? extras).filter(e => selectedExtras.includes(e.name))); setCustomize(null); }}><Plus size={15}/> Adicionar ao pedido</button></div></section></div>}
    {checkoutOpen && <PaymentCheckout total={cartTotal} saving={checkoutSaving} onCancel={() => setCheckoutOpen(false)} onComplete={completeCheckout} />}
    {notice && <div className="toast-message success-toast"><Check size={17}/>{notice}<button onClick={() => setNotice("")} aria-label="Fechar"><X size={15}/></button></div>}
    {closedSale && <div className="receipt-backdrop"><section className="sale-receipt" role="dialog" aria-modal="true" aria-labelledby="receipt-title"><div className="receipt-logo">AÇAÍ DO CHALALA</div><h2 id="receipt-title">Comprovante não fiscal</h2><span>Venda #{closedSale.id} · {new Date().toLocaleDateString("pt-BR")}</span><strong>Venda concluída com sucesso</strong><div className="receipt-items"><div className="receipt-columns"><span>ITEM</span><span>QTD</span><span>VALOR</span></div>{closedSale.items.map(item => <div className="receipt-line" key={item.id}><span className="receipt-description"><b>{item.product.name}</b>{item.extras.map(extra => <small key={extra.name}>+ {extra.name} ({money(extra.price)})</small>)}</span><span>1</span><b>{money(totalOf(item))}</b></div>)}<div className="receipt-total"><span>DESCONTO</span><b>− {money(closedSale.discount)}</b></div>{closedSale.payments.map((payment, index) => <div className="receipt-total" key={index}><span>{payment.method.toUpperCase()}</span><b>{money(payment.amount)}</b></div>)}{closedSale.change > 0 && <div className="receipt-total"><span>TROCO</span><b>{money(closedSale.change)}</b></div>}{closedSale.creditCustomer && <div className="receipt-total"><span>CLIENTE / VENCIMENTO</span><b>{closedSale.creditCustomer} · {closedSale.creditDueDate}</b></div>}<div className="receipt-total"><span>TOTAL</span><b>{money(closedSale.total)}</b></div></div><div className="receipt-actions"><button onClick={() => window.print()}><Printer size={15}/> Imprimir / Salvar PDF</button><button className="receipt-close" onClick={() => setClosedSale(null)}>Fechar</button></div></section></div>}
    <CouponStartDialog open={couponStartOpen} onCancel={cancelCouponStart} onConfirm={openCoupon} />
    <SalesManagement active={active === "Vendas"} />
    <CustomerManagement active={active === "Clientes"} />
    <ExtraManagement active={active === "Produtos & estoque" && role === "admin"} extras={extras} onSaved={saved => setExtras(current => [...current.filter(extra => extra.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)))} />
  </div>;
}
function ActiveIcon({ active }: { active: string }) { const Icon = active === "Clientes" ? Users : active === "Financeiro" ? Wallet : active === "Vendas" ? Banknote : Boxes; return <Icon size={27}/>; }
