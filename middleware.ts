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

  const path = request.nextUrl.pathname;

  // Chamadas de API não passam por aqui: o matcher já as exclui, e esta guarda
  // existe para o caso de alguém mexer no matcher. Vem ANTES de updateSession
  // de propósito — é justamente a ida ao Supabase que não queremos pagar duas
  // vezes, já que cada rota confere a sessão por conta própria. Redirecionar
  // também seria errado: um fetch receberia o HTML do login no lugar do JSON.
  if (path.startsWith("/api/")) return NextResponse.next();

  const { supabaseResponse, autenticado, contaInativa } = await updateSession(request);

  const rotaPublica = ROTAS_PUBLICAS.some((r) => path === r || (r !== "/" && path.startsWith(r + "/")));

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
     *
     * `api/` também fica de fora, e isso é latência, não estilo: cada rota já
     * confere a sessão por conta própria (getProfileAtual), então passar pelo
     * middleware antes cobrava DUAS idas extras ao Supabase por requisição —
     * uma em auth.getUser() e outra no perfil. Numa importação, que manda
     * centenas de lotes, isso somava centenas de idas e voltas só para
     * repetir uma verificação que a rota ia refazer em seguida.
     *
     * O que se perde: a renovação do cookie de sessão deixa de acontecer em
     * chamadas de API. Ela continua acontecendo em qualquer navegação de
     * página, e o cliente das rotas também renova quando o token expira.
     */
    "/((?!api/|_next/static|_next/image|favicon.ico|assets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
