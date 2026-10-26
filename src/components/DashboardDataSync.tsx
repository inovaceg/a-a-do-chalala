import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const percentChange = (current: number, previous: number) => previous ? `${current >= previous ? "+" : ""}${((current - previous) / previous * 100).toFixed(1)}%` : current ? "Novo" : "0%";

export default function DashboardDataSync({ active, productCount, extraCount }: { active: boolean; productCount: number; extraCount: number }) {
  useEffect(() => {
    if (!active) return;
    let current = true;
    const updateDashboard = async () => {
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setHours(0, 0, 0, 0);
      startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
      const previousWeek = new Date(startOfWeek);
      previousWeek.setDate(previousWeek.getDate() - 7);
      document.querySelectorAll<HTMLElement>(".stats-grid .stat-card > strong, .chart-summary > strong").forEach(element => { element.textContent = "Carregando…"; });
      const recentBody = document.querySelector<HTMLElement>(".orders-panel tbody");
      recentBody?.replaceChildren();
      const [{ data: periodData, error: periodError }, { data: recentData, error: recentError }] = await Promise.all([
        supabase.from("sales").select("id,total,status,created_at").gte("created_at", previousWeek.toISOString()).lt("created_at", now.toISOString()).order("created_at", { ascending: false }).limit(2000),
        supabase.from("sales").select("id,receipt_number,total,status,created_at,customer_name,sale_payments(method)").order("created_at", { ascending: false }).limit(5),
      ]);
      if (!current) return;
      if (periodError || recentError) {
        document.querySelectorAll<HTMLElement>(".stats-grid .stat-card > strong, .chart-summary > strong").forEach(element => { element.textContent = "—"; });
        return;
      }
      const sales = periodData ?? [];
      const completed = sales.filter(sale => sale.status === "completed");
      const todayKey = dayKey(now);
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = dayKey(yesterday);
      const todaySales = completed.filter(sale => dayKey(new Date(sale.created_at)) === todayKey);
      const yesterdaySales = completed.filter(sale => dayKey(new Date(sale.created_at)) === yesterdayKey);
      const todayTotal = todaySales.reduce((sum, sale) => sum + Number(sale.total), 0);
      const yesterdayTotal = yesterdaySales.reduce((sum, sale) => sum + Number(sale.total), 0);
      const todayAverage = todaySales.length ? todayTotal / todaySales.length : 0;
      const yesterdayAverage = yesterdaySales.length ? yesterdayTotal / yesterdaySales.length : 0;
      const cards = document.querySelectorAll<HTMLElement>(".stats-grid .stat-card");
      const metricValues = [money(todayTotal), `${todaySales.length} pedidos`, money(todayAverage), `${productCount} itens`];
      const changes = [percentChange(todayTotal, yesterdayTotal), percentChange(todaySales.length, yesterdaySales.length), percentChange(todayAverage, yesterdayAverage)];
      cards.forEach((card, index) => {
        const value = card.querySelector<HTMLElement>(":scope > strong");
        if (value && metricValues[index]) value.textContent = metricValues[index];
        const trend = card.querySelector<HTMLElement>(".stat-foot .trend");
        if (trend && changes[index]) trend.textContent = changes[index];
      });
      const extraFoot = cards[3]?.querySelector<HTMLElement>(".stat-foot > span");
      if (extraFoot) extraFoot.textContent = `${extraCount} complementos ativos`;
      const weeklySales = completed.filter(sale => new Date(sale.created_at) >= startOfWeek);
      const weeklyTotal = weeklySales.reduce((sum, sale) => sum + Number(sale.total), 0);
      const oldWeeklySales = completed.filter(sale => new Date(sale.created_at) >= previousWeek && new Date(sale.created_at) < startOfWeek);
      const oldWeeklyTotal = oldWeeklySales.reduce((sum, sale) => sum + Number(sale.total), 0);
      const weeklyValue = document.querySelector<HTMLElement>(".chart-summary > strong");
      if (weeklyValue) weeklyValue.textContent = money(weeklyTotal);
      const weeklyTrend = document.querySelector<HTMLElement>(".chart-summary .trend");
      if (weeklyTrend) weeklyTrend.textContent = `${percentChange(weeklyTotal, oldWeeklyTotal)} vs. semana anterior`;
      const days = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + index);
        const key = dayKey(date);
        return { date, total: weeklySales.filter(sale => dayKey(new Date(sale.created_at)) === key).reduce((sum, sale) => sum + Number(sale.total), 0) };
      });
      const maximum = Math.max(...days.map(day => day.total), 1);
      const axisMaximum = Math.max(500, Math.ceil(maximum / 500) * 500);
      document.querySelectorAll<HTMLElement>(".chart .y-labels span").forEach((label, index) => { label.textContent = money(axisMaximum * (4 - index) / 4); });
      const linePath = days.map((day, index) => `${index ? "L" : "M"}${index * (680 / 6)} ${150 - day.total / maximum * 130}`).join(" ");
      const svgPaths = document.querySelectorAll<SVGPathElement>(".chart-area svg path");
      if (svgPaths[0]) svgPaths[0].setAttribute("d", `${linePath} L680 165 L0 165 Z`);
      if (svgPaths[1]) svgPaths[1].setAttribute("d", linePath);
      const labels = document.querySelectorAll<HTMLElement>(".chart-area .x-labels span");
      labels.forEach((label, index) => { if (days[index]) label.textContent = days[index].date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""); });
      const recentBody = document.querySelector<HTMLElement>(".orders-panel tbody");
      if (recentBody) {
        recentBody.replaceChildren();
        (recentData ?? []).forEach(sale => {
          const row = document.createElement("tr");
          const cells = [
            `#${sale.receipt_number}`,
            sale.customer_name || "Cliente avulso",
            new Date(sale.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
            [...new Set((sale.sale_payments ?? []).map(payment => payment.method))].join(", ") || "—",
          ];
          cells.forEach((text, index) => {
            const cell = document.createElement("td");
            if (index === 0) {
              const order = document.createElement("b");
              order.className = "order-id";
              order.textContent = text;
              cell.append(order);
            } else {
              cell.textContent = text;
            }
            row.append(cell);
          });
          const amount = document.createElement("td");
          amount.className = "amount";
          amount.textContent = money(Number(sale.total));
          row.append(amount);
          const statusCell = document.createElement("td");
          const status = document.createElement("span");
          status.className = `order-status ${sale.status === "completed" ? "done" : "cancelled"}`;
          status.textContent = sale.status === "completed" ? "Concluída" : "Cancelada";
          statusCell.append(status);
          row.append(statusCell);
          recentBody.append(row);
        });
      }
      const todayLabel = now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
      const headerDate = document.querySelector<HTMLElement>(".topbar .today span");
      if (headerDate) headerDate.textContent = todayLabel;
      const eyebrow = document.querySelector<HTMLElement>(".page-heading .eyebrow");
      if (eyebrow?.firstChild) eyebrow.firstChild.textContent = todayLabel.toLocaleUpperCase("pt-BR");
    };
    void updateDashboard();
    return () => { current = false; };
  }, [active, productCount, extraCount]);
  return null;
}
