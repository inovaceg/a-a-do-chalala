import { useCallback, useEffect, useMemo, useState } from "react";

import {
    ArrowDownWideNarrow,
    ArrowUpNarrowWide,
    ClipboardList,
    Plus,
    RefreshCw,
    Search,
    X,
} from "lucide-react";

import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import "./comandas.css";
import "./comandas-items.css";
import "./comanda-reopen.css";
import "./comanda-customer-search.css";
type TabStatus = "open" | "in_consumption" | "waiting_payment" | "partially_paid" | "closed" | "cancelled";

type Tab = {
    id: string;
    store_id: string;
    tab_number: number;
    customer_id: string | null;
    customer_name: string | null;
    status: TabStatus;
    opened_by: string;
    opened_by_name?: string | null;
    terminal: string | null;
    opened_at: string;
    closed_at: string | null;
};

type CustomerSuggestion = { id: string; name: string; whatsapp: string; birth_date: string | null };

type ProductExtra = {
    id: string;
    name: string;
    price: number;
};

type Product = {
    id: string;
    name: string;
    price: number;
    extras: ProductExtra[];
    is_active: boolean;
};

type Item = {
    id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    extras: ProductExtra[];
    note: string | null;
    status: "active" | "cancelled";
    order_id: string;
    created_at: string;
};

type Order = {
    id: string;
    created_by: string;
    created_at: string;
    production_sent_at: string | null;
    production_print_count: number;
};

type Payment = {
    id: string;
    method: string;
    amount: number;
    change_amount: number;
    received_at: string;
    cash_session_id: string;
};

const labels: Record<TabStatus, string> = {
    open: "Aberta",
    in_consumption: "Em consumo",
    waiting_payment: "Aguardando pagamento",
    partially_paid: "Parcialmente paga",
    closed: "Fechada",
    cancelled: "Cancelada"
};

const activeStatuses: TabStatus[] = ["open", "in_consumption", "waiting_payment", "partially_paid"];

const cashMethods = [
    "Dinheiro",
    "Pix",
    "Cartão de débito",
    "Cartão de crédito",
    "Vale alimentação"
];

const money = (value: number) => Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
});

