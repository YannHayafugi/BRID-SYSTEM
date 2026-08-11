import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Atenção: variáveis NEXT_PUBLIC_* são inlinadas pelo Next.js em tempo de
// BUILD, inclusive no middleware. Se não estiverem definidas no ambiente do
// build, viram `undefined` no bundle — adicioná-las depois no painel não
// resolve sozinho, é preciso um novo deploy (rebuild).
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Devolve os nomes das variáveis de ambiente exigidas que estão faltando.
 * Vazio = configuração OK.
 *
 * Existe para o middleware poder responder um erro legível em vez de estourar
 * dentro do `createServerClient` — uma exceção ali derruba a invocação inteira
 * e a Vercel devolve MIDDLEWARE_INVOCATION_FAILED, que não diz o que faltou.
 */
export function configSupabaseFaltando(): string[] {
  const faltando: string[] = [];
  if (!SUPABASE_URL) faltando.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!SUPABASE_PUBLISHABLE_KEY) faltando.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return faltando;
}

/**
 * Atualiza a sessão do Supabase a cada requisição (renova o cookie antes que
 * expire) e devolve o usuário autenticado, se houver. Usado pelo middleware
 * (middleware.ts na raiz do projeto) para proteger rotas.
 *
 * Pressupõe configuração válida: chame `configSupabaseFaltando()` antes.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const faltando = configSupabaseFaltando();
  if (faltando.length) {
    throw new Error(`Supabase não configurado. Variáveis ausentes: ${faltando.join(", ")}.`);
  }

  const supabase = createServerClient(
    SUPABASE_URL!,
    SUPABASE_PUBLISHABLE_KEY!,
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
