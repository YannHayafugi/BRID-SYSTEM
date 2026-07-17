import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Atualiza a sessão do Supabase a cada requisição (renova o cookie antes que
 * expire) e devolve o usuário autenticado, se houver. Usado pelo middleware
 * (middleware.ts na raiz do projeto) para proteger rotas.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Pool de auth compartilhado com outro sistema: só é considerado "logado"
  // neste app quem tem gp_profiles.ativo = true (mesma regra de
  // getProfileAtual, em lib/supabase/route.ts). Sem isso, um usuário
  // autenticado no Supabase mas ainda não ativado aqui entra em loop:
  // as rotas o deixam passar (user existe), as APIs devolvem 401 (perfil
  // inativo), o cliente manda de volta para /login, e o middleware manda
  // de volta para "/" por já ver um `user` válido.
  // Mesma regra de getProfileAtual: sem perfil (ainda não criado) ou com
  // ativo=false, trata como não autenticado para este app.
  let ativo = false;
  if (user) {
    const { data: perfil } = await supabase.from("gp_profiles").select("ativo").eq("id", user.id).single();
    ativo = !!perfil?.ativo;
  }

  return { supabaseResponse, user, autenticado: !!user && ativo, contaInativa: !!user && !ativo };
}
