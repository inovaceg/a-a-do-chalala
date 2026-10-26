import { expect, test } from "@playwright/test";
import { createTestAccount, signInThroughApp, type TestAccount } from "./fixtures/supabase-user";

let adminAccount: TestAccount;
let cleanup: () => Promise<void>;
let cleanupExtra: (name: string) => Promise<void>;
let verifyExtra: (name: string) => Promise<{ id: string; name: string; price: number; is_active: boolean }>;
let extraNames: string[] = [];

test.beforeEach(async () => {
  const created = await createTestAccount("admin");
  adminAccount = created.account;
  cleanup = created.cleanup;
  cleanupExtra = created.cleanupExtra;
  verifyExtra = created.verifyExtra;
  extraNames = [];
});

test.afterEach(async () => {
  for (const name of extraNames) await cleanupExtra(name);
  if (cleanup) await cleanup();
});

test("administradora cria e edita complementos com persistência no Supabase", async ({ page }) => {
  const suffix = `${Date.now()}`;
  const extraName = `Complemento teste ${suffix}`;
  const editedName = `${extraName} editado`;
  extraNames.push(extraName);

  await signInThroughApp(page, adminAccount);
  await page.getByRole("button", { name: "Produtos & estoque" }).click();
  await page.getByRole("button", { name: "Gerenciar complementos" }).click();
  const manager = page.locator(".extra-manager-panel");
  await manager.getByRole("button", { name: "Novo complemento" }).click();
  const form = page.locator(".extra-manager-form");
  await form.getByLabel("Nome").fill(extraName);
  await form.getByLabel("Preço adicional (R$)").fill("5.25");
  await form.getByRole("button", { name: "Salvar complemento" }).click();
  await expect(manager.getByText(extraName)).toBeVisible();
  const savedExtra = await verifyExtra(extraName);
  expect(Number(savedExtra.price)).toBe(5.25);

  await manager.getByRole("button", { name: `Editar ${extraName}` }).click();
  await form.getByLabel("Nome").fill(editedName);
  await form.getByLabel("Preço adicional (R$)").fill("6.50");
  await form.getByRole("button", { name: "Salvar complemento" }).click();
  await expect(manager.getByText(editedName)).toBeVisible();
  const updatedExtra = await verifyExtra(editedName);
  expect(Number(updatedExtra.price)).toBe(6.5);
  extraNames.push(editedName);
});
