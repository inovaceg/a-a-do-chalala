import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

export type TestAccount = { id: string; email: string; password: string; name: string };

export async function createTestAccount(role: "admin" | "operator" = "operator"): Promise<{ account: TestAccount; cleanup: () => Promise<void> }> {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("Supabase test credentials were not injected into the Playwright runtime.");
  const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const account = { email: `test-${suffix}@example.test`, password: `Test-${suffix}-secure`, name: role === "admin" ? "Teste Administradora" : "Teste Operadora" };
  const { data, error } = await admin.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true, user_metadata: { display_name: account.name } });
  if (error || !data.user) throw new Error(error?.message || "Could not create isolated test user.");
  const { error: profileError } = await admin.from("profiles").update({ role, is_active: true, display_name: account.name, email: account.email }).eq("id", data.user.id);
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(profileError.message);
  }
  return {
    account: { ...account, id: data.user.id },
    verifySale: async (receiptNumber: string) => {
      const { data: sale, error: saleError } = await admin.from("sales").select("id,cash_session_id,created_by,total,sale_items(product_name),sale_payments(method,amount)").eq("receipt_number", receiptNumber).single();
      if (saleError || !sale) throw new Error(saleError?.message || "Persisted sale was not found.");
      return sale;
    },
    cleanup: async () => {
      const { data: sessions } = await admin.from("cash_sessions").select("id").eq("opened_by", data.user.id);
      const sessionIds = (sessions ?? []).map(session => session.id);
      await admin.from("sales").delete().eq("created_by", data.user.id);
      if (sessionIds.length) {
        await admin.from("cash_movements").delete().in("cash_session_id", sessionIds);
        await admin.from("cash_sessions").delete().in("id", sessionIds);
      }
      const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
      if (deleteError) throw new Error(`Could not clean up test user: ${deleteError.message}`);
    },
  };
}

export async function signInThroughApp(page: Page, account: TestAccount) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: /sign in/i }).click();
}
