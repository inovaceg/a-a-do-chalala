import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sessão necessária." }, 401);
  const { data: authData, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Sessão inválida." }, 401);
  const { data: caller, error: callerError } = await adminClient.from("profiles").select("role, is_active").eq("id", authData.user.id).maybeSingle();
  if (callerError || caller?.role !== "admin" || !caller.is_active) return json({ error: "Somente administradoras ativas podem gerenciar usuários." }, 403);
  const body = await req.json().catch(() => null);
  if (!body || typeof body.action !== "string") return json({ error: "Dados inválidos." }, 400);
  if (body.action === "create") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const role = body.role === "admin" ? "admin" : body.role === "operator" ? "operator" : null;
    if (!name || !email.includes("@") || password.length < 8 || !role) return json({ error: "Confira nome, e-mail, nível e senha (mínimo 8 caracteres)." }, 400);
    const { data, error } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } });
    if (error || !data.user) return json({ error: error?.message || "Não foi possível criar a conta." }, 400);
    const { error: profileError } = await adminClient.from("profiles").update({ display_name: name, email, role, is_active: true }).eq("id", data.user.id);
    if (profileError) {
      await adminClient.auth.admin.deleteUser(data.user.id);
      return json({ error: "Não foi possível salvar o perfil. A conta foi removida." }, 500);
    }
    return json({ created: true }, 201);
  }
  if (body.action === "set-name") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (typeof body.userId !== "string" || !name || name.length > 120) return json({ error: "Informe um nome válido com até 120 caracteres." }, 400);
    const { error } = await adminClient.from("profiles").update({ display_name: name }).eq("id", body.userId);
    if (error) return json({ error: "Não foi possível atualizar o nome." }, 400);
    return json({ updated: true });
  }
  if (typeof body.userId !== "string" || body.userId === authData.user.id) return json({ error: "Não é possível alterar a própria conta." }, 400);
  if (body.action === "set-role" && (body.role === "admin" || body.role === "operator")) {
    const { error } = await adminClient.from("profiles").update({ role: body.role }).eq("id", body.userId);
    if (error) return json({ error: "Não foi possível alterar a permissão." }, 400);
    return json({ updated: true });
  }
  if (body.action === "set-active" && typeof body.active === "boolean") {
    const { error } = await adminClient.from("profiles").update({ is_active: body.active }).eq("id", body.userId);
    if (error) return json({ error: "Não foi possível atualizar a conta." }, 400);
    return json({ updated: true });
  }
  return json({ error: "Ação inválida." }, 400);
});
