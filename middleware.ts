import { NextRequest, NextResponse } from "next/server";
import { updateSession, configSupabaseFaltando } from "@/lib/supabase/middleware";

// D52: "/" é a página inicial pública (landing) — vem antes do login.
const ROTAS_PUBLICAS = ["/", "/login"];

export async function middleware(request: NextRequest) {
  // Sem as variáveis do Supabase não há sessão a validar e nenhuma rota
  // funciona. Respondemos 503 com a causa em texto em vez de deixar o
  // createServerClient estourar: uma exceção aqui vira MIDDLEWARE_INVOCATION_FAILED
  // (500 opaco em TODAS as rotas, sem dizer qual variável faltou).
  const faltando = configSupabaseFaltando();
  if (faltando.length) {
    console.error(
      `[middleware] Supabase não configurado. Variáveis ausentes no build: ${faltando.join(", ")}. ` +
        "Defina-as no projeto (Vercel: Settings > Environment Variables) e faça um NOVO DEPLOY — " +
        "variáveis NEXT_PUBLIC_* são inlinadas em tempo de build."
    );
    return new NextResponse(
      `Configuração incompleta: ${faltando.join(", ")} não definida(s) no build.\n`,
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  const { supabaseResponse, autenticado, contaInativa } = await updateSession(request);

  const path = request.nextUrl.pathname;
  const rotaPublica = ROTAS_PUBLICAS.some((r) => path === r || (r !== "/" && path.startsWith(r + "/")));

  // Rotas de API tratam sua própria autorização (ou dependem do RLS do
  // Supabase); não redirecionamos aqui para não quebrar chamadas fetch com
  // uma resposta de redirecionamento HTML no lugar de JSON.
  if (path.startsWith("/api/")) {
    return supabaseResponse;
  }

  // Usa "autenticado" (Supabase Auth + gp_profiles.ativo), não só a sessão do
  // Supabase — senão um usuário logado no Auth mas ainda não ativado neste
  // app entra em loop: as páginas o deixam passar, as APIs devolvem 401 e
  // mandam de volta para /login, e o middleware manda de volta pra "/".
  if (!autenticado && !rotaPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("proximo", path);
    if (contaInativa) url.searchParams.set("erro", "inativo");
    return NextResponse.redirect(url);
  }

  // Logado no /login vai direto ao Dashboard (a landing "/" continua
  // acessível para qualquer um).
  if (autenticado && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Aplica a todas as rotas, exceto arquivos estáticos e de imagem do Next.js
     * e arquivos estáticos servidos direto de /public (logo, ícones etc. —
     * precisam carregar mesmo sem sessão, ex.: na própria tela de login).
     * As rotas de API cuidam da própria autenticação/RLS via Supabase.
     */
    "/((?!_next/static|_next/image|favicon.ico|assets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
