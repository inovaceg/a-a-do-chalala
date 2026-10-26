import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agent-token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map(byte => byte.toString(16).padStart(2, "0")).join("");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const body = await req.json().catch(() => null);
  if (!body || typeof body.action !== "string") return json({ error: "Dados inválidos." }, 400);

  if (["provision"].includes(body.action)) {
    const sessionToken = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!sessionToken) return json({ error: "Sessão necessária." }, 401);
    const { data: auth, error: authError } = await admin.auth.getUser(sessionToken);
    if (authError || !auth.user) return json({ error: "Sessão inválida." }, 401);
    const { data: profile } = await admin.from("profiles").select("role,is_active").eq("id", auth.user.id).maybeSingle();
    if (profile?.role !== "admin" || !profile.is_active) return json({ error: "Somente administradores ativos podem provisionar agentes." }, 403);
    const { data: memberships } = await admin.from("store_memberships").select("store_id").eq("user_id", auth.user.id).limit(1);
    const storeId = typeof body.storeId === "string" ? body.storeId : memberships?.[0]?.store_id;
    if (!storeId || !memberships?.some(membership => membership.store_id === storeId)) return json({ error: "Loja não autorizada." }, 403);
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "Agente Windows central";
    if (!name) return json({ error: "Informe o nome do agente." }, 400);
    const token = `acai_${Array.from(crypto.getRandomValues(new Uint8Array(32))).map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
    const { data: agent, error } = await admin.from("print_agents").insert({ store_id: storeId, name, token_hash: await hash(token) }).select("id,name,store_id,created_at").single();
    if (error || !agent) return json({ error: "Não foi possível provisionar o agente." }, 500);
    return json({ agent, token }, 201);
  }

  const agentToken = req.headers.get("x-agent-token");
  if (!agentToken || agentToken.length > 200) return json({ error: "Credencial do agente necessária." }, 401);
  const { data: agent, error: agentError } = await admin.from("print_agents").select("id,store_id").eq("token_hash", await hash(agentToken)).is("revoked_at", null).maybeSingle();
  if (agentError || !agent) return json({ error: "Credencial inválida ou revogada." }, 401);

  if (body.action === "claim") {
    const { data: jobs, error } = await admin.from("print_jobs").select("id,payload,created_at").eq("store_id", agent.store_id).eq("status", "pending").order("created_at").limit(1);
    if (error) return json({ error: "Não foi possível consultar a fila." }, 500);
    if (!jobs?.length) return json({ job: null });
    const job = jobs[0];
    const { data: claimed, error: claimError } = await admin.from("print_jobs").update({ status: "received", agent_id: agent.id, received_at: new Date().toISOString(), error_message: null }).eq("id", job.id).eq("status", "pending").select("id,payload,created_at").maybeSingle();
    if (claimError) return json({ error: "Falha ao reservar o trabalho." }, 500);
    return json({ job: claimed ?? null });
  }
  if ((body.action === "complete" || body.action === "error") && typeof body.jobId === "string") {
    const isError = body.action === "error";
    const message = typeof body.message === "string" ? body.message.slice(0, 1000) : null;
    const { data: updated, error } = await admin.from("print_jobs").update({ status: isError ? "error" : "completed", error_message: isError ? message || "Erro de impressão" : null, completed_at: new Date().toISOString() }).eq("id", body.jobId).eq("agent_id", agent.id).eq("status", "received").select("id,status").maybeSingle();
    if (error) return json({ error: "Não foi possível atualizar o trabalho." }, 500);
    if (!updated) return json({ error: "Trabalho não reservado por este agente." }, 409);
    return json({ job: updated });
  }
  return json({ error: "Ação inválida." }, 400);
});
