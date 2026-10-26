import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const sameSecret = async (given: string, expected: string) => {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", encoder.encode(given)), crypto.subtle.digest("SHA-256", encoder.encode(expected))]);
  const left = new Uint8Array(a); const right = new Uint8Array(b); let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const body = await req.json().catch(() => null);
  const { count, error: countError } = await adminClient.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
  if (countError) return new Response(JSON.stringify({ error: "Não foi possível verificar a conta inicial." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (body?.action === "status") return new Response(JSON.stringify({ configured: (count ?? 0) > 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (body?.action !== "create") return new Response(JSON.stringify({ error: "Ação inválida." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (count) return new Response(JSON.stringify({ error: "A administradora inicial já foi configurada." }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const secret = Deno.env.get("ADMIN_PASSWORD");
  if (!secret) return new Response(JSON.stringify({ error: "Configure ADMIN_PASSWORD nos segredos de Edge Functions do Supabase." }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (typeof body?.setupSecret !== "string" || !(await sameSecret(body.setupSecret, secret))) return new Response(JSON.stringify({ error: "Chave de configuração incorreta." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!name || !email.includes("@") || password.length < 8) return new Response(JSON.stringify({ error: "Informe nome, e-mail válido e senha com ao menos 8 caracteres." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const { data, error } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } });
  if (error || !data.user) return new Response(JSON.stringify({ error: error?.message || "Não foi possível criar a conta." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const { error: profileError } = await adminClient.from("profiles").update({ display_name: name, email, role: "admin", is_active: true }).eq("id", data.user.id);
  if (profileError) {
    await adminClient.auth.admin.deleteUser(data.user.id);
    return new Response(JSON.stringify({ error: "Não foi possível concluir o perfil administrativo." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  return new Response(JSON.stringify({ created: true }), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
