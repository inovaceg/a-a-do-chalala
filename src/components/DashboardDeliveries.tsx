import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bike, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import "./dashboard-deliveries.css";

type Delivery = { id: string; receipt_number: string; created_at: string; customer_name: string | null; delivery_address: string | null; customers?: { neighborhood: string | null } | { neighborhood: string | null }[] | null };
const time = (value: string) => new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export default function DashboardDeliveries({ active }: { active: boolean }) {
  const [todayCount, setTodayCount] = useState(0);
  const [recent, setRecent] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [dashboardGrid, setDashboardGrid] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setDashboardGrid(active ? document.querySelector<HTMLElement>(".dashboard-grid") : null);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const [todayResult, recentResult] = await Promise.all([
        supabase.from("sales").select("id", { count: "exact", head: true }).eq("is_delivery", true).eq("status", "completed").gte("created_at", start),
        supabase.from("sales").select("id,receipt_number,created_at,customer_name,delivery_address,customers(neighborhood)").eq("is_delivery", true).eq("status", "completed").order("created_at", { ascending: false }).limit(10),
      ]);
      if (!mounted) return;
      setTodayCount(todayResult.count ?? 0);
      setRecent((recentResult.data ?? []) as unknown as Delivery[]);
      setLoading(false);
    };
    void load();
    return () => { mounted = false; };
  }, [active]);

  if (!active || !dashboardGrid) return null;
  return createPortal(<section className="dashboard-delivery-grid" aria-label="Resumo das entregas">
    <article className="dashboard-delivery-card delivery-count-card"><div className="dashboard-delivery-heading"><span className="dashboard-delivery-icon"><Bike size={19}/></span><div><h2>Entregas de hoje</h2><p>Pedidos delivery concluídos</p></div></div><strong>{loading ? "—" : todayCount}</strong><small>entregas realizadas hoje</small></article>
    <article className="dashboard-delivery-card recent-deliveries-card"><div className="dashboard-delivery-heading"><span className="dashboard-delivery-icon"><MapPin size={19}/></span><div><h2>10 entregas recentes</h2><p>Últimos pedidos delivery concluídos</p></div></div>{loading ? <div className="dashboard-delivery-empty">Carregando entregas…</div> : recent.length ? <ol>{recent.map(delivery => {
      const customer = Array.isArray(delivery.customers) ? delivery.customers[0] : delivery.customers;
      const neighborhood = customer?.neighborhood || delivery.delivery_address?.split(",").at(-3)?.trim() || "Bairro não informado";
      return <li key={delivery.id}><div><b>{delivery.customer_name || "Cliente sem identificação"}</b><span>{neighborhood}</span></div><time>{time(delivery.created_at)}</time></li>;
    })}</ol> : <div className="dashboard-delivery-empty">Nenhuma entrega concluída ainda.</div>}</article>
  </section>, dashboardGrid);
}
