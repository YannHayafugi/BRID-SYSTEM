"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase para uso no navegador (login, leitura de histórico do
 * próprio usuário etc.). Usa a chave publicável — segura para expor no
 * frontend porque as permissões reais são impostas pelo RLS no banco.
 */
export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Variáveis de ambiente do Supabase ausentes (NEXT_PUBLIC_SUPABASE_URL / " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY). São inlinadas em tempo de build: " +
        "defina-as no ambiente e refaça o deploy."
    );
  }

  return createBrowserClient(url, publishableKey);
}
