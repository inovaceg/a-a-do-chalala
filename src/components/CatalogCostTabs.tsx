import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./catalog-cost-tabs.css";

type CostItem = { id?: string; name: string; price: number; cost_price?: number; category?: string; kind?: string; is_active?: boolean };
const money = (value: number) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function CatalogCostTabs({ active, products, extras }: { active: boolean; products: CostItem[]; extras: CostItem[] }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [activeTab, setActiveTab] = useState<"catalog" | "costs">("catalog");
  const [costGroup, setCostGroup] = useState<"products" | "extras">("products");

  useEffect(() => {
    if (!active) { setTarget(null); return; }
    const panel = document.querySelector<HTMLElement>(".inventory-panel");
    if (!panel) return;
    const mount = document.createElement("div");
    mount.className = "catalog-cost-tabs-mount";
    panel.querySelector(".catalog-top")?.after(mount);
    setTarget(mount);
    return () => { panel.classList.remove("showing-cost-report"); mount.remove(); };
  }, [active]);

  useEffect(() => {
    const panel = document.querySelector<HTMLElement>(".inventory-panel");
    if (!panel) return;
    panel.classList.toggle("showing-cost-report", activeTab === "costs");
  }, [activeTab]);

  if (!target) return null;

  const productsList = products.filter(item => item.is_active !== false).map(item => ({ ...item, type: item.kind === "combo" ? "Combo" : "Produto" }));
  const extrasList = extras.filter(item => item.is_active !== false).map(item => ({ ...item, type: "Complemento" }));
  const items = (costGroup === "products" ? productsList : extrasList).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const groupLabel = costGroup === "products" ? "Produtos e combos" : "Complementos";

  return createPortal(<>
    <div className="catalog-cost-tabs" role="tablist" aria-label="Visualização do catálogo">
      <button role="tab" aria-selected={activeTab === "catalog"} className={activeTab === "catalog" ? "active" : ""} onClick={() => setActiveTab("catalog")}>Itens cadastrados</button>
      <button role="tab" aria-selected={activeTab === "costs"} className={activeTab === "costs" ? "active" : ""} onClick={() => setActiveTab("costs")}>Custos e markup</button>
    </div>
    {activeTab === "costs" && <section className="catalog-cost-report" role="tabpanel">
      <div className="catalog-cost-report-heading"><div><h3>Custos e preços do catálogo</h3><p>Markup sobre o custo: (preço de venda − custo) ÷ custo × 100.</p></div></div>
      <div className="catalog-cost-groups" role="tablist" aria-label="Separar produtos e complementos">
        <button role="tab" aria-selected={costGroup === "products"} className={costGroup === "products" ? "active" : ""} onClick={() => setCostGroup("products")}>Produtos e combos <span>{productsList.length}</span></button>
        <button role="tab" aria-selected={costGroup === "extras"} className={costGroup === "extras" ? "active" : ""} onClick={() => setCostGroup("extras")}>Complementos <span>{extrasList.length}</span></button>
      </div>
      <div className="catalog-cost-section-title"><h4>{groupLabel}</h4><span>{items.length} {items.length === 1 ? "cadastro" : "cadastros"}</span></div>
      {items.length ? <div className="catalog-cost-table-wrap"><table className="catalog-cost-table"><thead><tr><th>Item</th><th>Tipo</th><th>Custo unitário</th><th>Preço de venda</th><th>Ganho unitário</th><th>Markup</th></tr></thead><tbody>{items.map((item, index) => {
        const cost = Number(item.cost_price ?? 0);
        const price = Number(item.price);
        const markup = cost > 0 ? ((price - cost) / cost) * 100 : null;
        return <tr key={`${item.type}-${item.id ?? item.name}-${index}`}><td><b>{item.name}</b>{item.category && <small>{item.category}</small>}</td><td><span className={`catalog-cost-type ${item.type.toLowerCase()}`}>{item.type}</span></td><td>{money(cost)}</td><td>{money(price)}</td><td className={price - cost >= 0 ? "cost-positive" : "cost-negative"}>{money(price - cost)}</td><td>{markup === null ? <span className="markup-na">—</span> : <b className={markup >= 0 ? "cost-positive" : "cost-negative"}>{markup.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</b>}</td></tr>;
      })}</tbody></table></div> : <div className="catalog-cost-empty">Não há {costGroup === "products" ? "produtos ou combos" : "complementos"} ativos cadastrados.</div>}
    </section>}
  </>, target);
}
