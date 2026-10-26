import { useEffect, useState } from "react";
import { Check, CircleAlert, Printer, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import "./print-test.css";

type PrintJob = { id: string; status: "pending" | "received" | "completed" | "error"; error_message: string | null; created_at: string };
type AgentToken = { id: string; name: string; token: string };
type AgentEntry = { id: string; name: string; created_at: string; revoked_at: string | null };
const statusText: Record<PrintJob["status"], string> = { pending: "Pendente", received: "Recebido", completed: "Concluído", error: "Erro" };

export default function PrintTestControl() {
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("AÇAÍ DO CHALALA");
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newAgent, setNewAgent] = useState<AgentToken | null>(null);
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [agentName, setAgentName] = useState("Agente Windows central");

  const refreshAgents = async (selectedStore: string) => {
    const { data, error: agentsError } = await supabase.functions.invoke("print-bridge", { body: { action: "list", storeId: selectedStore } });
    if (agentsError || data?.error) setError(data?.error ?? "Não foi possível carregar os agentes.");
    else setAgents(data.agents as AgentEntry[]);
  };

  const refresh = async (selectedStore = storeId) => {
    if (!selectedStore) return;
    const { data, error: queryError } = await supabase.from("print_jobs").select("id,status,error_message,created_at").eq("store_id", selectedStore).order("created_at", { ascending: false }).limit(8);
    if (queryError) setError("Não foi possível carregar o status da fila.");
    else setJobs((data ?? []) as PrintJob[]);
  };

  useEffect(() => {
    let mounted = true;
    const loadStore = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: memberships } = await supabase.from("store_memberships").select("store_id,stores(id,name)").eq("user_id", user.id).limit(1);
      const membership = memberships?.[0] as { store_id: string; stores: { id: string; name: string }[] | { id: string; name: string } | null } | undefined;
      const relatedStore = Array.isArray(membership?.stores) ? membership.stores[0] : membership?.stores;
      if (mounted && membership) {
        setStoreId(membership.store_id);
        setStoreName(relatedStore?.name ?? "AÇAÍ DO CHALALA");
        void refresh(membership.store_id);
        void refreshAgents(membership.store_id);
      }
    };
    void loadStore();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!storeId) return;
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [storeId]);

  const enqueueTest = async () => {
    if (!storeId || busy) return;
    setBusy(true);
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    const payload = { kind: "test", title: "TESTE DE IMPRESSÃO", store: storeName, createdAt: new Date().toISOString(), lines: [{ text: "AÇAÍ DO CHALALA", bold: true }, { text: "Teste enviado pelo painel administrativo." }, { text: new Date().toLocaleString("pt-BR") }, { text: "A impressora está conectada ao agente." }] };
    const { error: insertError } = await supabase.from("print_jobs").insert({ store_id: storeId, created_by: user?.id, payload }).select("id").single();
    if (insertError) setError("Não foi possível enfileirar o teste. Verifique sua permissão de administradora.");
    await refresh();
    setBusy(false);
  };

  const provisionAgent = async () => {
    setBusy(true);
    setError("");
    const { data, error: invokeError } = await supabase.functions.invoke("print-bridge", { body: { action: "provision", storeId, name: agentName } });
    if (invokeError || data?.error) setError(data?.error ?? "Não foi possível gerar a credencial do agente.");
    else {
      setNewAgent({ id: data.agent.id, name: data.agent.name, token: data.token });
      await refreshAgents(storeId);
    }
    setBusy(false);
  };

  const revokeAgent = async (agentId: string) => {
    if (!window.confirm("Revogar a credencial deste agente? Ele deixará de receber trabalhos.")) return;
    setBusy(true);
    const { data, error: invokeError } = await supabase.functions.invoke("print-bridge", { body: { action: "revoke", storeId, agentId } });
    if (invokeError || data?.error) setError(data?.error ?? "Não foi possível revogar a credencial.");
    else await refreshAgents(storeId);
    setBusy(false);
  };

  return <section className="print-test-card" aria-label="Impressão centralizada">
    <div className="print-test-intro"><span className="print-test-icon"><Printer size={20}/></span><div><h2>Impressão centralizada</h2><p>Envie um trabalho para o agente Windows da loja.</p></div></div>
    <div className="print-test-actions"><button type="button" className="primary-button" onClick={() => void enqueueTest()} disabled={busy || !storeId}><Printer size={16}/>{busy ? "Enviando…" : "Enviar impressão de teste"}</button><button type="button" className="secondary-action" onClick={() => void refresh()} disabled={!storeId}><RefreshCw size={15}/> Atualizar status</button></div>
    {!jobs.length ? <p className="print-empty">Nenhum trabalho de impressão recente.</p> : <ul className="print-job-list">{jobs.map(job => <li key={job.id}><span className={`print-status status-${job.status}`}>{job.status === "completed" ? <Check size={13}/> : job.status === "error" ? <CircleAlert size={13}/> : <span className="status-pulse"/>}{statusText[job.status]}</span><span className="print-job-id" title={job.id}>{job.id.slice(0, 8)}</span><time>{new Date(job.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time>{job.error_message && <small>{job.error_message}</small>}</li>)}</ul>}
    <div className="agent-provision"><div><b><ShieldCheck size={15}/> Credencial do agente</b><small>O token é exibido uma única vez. Guarde-o no Windows central.</small></div><div className="agent-provision-fields"><input aria-label="Nome do agente" value={agentName} onChange={event => setAgentName(event.target.value)} maxLength={80}/><button type="button" className="secondary-action" onClick={() => void provisionAgent()} disabled={busy || !storeId}>Gerar token</button></div></div>
    {!!agents.length && <ul className="agent-list" aria-label="Agentes cadastrados">{agents.map(agent => <li key={agent.id}><span><b>{agent.name}</b><small>{agent.revoked_at ? "Revogado" : "Ativo"} · {new Date(agent.created_at).toLocaleDateString("pt-BR")}</small></span>{!agent.revoked_at && <button type="button" className="secondary-action" onClick={() => void revokeAgent(agent.id)} disabled={busy}>Revogar</button>}</li>)}</ul>}
    {error && <p className="print-error" role="alert">{error}</p>}
    {newAgent && <div className="agent-token-box" role="dialog" aria-modal="true" aria-label="Token do agente"><button className="token-close" aria-label="Fechar" onClick={() => setNewAgent(null)}>×</button><b>Credencial gerada para {newAgent.name}</b><p>Copie agora. O token completo não poderá ser recuperado depois.</p><code>{newAgent.token}</code><button type="button" className="secondary-action" onClick={() => { void navigator.clipboard.writeText(newAgent.token); }}>Copiar token</button></div>}
  </section>;
}
