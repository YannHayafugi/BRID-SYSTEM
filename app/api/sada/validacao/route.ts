import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { cnpjsDoFiltro } from "@/lib/sada/clientes";
import { VERIFICACAO_POR_CODIGO, VERIFICACOES } from "@/lib/sada/tributario";

export const runtime = "nodejs";

/**
 * Validação tributária da dívida ativa, em dois modos:
 *
 *   resumo — uma linha por verificação (sada_vw_validacao_tributaria)
 *   linhas — as dívidas por trás de UMA verificação (exige `codigo`)
 *
 * O cálculo mora no banco; aqui só somamos os entes do cliente e juntamos o
 * texto do catálogo (lib/sada/tributario.ts), que a view não carrega.
 *
 * O modo `linhas` passa por sada_vw_validacao_linhas, que cruza a dívida
 * ativa inteira com o cadastro de regras: sempre com limite, e com filtro de
 * cliente sempre que houver um selecionado.
 */

const LIMITE_PADRAO = 500;
const LIMITE_MAX = 5000;

export async function GET(req: NextRequest) {
  const profile = await getProfileAtual();
  if (!profile) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!profile.is_superadmin && !profile.pode_ver_sada) {
    return NextResponse.json({ erro: "Sem acesso ao SADA." }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const modo = sp.get("modo") ?? "resumo";
  const codigo = (sp.get("codigo") ?? "").trim();
  const limite = Math.min(
    Math.max(Number(sp.get("limite") ?? LIMITE_PADRAO) || LIMITE_PADRAO, 1),
    LIMITE_MAX,
  );

  let cnpjs: string[] | null;
  try {
    cnpjs = await cnpjsDoFiltro(sp.get("cliente"));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
  if (cnpjs !== null && cnpjs.length === 0) {
    return NextResponse.json(
      modo === "resumo"
        ? { checks: [], resumo: { comProblema: 0, totalOcorrencias: 0, base: 0 }, semVinculo: true }
        : { linhas: [], truncado: false, semVinculo: true },
    );
  }

  const sb = getSupabaseAdmin();

  // ------------------------------------------------------------------ resumo
  if (modo === "resumo") {
    let q = sb.from("sada_vw_validacao_tributaria").select("codigo, qtd, base");
    if (cnpjs) q = q.in("cnpj_orgao", cnpjs);
    const { data, error } = await q;
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

    // A view devolve uma linha por verificação POR ENTE; somamos o conjunto
    // do cliente.
    const somaQtd = new Map<string, number>();
    for (const r of data ?? []) {
      const cod = String(r.codigo);
      somaQtd.set(cod, (somaQtd.get(cod) ?? 0) + Number(r.qtd ?? 0));
    }
    // `base` (linhas examinadas) se repete em todas as verificações do mesmo
    // ente: somar tudo contaria a base onze vezes. Por isso filtramos por um
    // código só antes de somar os entes.
    const base = (data ?? [])
      .filter((r) => String(r.codigo) === VERIFICACOES[0].codigo)
      .reduce((s, r) => s + Number(r.base ?? 0), 0);

    const checks = VERIFICACOES.map((v) => {
      const qtd = somaQtd.get(v.codigo) ?? 0;
      return {
        codigo: v.codigo,
        rotulo: v.rotulo,
        explicacao: v.explicacao,
        fundamento: v.fundamento ?? null,
        gravidade: v.gravidade,
        dependeDeRegra: v.dependeDeRegra,
        qtd,
        base,
        pct: base > 0 ? Math.round((10000 * qtd) / base) / 100 : 0,
      };
    }).sort((a, b) => b.qtd - a.qtd);

    return NextResponse.json({
      checks,
      resumo: {
        comProblema: checks.filter((c) => c.qtd > 0).length,
        totalOcorrencias: checks.reduce((s, c) => s + c.qtd, 0),
        base,
      },
    });
  }

  // ------------------------------------------------------------------ linhas
  if (modo === "linhas") {
    if (!VERIFICACAO_POR_CODIGO.has(codigo)) {
      return NextResponse.json({ erro: "Verificação desconhecida." }, { status: 400 });
    }
    let q = sb
      .from("sada_vw_validacao_linhas")
      .select(
        "cnpj_orgao, codigo, ano, sequencia, sigla, inscricao, cnpj_cpf, mes_venc, ano_venc, " +
          "meses_atraso, valor, atualizacao, juros, multa, total, multa_esperada, juros_esperado, " +
          "correcao_esperada, regra_tributo",
      )
      .eq("codigo", codigo)
      .limit(limite + 1);
    if (cnpjs) q = q.in("cnpj_orgao", cnpjs);

    const { data, error } = await q;
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json({
      linhas: (data ?? []).slice(0, limite),
      truncado: (data ?? []).length > limite,
      verificacao: VERIFICACAO_POR_CODIGO.get(codigo),
    });
  }

  return NextResponse.json({ erro: "Modo inválido." }, { status: 400 });
}
