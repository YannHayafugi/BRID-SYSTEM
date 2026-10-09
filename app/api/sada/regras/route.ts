import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { somenteDigitos } from "@/lib/mascaras";
import { cnpjsDoFiltro } from "@/lib/sada/clientes";
import { TRIBUTO_TODOS, ehDataISO, type NivelRegra, type RegraTributaria } from "@/lib/sada/tributario";

export const runtime = "nodejs";

/**
 * Regras da validação tributária, em dois níveis:
 *
 *   geral      — lei geral, sem CNPJ: limites (multa, juros, prescrição) e a
 *                regra supletiva usada onde não há lei municipal;
 *   municipal  — as alíquotas do Código Tributário do ente.
 *
 * Leitura liberada a quem usa o SADA — e a lei geral vem SEMPRE, mesmo com
 * cliente selecionado, porque é ela que explica o que foi conferido nos entes
 * sem lei própria. Escrita é só de superadmin: a regra define o que a
 * validação considera certo — alíquota errada aqui transforma a base inteira
 * em "divergente", ou pior, esconde cobrança indevida.
 */

function semAcesso(profile: { is_superadmin?: boolean; pode_ver_sada?: boolean } | null) {
  if (!profile) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!profile.is_superadmin && !profile.pode_ver_sada) {
    return NextResponse.json({ erro: "Sem acesso ao SADA." }, { status: 403 });
  }
  return null;
}

/** Colunas do banco -> formato da tela. */
function daLinha(r: Record<string, unknown>): RegraTributaria {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: Number(r.id),
    nivel: (r.nivel === "geral" ? "geral" : "municipal") as NivelRegra,
    cnpjOrgao: r.cnpj_orgao ? String(r.cnpj_orgao) : null,
    tributo: String(r.tributo),
    vigenciaInicio: String(r.vigencia_inicio),
    vigenciaFim: r.vigencia_fim ? String(r.vigencia_fim) : null,
    multaTipo: r.multa_tipo === "progressiva" ? "progressiva" : "unica",
    multaPct: n(r.multa_pct),
    multaTetoPct: n(r.multa_teto_pct),
    jurosModo: r.juros_modo === "selic" ? "selic" : "mensal",
    jurosPctMes: n(r.juros_pct_mes),
    selicMediaAA: n(r.selic_media_aa),
    correcaoIndice: r.correcao_indice ? String(r.correcao_indice) : null,
    correcaoPctAA: n(r.correcao_pct_aa),
    honorariosPct: n(r.honorarios_pct),
    toleranciaPct: Number(r.tolerancia_pct ?? 5),
    toleranciaReais: Number(r.tolerancia_reais ?? 1),
    fundamento: r.fundamento ? String(r.fundamento) : null,
    observacao: r.observacao ? String(r.observacao) : null,
    tetoMultaPct: n(r.teto_multa_pct),
    tetoJurosPctMes: n(r.teto_juros_pct_mes),
    anosPrescricao: n(r.anos_prescricao),
  };
}

