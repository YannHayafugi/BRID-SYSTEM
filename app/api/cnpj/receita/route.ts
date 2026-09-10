import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { somenteDigitos, cnpjValido } from "@/lib/mascaras";
import { buscarNaReceita, ErroReceita, VALIDADE_DIAS } from "@/lib/cnpj/receita";

export const runtime = "nodejs";

/**
 * GET /api/cnpj/receita?cnpj=...[&forcar=1]
 *
 * Situação cadastral do CNPJ, servida do cache e renovada da origem quando
 * velha. A chamada externa sai daqui, do servidor, e nunca do navegador: a
 * BrasilAPI limita por IP, e do cliente cada usuário gastaria a própria cota
 * além de expor a origem a CORS.
 */
export async function GET(req: NextRequest) {
  const profile = await getProfileAtual();
  if (!profile) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const cnpj = somenteDigitos(sp.get("cnpj") ?? "");
  const forcar = sp.get("forcar") === "1";

  if (cnpj.length === 11) {
    // Distinguir de "não encontrado": um CPF regular não tem onde ser
    // consultado, e tratar isso como falha sugeriria irregularidade.
    return NextResponse.json(
      { semConsulta: true, motivo: "CPF não tem consulta pública de situação cadastral." },
      { status: 200 },
    );
  }
  if (!cnpjValido(cnpj)) {
    return NextResponse.json({ erro: "CNPJ inválido." }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data: cache } = await sb
    .from("consulta_cnpj")
    .select("*")
    .eq("cnpj", cnpj)
    .maybeSingle();

  const idadeDias = cache
    ? (Date.now() - new Date(cache.consultado_em as string).getTime()) / 86_400_000
    : Infinity;

  if (cache && !forcar && idadeDias < VALIDADE_DIAS) {
    return NextResponse.json({ dados: cache, doCache: true, idadeDias: Math.floor(idadeDias) });
  }

  try {
    const dados = await buscarNaReceita(cnpj);
    const { error } = await sb
      .from("consulta_cnpj")
      .upsert({ ...dados, consultado_em: new Date().toISOString() }, { onConflict: "cnpj" });
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json({ dados, doCache: false, idadeDias: 0 });
  } catch (e) {
    const erro = e as ErroReceita;
    // Origem fora do ar com cache velho em mãos: melhor entregar o dado
    // antigo, marcado como antigo, do que devolver erro e nada.
    if (cache) {
      return NextResponse.json({
        dados: cache,
        doCache: true,
        idadeDias: Math.floor(idadeDias),
        avisoOrigem: erro.message,
      });
    }
    return NextResponse.json({ erro: erro.message }, { status: erro.status ?? 502 });
  }
}
