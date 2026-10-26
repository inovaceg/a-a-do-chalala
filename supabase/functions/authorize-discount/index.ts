import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const configured = Deno.env.get("ADMIN_PASSWORD");
  if (!configured) return new Response(JSON.stringify({ error: "Configure ADMIN_PASSWORD nos segredos de Edge Functions do Supabase." }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const body = await req.json().catch(() => null);
  if (typeof body?.password !== "string" || !body.password) return new Response(JSON.stringify({ error: "Informe a senha de autorização." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const encoder = new TextEncoder();
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  const [actual, expected] = await Promise.all([digest(body.password), digest(configured)]);
  let difference = 0;
  for (let index = 0; index < actual.length; index++) difference |= actual[index] ^ expected[index];
  if (difference !== 0) return new Response(JSON.stringify({ error: "Senha da administradora incorreta." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  return new Response(JSON.stringify({ authorized: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
