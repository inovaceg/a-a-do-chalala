import { test, expect } from "@playwright/test";

test("adiciona produto e conclui venda no PDV", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Bom dia, Mariana" })).toBeVisible();
  await page.getByRole("button", { name: "Nova venda", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Monte seu pedido" })).toBeVisible();
  await expect(page.getByText("Novo pedido iniciado. Selecione os produtos para começar.")).toBeVisible();
  await page.getByRole("button", { name: "Adicionar Açaí Tradicional" }).click();
  await expect(page.getByText("Escolha os complementos; cada adicional é cobrado por fora.")).toBeVisible();
  await page.getByRole("button", { name: "Adicionar ao pedido" }).click();
  await expect(page.getByText("R$ 18,00").first()).toBeVisible();
  await page.getByRole("button", { name: /Cobrar pedido/ }).click();
  const receipt = page.getByRole("dialog");
  await expect(receipt.getByRole("heading", { name: "Comprovante não fiscal" })).toBeVisible();
  await expect(receipt.getByText("Açaí Tradicional", { exact: true })).toBeVisible();
  await expect(receipt.getByRole("button", { name: "Imprimir / Salvar PDF" })).toBeVisible();
});
