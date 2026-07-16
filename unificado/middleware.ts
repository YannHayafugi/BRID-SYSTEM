import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const ROTAS_PUBLICAS = ["/login"];

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);

  const path = request.nextUrl.pathname;
  const rotaPublica = ROTAS_PUBLICAS.some((r) => path === r || path.startsWith(r + "/"));

  // Rotas de API tratam sua própria autorização (ou dependem do RLS do
  // Supabase); não redirecionamos aqui para não quebrar chamadas fetch com
  // uma resposta de redirecionamento HTML no lugar de JSON.
  if (path.startsWith("/api/")) {
    return supabaseResponse;
  }

  if (!user && !rotaPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("proximo", path);
    return NextResponse.redirect(url);
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Aplica a todas as rotas, exceto arquivos estáticos e de imagem do Next.js.
     * As rotas de API cuidam da própria autenticação/RLS via Supabase.
     */
    "/((?!_next/static|_next/image|favicon.ico|assets/).*)",
  ],
};
