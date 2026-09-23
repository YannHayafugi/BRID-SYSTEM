import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { somenteDigitos } from "@/lib/mascaras";
import { cnpjsDoFiltro } from "@/lib/sada/clientes";
import { TRIBUTO_TODOS, type RegraTributaria } from "@/lib/sada/tributario";

export const runtime = "nodejs";

/**
 * Regras tributárias por ente (multa, juros, correção) com vigência.
 *
 * Leitura liberada a quem usa o SADA. Escrita é só de superadmin: a regra
 * define o que a validação considera certo — alíquota errada aqui transforma
 * a base inteira em "divergente", ou pior, esconde cobrança indevida.
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
    cnpjOrgao: String(r.cnpj_orgao),
    tributo: String(r.tributo),
    vigenciaInicio: String(r.vigencia_inicio),
    vigenciaFim: r.vigencia_fim ? String(r.vigencia_fim) : null,
    multaTipo: r.multa_tipo === "progressiva" ? "progressiva" : "unica",
    multaPct: Number(r.multa_pct ?? 0),
    multaTetoPct: n(r.multa_teto_pct),
    jurosModo: r.juros_modo === "selic" ? "selic" : "mensal",
    jurosPctMes: Number(r.juros_pct_mes ?? 0),
    selicMediaAA: n(r.selic_media_aa),
    correcaoIndice: r.correcao_indice ? String(r.correcao_indice) : null,
    correcaoPctAA: n(r.correcao_pct_aa),
    honorariosPct: n(r.honorarios_pct),
    toleranciaPct: Number(r.tolerancia_pct ?? 5),
    toleranciaReais: Number(r.tolerancia_reais ?? 1),
    fundamento: r.fundamento ? String(r.fundamento) : null,
    observacao: r.observacao ? String(r.observacao) : null,
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
  if (cnpjs !== null && cnpjs.length === 0) return NextResponse.json({ regras: [], semVinculo: true });

  const sb = getSupabaseAdmin();
  let q = sb
    .from("sada_regra_tributaria")
    .select("*")
    .order("cnpj_orgao")
    .order("tributo")
    .order("vigencia_inicio", { ascending: false });
  if (cnpjs) q = q.in("cnpj_orgao", cnpjs);

  const { data, error } = await q;
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ regras: (data ?? []).map(daLinha) });
}

const faixa = (v: unknown, min: number, max: number): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
};

/** POST /api/sada/regras — cria ou atualiza (mesma chave: ente+tributo+início). */
export async function POST(req: NextRequest) {
  const profile = await getProfileAtual();
  const barrado = semAcesso(profile);
  if (barrado) return barrado;
  if (!profile!.is_superadmin) {
    return NextResponse.json({ erro: "Só superadmin cadastra regras." }, { status: 403 });
  }

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const cnpj = somenteDigitos(String(corpo.cnpjOrgao ?? ""));
  if (cnpj.length !== 14) {
    return NextResponse.json({ erro: "CNPJ do ente inválido." }, { status: 400 });
  }
  const inicio = String(corpo.vigenciaInicio ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) {
    return NextResponse.json({ erro: "Início da vigência é obrigatório." }, { status: 400 });
  }
  const fim = corpo.vigenciaFim ? String(corpo.vigenciaFim) : null;
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
  if (multaPct === null) return NextResponse.json({ erro: "Multa deve ficar entre 0 e 100%." }, { status: 400 });
  if (jurosModo === "mensal" && jurosPctMes === null) {
    return NextResponse.json({ erro: "Juros ao mês deve ficar entre 0 e 20%." }, { status: 400 });
  }

  const linha = {
    cnpj_orgao: cnpj,
    tributo: String(corpo.tributo ?? TRIBUTO_TODOS).trim().toUpperCase() || TRIBUTO_TODOS,
    vigencia_inicio: inicio,
    vigencia_fim: fim,
    multa_tipo: multaTipo,
    multa_pct: multaPct,
    multa_teto_pct: multaTipo === "progressiva" ? faixa(corpo.multaTetoPct, 0, 100) : null,
    juros_modo: jurosModo,
    juros_pct_mes: jurosPctMes ?? 0,
    selic_media_aa: jurosModo === "selic" ? faixa(corpo.selicMediaAA, 0, 100) : null,
    correcao_indice: corpo.correcaoIndice ? String(corpo.correcaoIndice).trim() : null,
    correcao_pct_aa: faixa(corpo.correcaoPctAA, -50, 100),
    honorarios_pct: faixa(corpo.honorariosPct, 0, 100),
    tolerancia_pct: faixa(corpo.toleranciaPct, 0, 100) ?? 5,
    tolerancia_reais: faixa(corpo.toleranciaReais, 0, 1_000_000) ?? 1,
    fundamento: corpo.fundamento ? String(corpo.fundamento).trim() : null,
    observacao: corpo.observacao ? String(corpo.observacao).trim() : null,
    criado_por: profile!.id,
    updated_at: new Date().toISOString(),
  };

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("sada_regra_tributaria")
    .upsert(linha, { onConflict: "cnpj_orgao,tributo,vigencia_inicio" })
    .select("*")
    .single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ regra: daLinha(data as Record<string, unknown>) });
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
