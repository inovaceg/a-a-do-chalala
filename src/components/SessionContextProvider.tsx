import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppProfile = { id: string; display_name: string; email: string; role: "admin" | "operator"; is_active: boolean };
type AuthState = { session: Session | null; profile: AppProfile | null; loading: boolean };
const SessionContext = createContext<AuthState>({ session: null, profile: null, loading: true });

export function SessionContextProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!session?.user) {
      setProfile(null);
      setLoading(false);
      return () => { mounted = false; };
    }
    setLoading(true);
    supabase.from("profiles").select("id, display_name, email, role, is_active").eq("id", session.user.id).maybeSingle().then(({ data }) => {
      if (!mounted) return;
      setProfile(data as AppProfile | null);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [session?.user.id]);

  const value = useMemo(() => ({ session, profile, loading }), [session, profile, loading]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSessionContext = () => useContext(SessionContext);
