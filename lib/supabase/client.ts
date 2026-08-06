"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase para uso no navegador (login, leitura de histórico do
 * próprio usuário etc.). Usa a chave publicável — segura para expor no
 * frontend porque as permissões reais são impostas pelo RLS no banco.
 */
export function getSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
