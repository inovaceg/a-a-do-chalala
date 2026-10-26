import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { SessionContextProvider, useSessionContext } from "@/components/SessionContextProvider";
import Index from "./pages/Index";
import Login from "./pages/Login";
import BootstrapAdmin from "./pages/BootstrapAdmin";
import NotFound from "./pages/NotFound";
import { supabase } from "@/integrations/supabase/client";

const queryClient = new QueryClient();

function ProtectedHome() {
  const { session, profile, loading } = useSessionContext();
  if (loading) return <div className="auth-loading">Carregando acesso seguro…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile?.is_active) {
    void supabase.auth.signOut();
    return <Navigate to="/login" replace />;
  }
  return <Index role={profile.role} displayName={profile.display_name} email={profile.email} />;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><Toaster/><Sonner/><BrowserRouter><SessionContextProvider><Routes><Route path="/" element={<ProtectedHome/>}/><Route path="/login" element={<Login/>}/><Route path="/setup" element={<BootstrapAdmin/>}/><Route path="*" element={<NotFound/>}/></Routes></SessionContextProvider></BrowserRouter></TooltipProvider></QueryClientProvider>;
}

export default App;
