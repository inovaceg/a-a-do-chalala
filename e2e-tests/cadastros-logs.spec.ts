import { test, expect } from "@playwright/test";
import { createTestAccount, signInThroughApp, type TestAccount } from "./fixtures/supabase-user";

let admin: TestAccount;
let cleanup: () => Promise<void>;

test.beforeEach(async () => {
  const created = await createTestAccount("admin");
  admin = created.account;
  cleanup = created.cleanup;
});

test.afterEach(async () => {
  if (cleanup) await cleanup();
});

test("administradora acessa os logs de exclusão pela guia Cadastros", async ({ page }) => {
  await signInThroughApp(page, admin);
  await page.getByRole("button", { name: "Cadastros" }).click();
  await page.getByRole("tab", { name: "Logs" }).click();
  await expect(page.getByRole("heading", { name: "Logs de exclusão de vendas" })).toBeVisible();
  await expect(page.getByText("Registro permanente das exclusões realizadas por administradores.")).toBeVisible();
});
