import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Cliente Supabase para uso dentro de Route Handlers (app/api/.../route.ts),
 * ligado à sessão do usuário logado via cookies. Respeita o RLS normalmente
 * (não usa a chave secreta) — para operações que precisam ignorar RLS
 * (ex.: criar usuário), use lib/supabase/server.ts (getSupabaseAdmin).
 */
export function getSupabaseRouteClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}

/** Retorna o profile (com perfil/permissões) do usuário autenticado na
 * requisição atual, ou null se não houver sessão. */
export async function getProfileAtual() {
  const supabase = getSupabaseRouteClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("gp_profiles").select("*").eq("id", user.id).single();
  // Pool de auth compartilhado com outro sistema: só entra quem um admin ativou.
  if (profile && !profile.ativo) return null;
  return profile;
}
