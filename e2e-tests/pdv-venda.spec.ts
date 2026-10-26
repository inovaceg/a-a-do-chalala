import { test, expect } from "@playwright/test";
import { createTestAccount, signInThroughApp, type TestAccount } from "./fixtures/supabase-user";

let operator: TestAccount;
let cleanup: () => Promise<void>;
let verifySale: (receiptNumber: string) => ReturnType<Awaited<ReturnType<typeof createTestAccount>>["verifySale"]>;

test.beforeEach(async () => {
  const created = await createTestAccount("operator");
  operator = created.account;
  cleanup = created.cleanup;
  verifySale = created.verifySale;
});

test.afterEach(async () => {
  if (cleanup) await cleanup();
});

test("operadora só acessa PDV e vendas e conclui uma venda com pagamento dividido", async ({ page }) => {
  await signInThroughApp(page, operator);
  await expect(page.getByRole("heading", { name: "PDV", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "PDV" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Vendas" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Visão geral" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Produtos & estoque" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Financeiro" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Equipe" })).toHaveCount(0);

  await page.getByRole("button", { name: "Adicionar Açaí Tradicional" }).click();
  await expect(page.getByText("Escolha os complementos; cada adicional é cobrado por fora.")).toBeVisible();
  await page.getByRole("button", { name: "Adicionar ao pedido" }).click();
  await expect(page.getByText("R$ 18,00").first()).toBeVisible();
  await page.keyboard.press("F9");
  const checkout = page.getByRole("dialog");
  await expect(checkout.getByRole("heading", { name: "Pagamento e troco" })).toBeVisible();
  await checkout.getByRole("button", { name: "Adicionar forma" }).click();
  await checkout.getByLabel("Valor da forma 1").fill("10");
  await checkout.getByLabel("Valor da forma 1").press("Enter");
  await expect(checkout.getByLabel("Forma de pagamento 2")).toBeFocused();
  await checkout.getByLabel("Forma de pagamento 2").press("Enter");
  await expect(checkout.getByLabel("Valor da forma 2")).toBeFocused();
  await checkout.getByLabel("Valor da forma 2").fill("8");
  await checkout.getByLabel("Valor da forma 2").press("Enter");
  await expect(checkout.getByRole("button", { name: /Concluir venda/ })).toBeFocused();
  await page.keyboard.press("F9");
  const receipt = page.getByRole("dialog");
  await expect(receipt.getByRole("heading", { name: "Comprovante não fiscal" })).toBeVisible();
  await expect(receipt.getByText("PIX", { exact: true })).toBeVisible();
  await expect(receipt.getByText("Açaí Tradicional", { exact: true })).toBeVisible();
  const receiptText = await receipt.getByText(/Venda #CH-/).textContent();
  const receiptNumber = receiptText?.match(/Venda #(CH-[A-Z0-9]+)/)?.[1];
  expect(receiptNumber).toBeTruthy();
  const persistedSale = await verifySale(receiptNumber!);
  expect(persistedSale.created_by).toBe(operator.id);
  expect(persistedSale.cash_session_id).toBeTruthy();
  expect(Number(persistedSale.total)).toBe(18);
  expect(persistedSale.sale_items).toEqual([{ product_name: "Açaí Tradicional" }]);
  expect(persistedSale.sale_payments).toHaveLength(2);
  await expect(receipt.getByRole("button", { name: "Imprimir / Salvar PDF" })).toBeVisible();
});
