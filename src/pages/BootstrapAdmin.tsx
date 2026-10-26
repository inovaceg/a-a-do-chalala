import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import "./auth.css";

export default function BootstrapAdmin() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupSecret, setSetupSecret] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.functions.invoke("bootstrap-admin", { body: { action: "status" } }).then(({ data, error: requestError }) => {
      setReady(!requestError && data?.configured === false);
      if (requestError) setError("Não foi possível verificar a configuração. Confirme a configuração segura do serviço Supabase.");
    });
  }, []);

  const createAdmin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    const { error: createError } = await supabase.functions.invoke("bootstrap-admin", { body: { action: "create", name, email, password, setupSecret } });
    if (createError) {
      const context = createError.context;
      const body = context instanceof Response ? await context.json().catch(() => null) : null;
      setError(body?.error || "Não foi possível criar a administradora. Confira a chave inicial e tente novamente.");
      setSaving(false);
      return;
    }
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    if (loginError) {
      setError("Conta criada. Faça login com o e-mail e a senha cadastrados.");
      setSaving(false);
      return;
    }
    window.location.assign("/");
  };

  if (ready === null) return <main className="auth-screen"><section className="setup-card"><p>Verificando a configuração segura...</p></section></main>;
  if (ready === false) return <main className="auth-screen"><section className="setup-card"><span className="auth-kicker">AÇAÍ DO CHALALA</span><h1>A administradora já está configurada</h1><p>Entre com a conta de administradora para gerenciar a equipe.</p><a className="setup-submit" href="/login">Ir para o login</a></section></main>;

  return <main className="auth-screen setup-screen"><form className="setup-card" onSubmit={createAdmin}><div className="auth-logo-mark"><span>AC</span></div><span className="auth-kicker">CONFIGURAÇÃO INICIAL · USO ÚNICO</span><h1>Crie a conta da administradora</h1><p>Essa conta terá acesso a todo o sistema e poderá cadastrar operadoras.</p><label>Nome<input required value={name} onChange={e => setName(e.target.value)} autoComplete="name" placeholder="Nome da administradora"/></label><label>E-mail<input required type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="nome@empresa.com"/></label><label>Senha de acesso<input required minLength={8} type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" placeholder="Mínimo de 8 caracteres"/></label><label>Chave segura de configuração<input required type="password" value={setupSecret} onChange={e => setSetupSecret(e.target.value)} autoComplete="off" placeholder="Chave definida nos segredos Supabase"/></label>{error && <p className="auth-error" role="alert">{error}</p>}<button className="setup-submit" disabled={saving}>{saving ? "Criando conta…" : "Criar administradora"}</button></form></main>;
}
