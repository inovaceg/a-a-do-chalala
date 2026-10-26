import { useEffect, useState } from "react";
import { Plus, RefreshCw, ShieldCheck, UserRound, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSessionContext } from "@/components/SessionContextProvider";

type TeamProfile = { id: string; display_name: string; email: string; role: "admin" | "operator"; is_active: boolean; created_at: string };
const functionError = async (error: { message: string; context?: unknown } | null) => {
  if (!error) return "";
  const response = error.context instanceof Response ? await error.context.json().catch(() => null) : null;
  return response?.error || error.message;
};

export default function TeamManagement() {
  const { session } = useSessionContext();
  const [team, setTeam] = useState<TeamProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "operator">("operator");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const loadTeam = async () => {
    setLoading(true);
    const { data, error: queryError } = await supabase.from("profiles").select("id, display_name, email, role, is_active, created_at").order("created_at");
    if (queryError) setError(queryError.message);
    else setTeam((data || []) as TeamProfile[]);
    setLoading(false);
  };
  useEffect(() => { void loadTeam(); }, []);

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(""); setSuccess(""); setSaving(true);
    const { error: requestError } = await supabase.functions.invoke("manage-users", { body: { action: "create", name, email, password, role } });
    const message = await functionError(requestError);
    if (message) setError(message);
    else { setName(""); setEmail(""); setPassword(""); setRole("operator"); setSuccess("Conta criada. A pessoa já pode entrar com o e-mail e senha definidos."); await loadTeam(); }
    setSaving(false);
  };

  const updateUser = async (userId: string, change: { action: "set-role"; role: "admin" | "operator" } | { action: "set-active"; active: boolean }) => {
    setError(""); setSuccess("");
    const { error: requestError } = await supabase.functions.invoke("manage-users", { body: { ...change, userId } });
    const message = await functionError(requestError);
    if (message) setError(message); else { setSuccess("Permissões atualizadas."); await loadTeam(); }
  };

  return <section className="team-management"><header className="team-title"><div><span className="auth-kicker">ACESSO E PERMISSÕES</span><h2>Equipe da loja</h2><p>Cadastre as pessoas e controle o que cada função pode acessar.</p></div><button className="secondary-action" onClick={() => void loadTeam()}><RefreshCw size={15}/> Atualizar</button></header>
    <div className="roles-summary"><article><span><ShieldCheck size={18}/></span><b>Administradora</b><small>Acesso a todas as áreas e gestão da equipe.</small></article><article><span><UserRound size={18}/></span><b>Operadora</b><small>Acesso somente ao PDV e às vendas.</small></article><article><span><Users size={18}/></span><b>{team.filter(user => user.is_active).length}</b><small>contas ativas</small></article></div>
    <div className="team-layout"><form className="team-create" onSubmit={createUser}><div className="team-section-title"><span className="team-add-icon"><Plus size={17}/></span><div><h3>Cadastrar pessoa</h3><p>A senha é definida por você e entregue à pessoa.</p></div></div><label>Nome completo<input required value={name} onChange={e => setName(e.target.value)} placeholder="Nome da pessoa"/></label><label>E-mail de acesso<input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="pessoa@empresa.com"/></label><label>Senha inicial<input required minLength={8} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo de 8 caracteres"/></label><label>Função<select value={role} onChange={e => setRole(e.target.value as "admin" | "operator")}><option value="operator">Operadora — PDV e vendas</option><option value="admin">Administradora — acesso completo</option></select></label>{error && <p className="team-error" role="alert">{error}</p>}{success && <p className="team-success" role="status">{success}</p>}<button className="primary-button team-submit" disabled={saving || !session}>{saving ? "Criando conta…" : "Criar conta"}</button></form>
      <section className="team-list"><div className="team-list-header"><div><h3>Contas cadastradas</h3><p>{team.length} pessoas</p></div></div>{loading ? <div className="team-empty">Carregando equipe…</div> : team.length ? <div className="team-table">{team.map(person => <article className="team-person" key={person.id}><div className="team-avatar">{person.display_name.split(" ").map(part => part[0]).slice(0,2).join("").toUpperCase()}</div><div className="team-person-info"><b>{person.display_name}{person.id === session?.user.id ? " (você)" : ""}</b><small>{person.email}</small></div><select aria-label={`Função de ${person.display_name}`} value={person.role} disabled={person.id === session?.user.id} onChange={e => void updateUser(person.id, { action: "set-role", role: e.target.value as "admin" | "operator" })}><option value="operator">Operadora</option><option value="admin">Administradora</option></select><button className={`account-state ${person.is_active ? "account-active" : "account-inactive"}`} disabled={person.id === session?.user.id} onClick={() => void updateUser(person.id, { action: "set-active", active: !person.is_active })}>{person.is_active ? "Ativa" : "Inativa"}</button></article>)}</div> : <div className="team-empty">Nenhuma conta cadastrada ainda.</div>}</section></div>
  </section>;
}
