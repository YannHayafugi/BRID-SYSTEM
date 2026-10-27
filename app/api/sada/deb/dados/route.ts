import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { somenteDigitos } from "@/lib/mascaras";
import { cnpjsDoFiltro } from "@/lib/sada/clientes";
import {
  ehCategoria,
  type Exigencia,
  type OrigemCategoria,
  type ResumoEstoque,
  type SiglaCategoria,
} from "@/lib/sada/categoria";

export const runtime = "nodejs";

/**
 * Ficha de dados do ente para o documento de debênture.
 *
 * Uma rota só devolvendo as três coisas que a tela mostra junto — siglas,
 * prontidão e quadro resumo — em vez de três idas ao servidor para montar uma
 * página. São três consultas pequenas sobre materialized views; separá-las
 * triplicaria a latência sem ganhar nada.
 *
 * SEM cache de leitura (CACHE_LEITURA) de propósito: aqui a pessoa classifica
 * uma sigla e espera ver a mudança, e 30 segundos de resposta velha viram um
 * defeito difícil de explicar.
 */

function semAcesso(profile: { is_superadmin?: boolean; pode_ver_sada?: boolean } | null) {
  if (!profile) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!profile.is_superadmin && !profile.pode_ver_sada) {
    return NextResponse.json({ erro: "Sem acesso ao SADA." }, { status: 403 });
  }
  return null;
}

const num = (v: unknown) => Number(v ?? 0);
const numOuNulo = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function daSigla(r: Record<string, unknown>): SiglaCategoria {
  return {
    cnpjOrgao: String(r.cnpj_orgao ?? ""),
    sigla: String(r.sigla ?? ""),
    categoria: ehCategoria(r.categoria) ? r.categoria : "nao_estabelecido",
    origem: (r.origem === "ente" || r.origem === "global" ? r.origem : "heuristica") as OrigemCategoria,
    titulosDa: num(r.titulos_da),
    principalDa: num(r.principal_da),
    titulosLanc: num(r.titulos_lanc),
    titulosRec: num(r.titulos_rec),
  };
}

function doResumo(r: Record<string, unknown>): ResumoEstoque {
  return {
    cnpjOrgao: String(r.cnpj_orgao ?? ""),
    titulos: num(r.titulos),
    principal: num(r.principal),
    correcao: num(r.correcao),
    juros: num(r.juros),
    multa: num(r.multa),
    total: num(r.total),
    safraMin: numOuNulo(r.safra_min),
    safraMax: numOuNulo(r.safra_max),
    devedores: num(r.devedores),
    ticketMedio: numOuNulo(r.ticket_medio),
    ticketMedioSemTop10: numOuNulo(r.ticket_medio_sem_top10),
    concentracaoTop10: numOuNulo(r.concentracao_top10),
  };
}

