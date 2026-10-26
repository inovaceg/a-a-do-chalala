import { test, expect } from "@playwright/test";
import { createTestAccount, signInThroughApp } from "./fixtures/supabase-user";

test("administradora envia e acompanha um trabalho de teste de impressão", async ({ page }) => {
  const created = await createTestAccount("admin");
  try {
    await signInThroughApp(page, created.account);
    await page.getByRole("button", { name: "PDV" }).click();
    await page.getByText("Cupom sem identificação").click();
    await page.getByRole("button", { name: "Abrir cupom" }).click();
    const printPanel = page.getByRole("region", { name: "Impressão centralizada" });
    await printPanel.getByRole("button", { name: "Enviar impressão de teste" }).click();
    await expect(printPanel.getByText("Pendente", { exact: true })).toBeVisible();
  } finally {
    await created.cleanup();
  }
});
