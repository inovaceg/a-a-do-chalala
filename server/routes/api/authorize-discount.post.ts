import { timingSafeEqual } from "node:crypto";
import { defineHandler } from "nitro";
import { useRuntimeConfig } from "nitro/runtime-config";
import { createError, readBody } from "nitro/h3";

export default defineHandler(async (event) => {
  const body = await readBody<{ password?: string }>(event);
  const configuredPassword = useRuntimeConfig(event).adminPassword;
  if (typeof configuredPassword !== "string" || configuredPassword.length === 0) {
    throw createError({ statusCode: 503, statusMessage: "A senha da administradora ainda não foi configurada no servidor." });
  }
  if (typeof body?.password !== "string" || body.password.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "Informe a senha da administradora." });
  }
  const provided = Buffer.from(body.password);
  const expected = Buffer.from(configuredPassword);
  const matches = provided.length === expected.length && timingSafeEqual(provided, expected);
  if (!matches) throw createError({ statusCode: 401, statusMessage: "Senha da administradora incorreta." });
  return { authorized: true };
});