export default function Comandas(
    {
        active,
        role
    }: {
        active: boolean;
        role: "admin" | "operator";
    }
) {
    const [tabs, setTabs] = useState<Tab[]>([]);
    const [products, setProducts] = useState<Product[]>([]);

    const [selected, setSelected] = useState<Tab | null>(null);
    const [orders, setOrders] = useState<Order[]>([]);
    const [items, setItems] = useState<Item[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [storeId, setStoreId] = useState("");
    const [cashSessionId, setCashSessionId] = useState("");
    const [storeName, setStoreName] = useState("");
    const [operatorNames, setOperatorNames] = useState<Map<string, string>>(new Map());
    const [pendingBalances, setPendingBalances] = useState<Map<string, number>>(new Map());
    const [paidBalances, setPaidBalances] = useState<Map<string, number>>(new Map());
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [search, setSearch] = useState("");
    const [sortNewest, setSortNewest] = useState(true);
    const [openForm, setOpenForm] = useState(false);
    const [customerWhatsapp, setCustomerWhatsapp] = useState("");
    const [customerBirthDate, setCustomerBirthDate] = useState("");
    const [customerName, setCustomerName] = useState("");
    const [customerSuggestions, setCustomerSuggestions] = useState<CustomerSuggestion[]>([]);
    const [productId, setProductId] = useState("");
    const [orderKey, setOrderKey] = useState<string | null>(null);
    const [paymentKey, setPaymentKey] = useState<string | null>(null);
    const [quantity, setQuantity] = useState("1");
    const [note, setNote] = useState("");
    const [extraIds, setExtraIds] = useState<string[]>([]);
    const [paymentMethod, setPaymentMethod] = useState("Dinheiro");
    const [paymentAmount, setPaymentAmount] = useState("");
    const [paymentChange, setPaymentChange] = useState("0");
    const [filter, setFilter] = useState("all");
    const selectedProduct = products.find(product => product.id === productId);

    const load = useCallback(async (silent = false) => {
        if (!active)
            return;

        if (!silent) setLoading(true);
        if (!silent) setError("");

        const {
            data: auth
        } = await supabase.auth.getUser();

        const user = auth.user;

        if (!user) {
            setError("Sessão não encontrada.");
            if (!silent) setLoading(false);
            return;
        }

        const [membership, productData, sessions] = await Promise.all([
            supabase.from("store_memberships").select("store_id,stores(name)").eq("user_id", user.id).limit(1).maybeSingle(),
            supabase.from("products").select("id,name,price,extras,is_active").eq("is_active", true).order("name"),
            supabase.from("cash_sessions").select("id,opened_by").eq("status", "open").order("opened_at", {
                ascending: false
            })
        ]);

        const currentStore = membership.data?.store_id ?? "";
        const tabsData = currentStore ? await supabase.from("tabs").select(
            "id,store_id,tab_number,customer_id,customer_name,status,opened_by,terminal,opened_at,closed_at"
        ).eq("store_id", currentStore).order("opened_at", { ascending: false }).limit(500) : { data: [], error: null };
        const tabsError = tabsData.error;

        const {
            data: operatorTabs,
            error: operatorTabsError
        } = currentStore ? await supabase.rpc("list_store_tabs_with_operator", {
            p_store_id: currentStore
        }) : {
            data: [],
            error: null
        };

        if (membership.error || tabsError || productData.error || sessions.error || operatorTabsError) setError(
            "Não foi possível carregar as comandas. Atualize a tela e tente novamente."
        );

        setStoreId(currentStore);

        setStoreName((membership.data?.stores as unknown as {
            name: string;
        } | null)?.name ?? "Loja");

        setProducts((productData.data ?? []) as Product[]);

        setCashSessionId(
            sessions.data?.find(session => role === "admin" || session.opened_by === user.id)?.id ?? ""
        );

        const currentTabs = (tabsData.data ?? []).filter(tab => tab.store_id === currentStore) as Tab[];
        setTabs(currentTabs);

        const namesById = new Map<string, string>(
            (operatorTabs ?? []).map(tab => [tab.opened_by, tab.opened_by_name ?? ""])
        );
        setOperatorNames(namesById);

        if (currentTabs.length) {
            const {
                data: orderData
            } = await supabase.from("tab_orders").select("id,tab_id").in("tab_id", currentTabs.map(tab => tab.id));

            const orderIds = (orderData ?? []).map(order => order.id);

            const [itemData, paymentData] = await Promise.all([
                orderIds.length ? supabase.from("tab_items").select("order_id,quantity,unit_price,extras,status").in("order_id", orderIds) : Promise.resolve({
                    data: []
                }),
                supabase.from("tab_payments").select("tab_id,amount").in("tab_id", currentTabs.map(tab => tab.id))
            ]);

            const orderTab = new Map((orderData ?? []).map(order => [order.id, order.tab_id]));
            const totals = new Map<string, number>();
            const paid = new Map<string, number>();

            (itemData.data ?? []).filter(item => item.status === "active").forEach(item => {
                const tabId = orderTab.get(item.order_id);

                if (!tabId)
                    return;

                const extrasTotal = ((item.extras ?? []) as ProductExtra[]).reduce((sum, extra) => sum + Number(extra.price), 0);

                totals.set(
                    tabId,
                    (totals.get(tabId) ?? 0) + (Number(item.unit_price) + extrasTotal) * Number(item.quantity)
                );
            });

            (paymentData.data ?? []).forEach(payment => {
                paid.set(payment.tab_id, (paid.get(payment.tab_id) ?? 0) + Number(payment.amount));
                totals.set(payment.tab_id, (totals.get(payment.tab_id) ?? 0) - Number(payment.amount));
            });

            setPendingBalances(new Map([...totals].map(([id, balance]) => [id, Math.max(0, balance)])));
            setPaidBalances(paid);
        } else {
            setPendingBalances(new Map());
            setPaidBalances(new Map());
        }

        if (!silent) setLoading(false);
    }, [active, role]);

    const loadDetail = useCallback(async (tab: Tab) => {
        setSelected(tab);

        const [orderResult, paymentResult] = await Promise.all([
            supabase.from("tab_orders").select("id,created_by,created_at,production_sent_at,production_print_count").eq("tab_id", tab.id).order("created_at"),
            supabase.from("tab_payments").select("id,method,amount,change_amount,received_at,cash_session_id").eq("tab_id", tab.id).order("received_at")
        ]);

        const nextOrders = (orderResult.data ?? []) as Order[];
        setOrders(nextOrders);
        setPayments((paymentResult.data ?? []) as Payment[]);

        if (nextOrders.length) {
            const {
                data
            } = await supabase.from("tab_items").select(
                "id,product_name,quantity,unit_price,extras,note,status,order_id,created_at"
            ).in("order_id", nextOrders.map(order => order.id)).order("created_at");

            setItems((data ?? []) as Item[]);
        } else
            setItems([]);

        if (orderResult.error || paymentResult.error)
            setError("Não foi possível carregar o histórico desta comanda.");
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        const term = customerName.trim();
        if (!openForm || term.length < 2 || customerWhatsapp) {
            setCustomerSuggestions([]);
            return;
        }
        let cancelled = false;
        const timeout = window.setTimeout(async () => {
            const { data } = await supabase.from("customers").select("id,name,whatsapp,birth_date").ilike("name", `%${term}%`).order("name").limit(8);
            if (!cancelled) setCustomerSuggestions((data ?? []) as CustomerSuggestion[]);
        }, 250);
        return () => {
            cancelled = true;
            window.clearTimeout(timeout);
        };
    }, [customerName, customerWhatsapp, openForm]);

    useEffect(() => {
        if (!active) return;
        const channel = supabase.channel("tabs-live").on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "tabs"
        }, () => void load(true)).subscribe();
        const interval = window.setInterval(() => {
            if (!document.hidden) void load(true);
        }, 4000);
        const refreshOnFocus = () => void load(true);
        window.addEventListener("focus", refreshOnFocus);
        return () => {
            window.clearInterval(interval);
            window.removeEventListener("focus", refreshOnFocus);
            void supabase.removeChannel(channel);
        };
    }, [active, load]);

    const activeTabs = tabs.filter(tab => activeStatuses.includes(tab.status));
    const totalOf = (item: Item) => (Number(item.unit_price) + item.extras.reduce((sum, extra) => sum + Number(extra.price), 0)) * item.quantity;
    const tabTotal = items.filter(item => item.status === "active").reduce((sum, item) => sum + totalOf(item), 0);
    const paidTotal = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const due = Math.max(0, tabTotal - paidTotal);

    useEffect(() => {
        setPaymentChange(
            paymentMethod === "Dinheiro" ? Math.max(0, Number(paymentAmount) - due).toFixed(2) : "0.00"
        );

        const fields = document.querySelectorAll<HTMLInputElement>(".comanda-payment-form input[type=number]");

        if (fields[0]) {
            if (paymentMethod === "Dinheiro")
                fields[0].removeAttribute("max");
            else
                fields[0].max = String(due);
        }

        if (fields[1])
            fields[1].readOnly = true;
    }, [paymentAmount, paymentMethod, due, selected]);

    const filteredTabs = useMemo(() => {
        const term = search.trim().toLocaleLowerCase("pt-BR");

        return [...tabs].filter(
            tab => (filter === "all" || (filter === "active" ? activeStatuses.includes(tab.status) : tab.status === filter)) && (!term || `${tab.tab_number} ${tab.customer_name ?? ""}`.toLocaleLowerCase("pt-BR").includes(term))
        ).sort(
            (a, b) => sortNewest ? b.opened_at.localeCompare(a.opened_at) : a.opened_at.localeCompare(b.opened_at)
        );
    }, [tabs, search, filter, sortNewest]);

    if (!active)
        return null;

    const openTab = async (event: React.FormEvent) => {
        event.preventDefault();
        const phoneDigits = customerWhatsapp.replace(/\D/g, "");
        if (!customerName.trim() || customerName.trim().length > 120 || phoneDigits.length < 10 || phoneDigits.length > 15 || !customerBirthDate || customerBirthDate > new Date().toISOString().slice(0, 10)) {
            setError("Informe nome, WhatsApp válido e data de nascimento não futura.");
            return;
        }
        setSaving(true);
        setError("");

        const {
            data,
            error: requestError
        } = await supabase.rpc("open_tab_with_customer", {
            p_store_id: storeId,
            p_customer_name: customerName.trim(),
            p_customer_whatsapp: phoneDigits,
            p_customer_birth_date: customerBirthDate,
            p_terminal: "PDV"
        });

        setSaving(false);

        if (requestError) {
            setError("Não foi possível abrir a comanda.");
            return;
        }

        setOpenForm(false);
        setCustomerWhatsapp("");
        setCustomerBirthDate("");
        setCustomerName("");
        setNotice(data.customer_created ? `Comanda #${data.tab_number} aberta e cliente cadastrado.` : `Comanda #${data.tab_number} aberta. Cliente existente localizado pelo WhatsApp.`);
        void load();
    };

    const addOrder = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!selected || !selectedProduct)
            return;

        const chosenExtras = (selectedProduct.extras ?? []).filter(extra => extraIds.includes(extra.id));
        setSaving(true);
        setError("");
        const idempotencyKey = orderKey ?? crypto.randomUUID();
        setOrderKey(idempotencyKey);

        const {
            error: requestError
        } = await supabase.rpc("add_tab_order", {
            p_tab_id: selected.id,
            p_idempotency_key: idempotencyKey,

            p_items: [{
                product_id: selectedProduct.id,
                quantity: Number(quantity),
                extras: chosenExtras,
                note: note.trim()
            }]
        });

        setSaving(false);

        if (requestError) {
            setError("Não foi possível adicionar os itens à comanda.");
            return;
        }

        setOrderKey(null);
        setProductId("");
        setQuantity("1");
        setExtraIds([]);
        setNote("");
        await load();
        const nextStatus = selected.status === "partially_paid" ? "partially_paid" : "in_consumption";

        await loadDetail({
            ...selected,
            status: nextStatus
        });
    };

    const downloadTabReceipt = (
        tab: Tab,
        receiptItems: Item[],
        receiptPayments: Payment[],
        receivedAmount: number,
        change: number
    ) => {
        const activeItems = receiptItems.filter(item => item.status === "active");
        const total = activeItems.reduce((sum, item) => sum + totalOf(item), 0);
        const lines = 14 + activeItems.reduce((sum, item) => sum + 2 + item.extras.length, 0) + receiptPayments.length * 2;

        const doc = new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: [80, Math.max(150, lines * 5)]
        });

        let y = 12;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);

        doc.text(storeName, 40, y, {
            align: "center"
        });

        y += 8;
        doc.setFontSize(11);
        doc.text(`COMANDA #${tab.tab_number}`, 5, y);
        y += 6;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(`Cliente: ${tab.customer_name || "Não identificado"}`, 5, y);
        y += 5;
        doc.text(`Data: ${new Date().toLocaleString("pt-BR")}`, 5, y);
        y += 5;
        doc.text(`Operador: ${operatorNames.get(tab.opened_by) ?? ""}`.slice(0, 42), 5, y);
        y += 5;
        doc.text("----------------------------------------", 5, y);
        y += 5;

        activeItems.forEach(item => {
            const row = `${item.quantity}x ${item.product_name}`;
            doc.text(row.slice(0, 42), 5, y);

            doc.text(money(totalOf(item)), 75, y, {
                align: "right"
            });

            y += 5;

            item.extras.forEach(extra => {
                doc.text(`+ ${extra.name}`.slice(0, 42), 8, y);
                y += 4;
            });
        });

        doc.text("----------------------------------------", 5, y);
        y += 6;
        doc.setFont("helvetica", "bold");
        doc.text("TOTAL", 5, y);

        doc.text(money(total), 75, y, {
            align: "right"
        });

        y += 7;
        doc.setFont("helvetica", "normal");
        doc.text("PAGAMENTOS", 5, y);
        y += 5;

        [...receiptPayments, {
            id: "current",
            method: paymentMethod,
            amount: receivedAmount,
            change_amount: change,
            received_at: new Date().toISOString(),
            cash_session_id: cashSessionId
        }].forEach(payment => {
            doc.text(`${payment.method}: ${money(payment.amount)}`.slice(0, 40), 5, y);
            y += 5;
        });

        if (change > 0) {
            doc.text(`Troco: ${money(change)}`, 5, y);
            y += 5;
        }

        doc.setFont("helvetica", "bold");

        doc.text("Comprovante não fiscal", 40, y + 3, {
            align: "center"
        });

        doc.save(`comanda-${tab.tab_number}-recibo.pdf`);
    };

    const receivePayment = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!selected || !cashSessionId) {
            setError("É necessário estar com um caixa aberto para receber pagamento.");
            return;
        }

        const tender = Number(paymentAmount);
        const amount = Math.min(tender, due);
        const change = paymentMethod === "Dinheiro" ? Math.max(0, tender - due) : 0;

        if (!tender || tender <= 0 || (tender > due && paymentMethod !== "Dinheiro")) {
            setError("Confira o valor recebido e o saldo pendente.");
            return;
        }

        setSaving(true);
        setError("");
        const idempotencyKey = paymentKey ?? crypto.randomUUID();
        setPaymentKey(idempotencyKey);

        const {
            error: requestError
        } = await supabase.rpc("record_tab_payment", {
            p_tab_id: selected.id,
            p_cash_session_id: cashSessionId,
            p_method: paymentMethod,
            p_amount: amount,
            p_change_amount: change,
            p_idempotency_key: idempotencyKey
        });

        setSaving(false);

        if (requestError) {
            setError("Pagamento não registrado. Verifique se o caixa continua aberto.");
            return;
        }

        if (amount >= due)
            downloadTabReceipt(selected, items, payments, amount, change);

        setPaymentKey(null);
        setPaymentAmount("");
        setPaymentChange("0");
        await load();
        const nextStatus = amount >= due ? "closed" : "partially_paid";

        const nextTab = {
            ...selected,
            status: nextStatus as TabStatus,
            closed_at: nextStatus === "closed" ? new Date().toISOString() : selected.closed_at
        };

        setSelected(nextTab);
        await loadDetail(nextTab);
    };

    const closeEmptyTab = async () => {
        if (!selected || !activeStatuses.includes(selected.status) || orders.length || items.length || payments.length || saving)
            return;
        if (!window.confirm(`Fechar a comanda #${selected.tab_number} sem consumo?`)) return;
        setSaving(true);
        setError("");
        const { data, error: requestError } = await supabase.rpc("close_empty_tab", { p_tab_id: selected.id });
        setSaving(false);
        if (requestError) {
            setError("Não foi possível fechar a comanda. Ela pode ter recebido consumo ou pagamento.");
            return;
        }
        const closedTab = { ...selected, ...(data as Tab) };
        setSelected(closedTab);
        await load();
        setNotice(`Comanda #${closedTab.tab_number} fechada sem consumo.`);
    };

    const reopenTab = async () => {
        if (!selected || role !== "admin" || selected.status !== "closed" || saving)
            return;

        setSaving(true);
        setError("");

        const {
            data,
            error: requestError
        } = await supabase.rpc("reopen_tab", {
            p_tab_id: selected.id
        });

        setSaving(false);

        if (requestError) {
            setError("Não foi possível reabrir a comanda.");
            return;
        }

        const reopened = {
            ...selected,
            ...(data as Tab)
        };

        setSelected(reopened);
        await load();
        await loadDetail(reopened);
        setNotice(`Comanda #${reopened.tab_number} reaberta para ajustes.`);
    };

    const changeItemQuantity = async (item: Item, nextQuantity: number) => {
        if (!selected || saving)
            return;

        if (nextQuantity < 1)
            return;

        setSaving(true);
        setError("");

        const {
            error: requestError
        } = await supabase.rpc("edit_tab_item_quantity", {
            p_item_id: item.id,
            p_quantity: nextQuantity
        });

        setSaving(false);

        if (requestError) {
            setError(
                "A quantidade não pôde ser alterada. Apenas itens ainda não enviados podem ser editados."
            );

            return;
        }

        await load();
        await loadDetail(selected);
    };

    const cancelItem = async (item: Item) => {
        if (!selected || role !== "admin")
            return;

        const reason = window.prompt(`Informe o motivo para cancelar ${item.product_name}:`);

        if (!reason?.trim())
            return;

        setSaving(true);
        setError("");

        const {
            error: requestError
        } = await supabase.rpc("cancel_tab_item", {
            p_item_id: item.id,
            p_reason: reason.trim()
        });

        setSaving(false);

        if (requestError) {
            setError("O item não pôde ser cancelado. Verifique pagamentos e tente novamente.");
            return;
        }

        await load();
        await loadDetail(selected);
    };

    const sendToProduction = async (order: Order, reprint = false) => {
        if (!selected)
            return;

        const orderItems = items.filter(item => item.order_id === order.id && item.status === "active");

        const payload = {
            kind: "tab",
            title: `COMANDA #${selected.tab_number}${reprint ? " · REIMPRESSÃO" : ""}`,
            store: storeName,
            createdAt: new Date().toISOString(),

            receipt: {
                orderNumber: String(selected.tab_number),
                customerName: selected.customer_name,
                operator: operatorNames.get(order.created_by) ?? "Equipe",
                orderType: "BALCÃO"
            },

            lines: orderItems.map(item => ({
                product: item.product_name,
                quantity: item.quantity,
                extras: item.extras.map(extra => extra.name),
                note: item.note
            }))
        };

        const {
            error: printError
        } = await supabase.rpc("queue_tab_production_print", {
            p_order_id: order.id,
            p_payload: payload,
            p_reprint: reprint
        });

        if (printError) {
            setError("Não foi possível enviar o pedido para impressão.");
            return;
        }

        if (!reprint)
            await loadDetail(selected);

        setNotice(reprint ? "Reimpressão enviada." : "Pedido enviado para produção.");
    };

    return (
        <section className="comandas-page">
            <header className="comandas-heading"><div><span className="comandas-kicker">ATENDIMENTO · {storeName.toLocaleUpperCase("pt-BR")}</span><h2>Comandas</h2><p>Acompanhe o consumo e receba pagamentos sem encerrar o atendimento.</p></div><button
                    className="comandas-primary"
                    onClick={() => {
                        setError("");
                        setOpenForm(true);
                    }}><Plus size={17} />Nova comanda</button></header>
            <div className="comandas-metrics"><article><small>Comandas abertas</small><b>{activeTabs.length}</b></article><article><small>Valor nas comandas abertas</small><b>{money(activeTabs.reduce(
                            (sum, tab) => sum + (pendingBalances.get(tab.id) ?? 0) + (paidBalances.get(tab.id) ?? 0),
                            0
                        ))}</b></article><article><small>Valores pagos</small><b>{money(tabs.reduce((sum, tab) => sum + (paidBalances.get(tab.id) ?? 0), 0))}</b></article><article><small>Fechadas hoje</small><b>{tabs.filter(
                            tab => tab.status === "closed" && tab.closed_at?.slice(0, 10) === new Date().toISOString().slice(0, 10)
                        ).length}</b></article></div>
            <div className="comandas-toolbar"><label><Search size={16} /><input
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        placeholder="Buscar número ou nome do cliente" /></label><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Todas</option><option value="active">Abertas e pendentes</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><button
                    title={sortNewest ? "Mais antigas primeiro" : "Mais recentes primeiro"}
                    onClick={() => setSortNewest(value => !value)}>{sortNewest ? <ArrowDownWideNarrow size={17} /> : <ArrowUpNarrowWide size={17} />}</button><button title="Atualizar comandas" onClick={() => void load()}><RefreshCw size={16} /></button></div>
            {loading ? <div className="comandas-empty">Carregando comandas…</div> : filteredTabs.length ? <div className="comandas-grid">{filteredTabs.map(tab => <button
                    key={tab.id}
                    className={`comanda-card ${selected?.id === tab.id ? "selected" : ""}`}
                    onClick={() => void loadDetail(tab)}><span className={`comanda-status status-${tab.status}`}>{labels[tab.status]}</span><b className="comanda-number">#{tab.tab_number}</b><span className="comanda-customer">{tab.customer_name || "Sem identificação"}</span><small>{new Date(tab.opened_at).toLocaleString("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short"
                        })}· {operatorNames.get(tab.opened_by) ?? "Equipe"}</small></button>)}</div> : <div className="comandas-empty"><ClipboardList size={30} /><b>Nenhuma comanda nesta visualização</b><span>Abra uma comanda para começar a registrar o consumo.</span></div>}
            {selected && <section className="comanda-detail"><header><div><span className="comandas-kicker">DETALHES</span><h3>Comanda #{selected.tab_number} <small>{selected.customer_name || "Sem identificação"}</small></h3></div><div className="comanda-detail-actions">{activeStatuses.includes(selected.status) && orders.length === 0 && items.length === 0 && payments.length === 0 && <button
                            className="comandas-primary"
                            onClick={() => void closeEmptyTab()}
                            disabled={saving}>Fechar sem consumo</button>}{role === "admin" && selected.status === "closed" && <button
                            className="comandas-primary"
                            onClick={() => void reopenTab()}
                            disabled={saving}><RefreshCw size={15} />{saving ? "Reabrindo…" : "Reabrir para ajustes"}</button>}<button
                            className="comandas-icon-button"
                            onClick={() => setSelected(null)}
                            aria-label="Fechar detalhes"><X size={18} /></button></div></header>
                <div className="comanda-items">{orders.map(
                        order => <article className="comanda-order" key={order.id}><div className="comanda-order-head"><b>Pedido · {new Date(order.created_at).toLocaleString("pt-BR", {
                                        dateStyle: "short",
                                        timeStyle: "short"
                                    })}</b><div><button
                                        onClick={() => void sendToProduction(order, Boolean(order.production_sent_at))}>{order.production_sent_at ? "Reimprimir" : "Enviar à produção"}</button></div></div>{items.filter(item => item.order_id === order.id).map(item => <div
                                className={`comanda-item ${item.status === "cancelled" ? "cancelled" : ""}`}
                                key={item.id}><span>{item.quantity}× {item.product_name}{item.extras.map(extra => <small key={extra.id}>+ {extra.name}</small>)}{item.note && <small>Obs.: {item.note}</small>}</span><b>{money(totalOf(item))}</b>{item.status === "active" && !order.production_sent_at && activeStatuses.includes(selected.status) && <div className="comanda-item-actions"><button
                                        disabled={saving || item.quantity <= 1}
                                        onClick={() => void changeItemQuantity(item, item.quantity - 1)}
                                        aria-label="Diminuir quantidade">−</button><button
                                        disabled={saving}
                                        onClick={() => void changeItemQuantity(item, item.quantity + 1)}
                                        aria-label="Aumentar quantidade">+</button>{role === "admin" && <button
                                        className="comanda-cancel-item"
                                        disabled={saving}
                                        onClick={() => void cancelItem(item)}>Cancelar item</button>}</div>}</div>)}</article>
                    )}</div>
                {activeStatuses.includes(selected.status) && <form className="comanda-add-form" onSubmit={addOrder}><h4>Adicionar itens</h4><select
                        required
                        value={productId}
                        onChange={event => {
                            setProductId(event.target.value);
                            setExtraIds([]);
                        }}><option value="">Selecione um produto</option>{products.map(
                            product => <option value={product.id} key={product.id}>{product.name}· {money(Number(product.price))}</option>
                        )}</select>{selectedProduct?.extras?.length ? <div className="comanda-extras">{selectedProduct.extras.map(extra => <label key={extra.id}><input
                                type="checkbox"
                                checked={extraIds.includes(extra.id)}
                                onChange={event => setExtraIds(
                                    ids => event.target.checked ? [...ids, extra.id] : ids.filter(id => id !== extra.id)
                                )} />{extra.name}+ {money(Number(extra.price))}</label>)}</div> : null}<div className="comanda-form-row"><label>Quantidade<input
                                type="number"
                                min="1"
                                max="99"
                                value={quantity}
                                onChange={event => setQuantity(event.target.value)} /></label><label>Observação<input
                                maxLength={300}
                                value={note}
                                onChange={event => setNote(event.target.value)}
                                placeholder="Sem açúcar, por exemplo" /></label></div><button className="comandas-primary" disabled={saving || !selectedProduct}><Plus size={15} />Adicionar pedido</button></form>}
                <div className="comanda-totals"><span>Consumo <b>{money(tabTotal)}</b></span><span>Recebido <b>{money(paidTotal)}</b></span><strong>Saldo <b>{money(due)}</b></strong></div>
                {due > 0 && activeStatuses.includes(selected.status) && <form className="comanda-payment-form" onSubmit={receivePayment}><h4>Receber pagamento</h4>{!cashSessionId && <p className="comandas-warning">Abra o caixa para registrar recebimentos.</p>}<div className="comanda-form-row"><label>Forma<select
                                value={paymentMethod}
                                onChange={event => setPaymentMethod(event.target.value)}>{cashMethods.map(method => <option key={method}>{method}</option>)}</select></label><label>Valor a aplicar<input
                                type="number"
                                min="0.01"
                                max={due}
                                step="0.01"
                                required
                                value={paymentAmount}
                                onChange={event => setPaymentAmount(event.target.value)}
                                placeholder={`Saldo ${money(due)}`} /></label>{paymentMethod === "Dinheiro" && <label>Troco<input
                                type="number"
                                min="0"
                                step="0.01"
                                value={paymentChange}
                                onChange={event => setPaymentChange(event.target.value)} /></label>}</div><button className="comandas-primary" disabled={saving || !cashSessionId}><Plus size={15} />{saving ? "Registrando…" : "Registrar pagamento"}</button></form>}
                {error && <p className="comandas-error" role="alert">{error}</p>}{payments.length > 0 && <div className="comanda-payments"><b>Pagamentos registrados</b>{payments.map(
                        payment => <span key={payment.id}>{new Date(payment.received_at).toLocaleString("pt-BR")}· {payment.method}· {money(Number(payment.amount))}{payment.change_amount > 0 ? ` · Troco ${money(Number(payment.change_amount))}` : ""}</span>
                    )}</div>}
            </section>}
            {openForm && <div
                className="comandas-backdrop"
                role="presentation"
                onMouseDown={event => {
                    if (event.target === event.currentTarget)
                        setOpenForm(false);
                }}><form className="comandas-modal" onSubmit={openTab}><button
                        type="button"
                        className="comandas-icon-button"
                        onClick={() => setOpenForm(false)}
                        aria-label="Fechar"><X size={18} /></button><span className="comandas-kicker">NOVA COMANDA</span><h3>Abrir comanda</h3><p>Informe o nome e WhatsApp do cliente. Se o número já estiver cadastrado, o cliente existente será reutilizado.</p><div className="comanda-customer-search"><label>Nome completo<input
                            required
                            maxLength={120}
                            value={customerName}
                            onChange={event => { setCustomerName(event.target.value); setCustomerWhatsapp(""); setCustomerBirthDate(""); }}
                            placeholder="Comece a digitar o nome" /></label>{customerSuggestions.length > 0 && <div className="comanda-customer-suggestions" role="listbox" aria-label="Clientes encontrados">{customerSuggestions.map(customer => <button type="button" role="option" key={customer.id} onMouseDown={event => event.preventDefault()} onClick={() => { setCustomerName(customer.name); setCustomerWhatsapp(customer.whatsapp); setCustomerBirthDate(customer.birth_date ?? ""); setCustomerSuggestions([]); }}><b>{customer.name}</b><small>{customer.whatsapp}</small></button>)}</div>}</div><label>WhatsApp<input
                            required
                            type="tel"
                            inputMode="tel"
                            maxLength={20}
                            value={customerWhatsapp}
                            onChange={event => setCustomerWhatsapp(event.target.value)}
                            placeholder="(00) 00000-0000" /></label><label>Data de nascimento<input
                                                        required
                                                        type="date"
                                                        max={new Date().toISOString().slice(0, 10)}
                                                        value={customerBirthDate}
                                                        onChange={event => setCustomerBirthDate(event.target.value)} /></label>{error && <p className="comandas-error">{error}</p>}<button className="comandas-primary" disabled={saving || !storeId}><Plus size={15} />{saving ? "Abrindo…" : "Abrir comanda"}</button></form></div>}
            {notice && <div className="comandas-notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Fechar">×</button></div>}
        </section>
    );
}