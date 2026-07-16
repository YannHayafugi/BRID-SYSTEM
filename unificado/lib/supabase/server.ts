import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para uso exclusivo no servidor (API routes / Server Components).
 *
 * IMPORTANTE: usa a SUPABASE_SECRET_KEY (chave secreta, antigo "service_role"),
 * que ignora Row Level Security. Nunca importar este arquivo em código que roda
 * no navegador (não usar "use client").
 */
let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "Variáveis de ambiente do Supabase ausentes (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY)."
    );
  }

  adminClient = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return adminClient;
}
