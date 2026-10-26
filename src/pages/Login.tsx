import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { Coffee } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import "./auth.css";

export default function Login() {
  return <main className="auth-screen"><section className="auth-brand-panel"><div className="auth-logo-mark"><Coffee size={29}/></div><span className="auth-kicker">SISTEMA DE GESTÃO E VENDAS</span><h1>AÇAÍ DO<br/>CHALALA</h1><p>Seu negócio em boas mãos.<br/>Entre para continuar.</p><div className="auth-decoration">🍇</div></section><section className="auth-form-panel"><div className="auth-mobile-brand">AÇAÍ DO CHALALA</div><div className="auth-form-heading"><span>ACESSO AO SISTEMA</span><h2>Bem-vinda de volta</h2><p>Entre com seu e-mail e senha para acessar o PDV.</p></div><Auth supabaseClient={supabase} view="sign_in" providers={[]} showLinks={false} redirectTo={new URL("/", window.location.origin).href} appearance={{ theme: ThemeSupa, variables: { default: { colors: { brand: "#5b117a", brandAccent: "#702797", inputBorder: "#e5dce9", inputLabelText: "#514757", inputText: "#382f3d" }, radii: { inputBorderRadius: "9px", buttonBorderRadius: "9px" }, fonts: { bodyFontFamily: "'DM Sans', sans-serif", buttonFontFamily: "'DM Sans', sans-serif", inputFontFamily: "'DM Sans', sans-serif", labelFontFamily: "'DM Sans', sans-serif" } } }}/> <a className="setup-link" href="/setup">Configuração inicial da administradora</a></section></main>;
}
