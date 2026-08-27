import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { cnpjsDoFiltro } from "@/lib/sada/clientes";

export const runtime = "nodejs";

/**
 * Qualidade da base SADA, em quatro modos:
 *
 *   resumo        — uma linha por verificação, com contagem (sada_vw_qualidade)
 *   linhas        — as linhas por trás de UMA verificação (exige `codigo`)
 *   duplicidades  — repetição na base vigente
 *   incoerencias  — cruzamentos entre dívida ativa e recebimentos
 *
 * Os três últimos são caros: sempre saem com limite e, quando há cliente
 * selecionado, filtrados por CNPJ. Ver os comentários das views no schema —
 * a de incoerências faz join entre duas tabelas grandes e é a candidata a
 * estourar o statement_timeout.
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
  const limite = Math.min(Math.max(Number(sp.get("limite") ?? LIMITE_PADRAO) || LIMITE_PADRAO, 1), LIMITE_MAX);

  let cnpjs: string[] | null;
  try {
    cnpjs = await cnpjsDoFiltro(sp.get("cliente"));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }

  // Cliente selecionado que ainda não tem CNPJ vinculado: devolve vazio em vez
  // de cair no "sem filtro", que mostraria a base inteira como se fosse dele.
  if (cnpjs !== null && cnpjs.length === 0) {
    return NextResponse.json(
      modo === "resumo"
        ? { checks: [], resumo: { comProblema: 0, totalOcorrencias: 0 }, semVinculo: true }
        : { linhas: [], truncado: false, semVinculo: true },
    );
  }

  const sb = getSupabaseAdmin();
  const num = (v: unknown) => Number(v ?? 0);

  // ------------------------------------------------------------------ resumo
  if (modo === "resumo") {
    let q = sb.from("sada_vw_qualidade").select("codigo, categoria, tabela, problema, qtd, base");
    if (cnpjs) q = q.in("cnpj_orgao", cnpjs);
    const { data, error } = await q;
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

    // A view agora devolve uma linha por ente; aqui somamos o conjunto do
    // cliente (ou de todos os entes, quando não há filtro).
    const porCodigo = new Map<string, {
      codigo: string; categoria: string; tabela: string; problema: string; qtd: number; base: number;
    }>();
    for (const c of data ?? []) {
      const codigoLinha = String(c.codigo);
      const atual = porCodigo.get(codigoLinha) ?? {
        codigo: codigoLinha,
        categoria: String(c.categoria),
        tabela: String(c.tabela),
        problema: String(c.problema),
        qtd: 0,
        base: 0,
      };
      atual.qtd += num(c.qtd);
      atual.base += num(c.base);
      porCodigo.set(codigoLinha, atual);
    }

    const checks = Array.from(porCodigo.values())
      .map((c) => ({ ...c, pct: c.base > 0 ? Math.round((10000 * c.qtd) / c.base) / 100 : 0 }))
      .sort((a, b) => b.qtd - a.qtd);

    return NextResponse.json({
      checks,
      resumo: {
        comProblema: checks.filter((c) => c.qtd > 0).length,
        totalOcorrencias: checks.reduce((s, c) => s + c.qtd, 0),
      },
    });
  }

  // ------------------------------------------------------------------ linhas
  if (modo === "linhas") {
    if (!codigo) {
      return NextResponse.json({ erro: "Informe o codigo da verificação." }, { status: 400 });
    }
    let q = sb
      .from("sada_vw_qualidade_linhas")
      .select("cnpj_orgao, codigo, tabela, ano, sequencia, sigla, inscricao, cnpj_cpf, valor, detalhe")
      .eq("codigo", codigo)
      .limit(limite + 1);
    if (cnpjs) q = q.in("cnpj_orgao", cnpjs);
    const { data, error } = await q;
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json({
      linhas: (data ?? []).slice(0, limite),
      truncado: (data ?? []).length > limite,
    });
  }

  // ----------------------------------------------------------- duplicidades
  if (modo === "duplicidades") {
    let q = sb
      .from("sada_vw_duplicidades")
      .select("cnpj_orgao, tipo, tabela, ano, sequencia, sigla, cnpj_cpf, valor, ocorrencias, detalhe")
      .order("ocorrencias", { ascending: false })
      .limit(limite + 1);
    if (cnpjs) q = q.in("cnpj_orgao", cnpjs);
    const { data, error } = await q;
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json({
      linhas: (data ?? []).slice(0, limite),
      truncado: (data ?? []).length > limite,
    });
  }

  // ------------------------------------------------------------ incoerencias
  if (modo === "incoerencias") {
    let q = sb
      .from("sada_vw_incoerencias")
      .select("cnpj_orgao, codigo, tabela, ano, sequencia, sigla, cnpj_cpf, valor, detalhe")
      .limit(limite + 1);
    if (cnpjs) q = q.in("cnpj_orgao", cnpjs);
    const { data, error } = await q;
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json({
      linhas: (data ?? []).slice(0, limite),
      truncado: (data ?? []).length > limite,
    });
  }

  return NextResponse.json({ erro: "Modo inválido." }, { status: 400 });
}