/** GET /api/sada/deb/dados?cliente=<uuid> */
export async function GET(req: NextRequest) {
  const profile = await getProfileAtual();
  const barrado = semAcesso(profile);
  if (barrado) return barrado;

  let cnpjs: string[] | null;
  try {
    cnpjs = await cnpjsDoFiltro(new URL(req.url).searchParams.get("cliente"));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
  // Cliente sem nenhum CNPJ vinculado: a lista vazia no `in` do PostgREST
  // devolveria tudo em vez de nada. Respondemos vazio e a tela explica.
  if (cnpjs !== null && cnpjs.length === 0) {
    return NextResponse.json({ siglas: [], prontidao: [], resumo: [], semVinculo: true });
  }

  const sb = getSupabaseAdmin();
  // Os três filtros são escritos à mão, e não por um ajudante genérico: o
  // encadeamento condicional do PostgREST faz o tsc explodir em "type
  // instantiation is excessively deep" quando passa por uma função genérica.
  const qSiglas = sb.from("sada_vw_sigla_categoria").select("*")
    .order("principal_da", { ascending: false });
  const qProntidao = sb.from("sada_vw_deb_prontidao").select("*").order("codigo");
  const qResumo = sb.from("sada_mv_estoque_resumo").select("*");

  const [siglas, prontidao, resumo] = await Promise.all([
    cnpjs ? qSiglas.in("cnpj_orgao", cnpjs) : qSiglas,
    cnpjs ? qProntidao.in("cnpj_orgao", cnpjs) : qProntidao,
    cnpjs ? qResumo.in("cnpj_orgao", cnpjs) : qResumo,
  ]);

  const err = [siglas, prontidao, resumo].find((r) => r.error);
  if (err?.error) return NextResponse.json({ erro: err.error.message }, { status: 500 });

  return NextResponse.json({
    siglas: (siglas.data ?? []).map(daSigla),
    prontidao: (prontidao.data ?? []).map((r) => ({
      cnpjOrgao: String(r.cnpj_orgao ?? ""),
      codigo: String(r.codigo ?? ""),
      pronto: r.pronto === true,
      exigencia: String(r.exigencia ?? ""),
      detalhe: String(r.detalhe ?? ""),
    })) as (Exigencia & { cnpjOrgao: string })[],
    resumo: (resumo.data ?? []).map(doResumo),
  });
}

/**
 * POST /api/sada/deb/dados — classifica uma sigla.
 *
 * Corpo: { sigla, categoria, cnpjOrgao?, observacao? }
 *
 * Sem `cnpjOrgao` a classificação é GLOBAL e passa a valer para todo ente que
 * use aquela sigla — por isso só superadmin pode gravá-la. A classificação do
 * próprio ente qualquer usuário do SADA ajusta: ela não sai dali.
 *
 * Não há refresh de materialized view aqui, e é de propósito: o inventário de
 * siglas (caro) é MV, mas a categoria (barata) mora numa view comum por cima.
 * Salvar aparece na hora.
 */
export async function POST(req: NextRequest) {
  const profile = await getProfileAtual();
  const barrado = semAcesso(profile);
  if (barrado) return barrado;

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const sigla = String(corpo.sigla ?? "").trim();
  if (!sigla) return NextResponse.json({ erro: "Sigla é obrigatória." }, { status: 400 });

  if (!ehCategoria(corpo.categoria)) {
    return NextResponse.json({ erro: "Categoria inválida." }, { status: 400 });
  }

  let cnpj: string | null = null;
  if (corpo.cnpjOrgao) {
    cnpj = somenteDigitos(String(corpo.cnpjOrgao));
    if (cnpj.length !== 14) {
      return NextResponse.json({ erro: "CNPJ do ente inválido." }, { status: 400 });
    }
  } else if (!profile!.is_superadmin) {
    return NextResponse.json(
      { erro: "Só superadmin classifica uma sigla para todos os entes." },
      { status: 403 },
    );
  }

  const { data, error } = await getSupabaseAdmin()
    .from("sada_tributo_categoria")
    .upsert(
      {
        cnpj_orgao: cnpj,
        sigla,
        categoria: corpo.categoria,
        observacao: corpo.observacao ? String(corpo.observacao).trim() : null,
        definido_por: profile!.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cnpj_orgao,sigla" },
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: Number(data?.id) });
}

/**
 * DELETE /api/sada/deb/dados?sigla=IPTU&cnpjOrgao=...
 *
 * Apaga a decisão e devolve a sigla para a camada de baixo — a classificação
 * global, se houver, ou o chute da heurística. Não some do documento: a sigla
 * continua lá, só volta a ser palpite.
 */
export async function DELETE(req: NextRequest) {
  const profile = await getProfileAtual();
  const barrado = semAcesso(profile);
  if (barrado) return barrado;

  const sp = new URL(req.url).searchParams;
  const sigla = String(sp.get("sigla") ?? "").trim();
  if (!sigla) return NextResponse.json({ erro: "Sigla é obrigatória." }, { status: 400 });

  const cnpjBruto = sp.get("cnpjOrgao");
  const cnpj = cnpjBruto ? somenteDigitos(cnpjBruto) : null;
  if (cnpjBruto && cnpj!.length !== 14) {
    return NextResponse.json({ erro: "CNPJ do ente inválido." }, { status: 400 });
  }
  if (!cnpj && !profile!.is_superadmin) {
    return NextResponse.json(
      { erro: "Só superadmin mexe na classificação de todos os entes." },
      { status: 403 },
    );
  }

  const sb = getSupabaseAdmin();
  const q = sb.from("sada_tributo_categoria").delete().eq("sigla", sigla);
  const { error } = await (cnpj ? q.eq("cnpj_orgao", cnpj) : q.is("cnpj_orgao", null));
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