/** GET /api/sada/regras?cliente=<uuid> — regras dos CNPJs do cliente. */
export async function GET(req: NextRequest) {
  const profile = await getProfileAtual();
  const barrado = semAcesso(profile);
  if (barrado) return barrado;

  const sp = new URL(req.url).searchParams;
  let cnpjs: string[] | null;
  try {
    cnpjs = await cnpjsDoFiltro(sp.get("cliente"));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
  const sb = getSupabaseAdmin();
  let q = sb
    .from("sada_regra_tributaria")
    .select("*")
    .order("nivel")
    .order("cnpj_orgao")
    .order("tributo")
    .order("vigencia_inicio", { ascending: false });
  // Cliente selecionado: os CNPJs dele MAIS a lei geral (nivel = 'geral', sem
  // CNPJ). Um cliente sem CNPJ vinculado ainda enxerga a lei geral.
  if (cnpjs) q = q.or(`nivel.eq.geral,cnpj_orgao.in.(${cnpjs.join(",")})`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({
    regras: (data ?? []).map(daLinha),
    semVinculo: cnpjs !== null && cnpjs.length === 0,
  });
}

const faixa = (v: unknown, min: number, max: number): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
};

/**
 * POST /api/sada/regras — cria ou edita.
 *
 * Com `id`, edita aquela regra. Sem `id`, cria — e a chave
 * (ente/geral + tributo + início de vigência) é única: lei nova NÃO
 * sobrescreve a antiga, cadastra-se outra vigência.
 */
export async function POST(req: NextRequest) {
  const profile = await getProfileAtual();
  const barrado = semAcesso(profile);
  if (barrado) return barrado;
  if (!profile!.is_superadmin) {
    return NextResponse.json({ erro: "Só superadmin cadastra regras." }, { status: 403 });
  }

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const nivel: NivelRegra = corpo.nivel === "geral" ? "geral" : "municipal";

  // Lei geral vale para todos os entes e por isso não tem CNPJ; municipal sem
  // CNPJ viraria uma segunda lei geral sem querer.
  let cnpj: string | null = null;
  if (nivel === "municipal") {
    cnpj = somenteDigitos(String(corpo.cnpjOrgao ?? ""));
    if (cnpj.length !== 14) {
      return NextResponse.json({ erro: "CNPJ do ente inválido." }, { status: 400 });
    }
  }

  const inicio = String(corpo.vigenciaInicio ?? "");
  if (!ehDataISO(inicio)) {
    return NextResponse.json({ erro: "Início da vigência é obrigatório." }, { status: 400 });
  }
  const fim = corpo.vigenciaFim ? String(corpo.vigenciaFim) : null;
  // Sem conferir o formato, uma data torta chegava ao Postgres e voltava como
  // erro cru de tipo — e a comparação de texto abaixo não acusaria nada.
  if (fim && !ehDataISO(fim)) {
    return NextResponse.json({ erro: "Fim da vigência inválido." }, { status: 400 });
  }
  if (fim && fim < inicio) {
    return NextResponse.json({ erro: "Fim da vigência é anterior ao início." }, { status: 400 });
  }

  const jurosModo = corpo.jurosModo === "selic" ? "selic" : "mensal";
  const multaTipo = corpo.multaTipo === "progressiva" ? "progressiva" : "unica";

  // Percentual fora de faixa quase sempre é engano de unidade (0,01 no lugar
  // de 1, ou 1200 no lugar de 12). Recusamos em vez de gravar e depois
  // apontar a base inteira como divergente.
  const multaPct = faixa(corpo.multaPct, 0, 100);
  const jurosPctMes = faixa(corpo.jurosPctMes, 0, 20);

  // Na lei municipal, percentual em branco é engano: sem ele a validação
  // simplesmente não confere aquele encargo. Na lei geral é o normal —
  // a alíquota de multa é sempre municipal; a geral só fixa o teto.
  if (nivel === "municipal") {
    if (multaPct === null) {
      return NextResponse.json({ erro: "Multa deve ficar entre 0 e 100%." }, { status: 400 });
    }
    if (jurosModo === "mensal" && jurosPctMes === null) {
      return NextResponse.json({ erro: "Juros ao mês deve ficar entre 0 e 20%." }, { status: 400 });
    }
  }

  const linha = {
    nivel,
    cnpj_orgao: cnpj,
    tributo: String(corpo.tributo ?? TRIBUTO_TODOS).trim().toUpperCase() || TRIBUTO_TODOS,
    vigencia_inicio: inicio,
    vigencia_fim: fim,
    multa_tipo: multaTipo,
    multa_pct: multaPct,
    multa_teto_pct: multaTipo === "progressiva" ? faixa(corpo.multaTetoPct, 0, 100) : null,
    juros_modo: jurosModo,
    juros_pct_mes: jurosModo === "mensal" ? jurosPctMes : null,
    selic_media_aa: jurosModo === "selic" ? faixa(corpo.selicMediaAA, 0, 100) : null,
    correcao_indice: corpo.correcaoIndice ? String(corpo.correcaoIndice).trim() : null,
    correcao_pct_aa: faixa(corpo.correcaoPctAA, -50, 100),
    honorarios_pct: faixa(corpo.honorariosPct, 0, 100),
    tolerancia_pct: faixa(corpo.toleranciaPct, 0, 100) ?? 5,
    tolerancia_reais: faixa(corpo.toleranciaReais, 0, 1_000_000) ?? 1,
    fundamento: corpo.fundamento ? String(corpo.fundamento).trim() : null,
    observacao: corpo.observacao ? String(corpo.observacao).trim() : null,
    // Limites só existem na lei geral: numa municipal seriam ignorados pela
    // view, e guardá-los daria a impressão de que o ente pode elevar o teto.
    teto_multa_pct: nivel === "geral" ? faixa(corpo.tetoMultaPct, 0, 100) : null,
    teto_juros_pct_mes: nivel === "geral" ? faixa(corpo.tetoJurosPctMes, 0, 20) : null,
    anos_prescricao: nivel === "geral" ? faixa(corpo.anosPrescricao, 1, 50) : null,
    criado_por: profile!.id,
    updated_at: new Date().toISOString(),
  };

  const sb = getSupabaseAdmin();
  const id = Number(corpo.id);
  const resposta = Number.isInteger(id) && id > 0
    ? await sb.from("sada_regra_tributaria").update(linha).eq("id", id).select("*").single()
    : await sb.from("sada_regra_tributaria").insert(linha).select("*").single();

  if (resposta.error) {
    // 23505: já existe regra com a mesma chave. A mensagem crua do Postgres
    // fala de índice; aqui dizemos o que a pessoa precisa fazer.
    if (resposta.error.code === "23505") {
      return NextResponse.json(
        { erro: "Já existe regra para este tributo com esse início de vigência. Edite a existente ou use outra data." },
        { status: 409 },
      );
    }
    return NextResponse.json({ erro: resposta.error.message }, { status: 500 });
  }
  return NextResponse.json({ regra: daLinha(resposta.data as Record<string, unknown>) });
}

/** DELETE /api/sada/regras?id=123 */
export async function DELETE(req: NextRequest) {
  const profile = await getProfileAtual();
  const barrado = semAcesso(profile);
  if (barrado) return barrado;
  if (!profile!.is_superadmin) {
    return NextResponse.json({ erro: "Só superadmin exclui regras." }, { status: 403 });
  }

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ erro: "id inválido." }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { error } = await sb.from("sada_regra_tributaria").delete().eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
