import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { somenteDigitos } from "@/lib/mascaras";
import { cnpjsDoFiltro } from "@/lib/sada/clientes";
import { normalizarSelecao, type ModeloDocumento } from "@/lib/sada/debenture";

export const runtime = "nodejs";

/**
 * Modelos de documento: qual conjunto de tópicos monta o InfoPack de um ente.
 *
 * O catálogo de tópicos NÃO passa por aqui — ele vem do código
 * (lib/sada/debenture.ts) e a tela já o tem. Esta rota só guarda a escolha.
 *
 * Toda leitura passa por `normalizarSelecao`: um modelo salvo antes de um
 * deploy pode citar slug que saiu do catálogo, e devolver isso cru quebraria
 * a montagem na cara de quem abriu.
 */

function semAcesso(profile: { is_superadmin?: boolean; pode_ver_sada?: boolean } | null) {
  if (!profile) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!profile.is_superadmin && !profile.pode_ver_sada) {
    return NextResponse.json({ erro: "Sem acesso ao SADA." }, { status: 403 });
  }
  return null;
}

/**
 * A migração desta onda pode não ter sido aplicada ainda. Sem isto, a tela
 * recebe o erro cru do Postgres ("relation does not exist") e parece defeito
 * do sistema, não passo de instalação que faltou.
 */
const TABELA_AUSENTE = "42P01";
function faltaMigracao(codigo?: string) {
  return codigo === TABELA_AUSENTE;
}
const AVISO_MIGRACAO =
  "A migração supabase/sada-deb-modelo.sql ainda não foi aplicada neste banco — " +
  "os modelos não podem ser salvos até lá.";

function doModelo(r: Record<string, unknown>): ModeloDocumento {
  return {
    id: Number(r.id),
    cnpjOrgao: r.cnpj_orgao ? String(r.cnpj_orgao) : null,
    nome: String(r.nome ?? ""),
    topicos: normalizarSelecao(r.topicos),
    padrao: r.padrao === true,
    atualizadoEm: r.updated_at ? String(r.updated_at) : null,
  };
}

/** GET /api/sada/deb/modelo?cliente=<uuid> — modelos do ente mais os globais. */
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

  const sb = getSupabaseAdmin();
  const q = sb.from("sada_deb_modelo").select("*").order("nome");
  // Cliente selecionado: os modelos dele MAIS os globais. Um cliente sem CNPJ
  // vinculado ainda enxerga os globais — é com eles que se começa.
  const { data, error } = cnpjs
    ? cnpjs.length > 0
      ? await q.or(`cnpj_orgao.is.null,cnpj_orgao.in.(${cnpjs.join(",")})`)
      : await q.is("cnpj_orgao", null)
    : await q;

  if (error) {
    if (faltaMigracao(error.code)) {
      return NextResponse.json({ modelos: [], avisoMigracao: AVISO_MIGRACAO });
    }
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ modelos: (data ?? []).map(doModelo) });
}

/**
 * POST /api/sada/deb/modelo — cria ou renomeia/atualiza.
 *
 * Corpo: { id?, nome, topicos[], cnpjOrgao?, padrao? }
 *
 * Modelo global (sem CNPJ) é só de superadmin: ele aparece para todos os
 * entes e vira o ponto de partida de quem montar o próximo documento.
 */
export async function POST(req: NextRequest) {
  const profile = await getProfileAtual();
  const barrado = semAcesso(profile);
  if (barrado) return barrado;

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const nome = String(corpo.nome ?? "").trim();
  if (!nome) return NextResponse.json({ erro: "Dê um nome ao modelo." }, { status: 400 });
  if (nome.length > 80) {
    return NextResponse.json({ erro: "Nome muito longo (máximo 80)." }, { status: 400 });
  }

  let cnpj: string | null = null;
  if (corpo.cnpjOrgao) {
    cnpj = somenteDigitos(String(corpo.cnpjOrgao));
    if (cnpj.length !== 14) {
      return NextResponse.json({ erro: "CNPJ do ente inválido." }, { status: 400 });
    }
  } else if (!profile!.is_superadmin) {
    return NextResponse.json(
      { erro: "Só superadmin salva modelo para todos os entes." },
      { status: 403 },
    );
  }

  // Normalizar ANTES de gravar, e não só na leitura: slug inventado por um
  // cliente desatualizado não tem por que entrar na tabela.
  const topicos = normalizarSelecao(corpo.topicos);
  if (topicos.length === 0) {
    return NextResponse.json({ erro: "Selecione ao menos um tópico." }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const padrao = corpo.padrao === true;
  const linha = {
    cnpj_orgao: cnpj,
    nome,
    topicos,
    padrao,
    criado_por: profile!.id,
    updated_at: new Date().toISOString(),
  };

  const id = Number(corpo.id);
  const editando = Number.isInteger(id) && id > 0;

  // Um padrão por ente. O índice parcial recusaria o segundo com erro de
  // chave repetida; baixar o anterior antes é o que a pessoa quis dizer ao
  // marcar este.
  if (padrao) {
    const limpar = sb.from("sada_deb_modelo").update({ padrao: false });
    const { error } = await (cnpj
      ? limpar.eq("cnpj_orgao", cnpj)
      : limpar.is("cnpj_orgao", null));
    if (error && !faltaMigracao(error.code)) {
      return NextResponse.json({ erro: error.message }, { status: 500 });
    }
  }

  const resposta = editando
    ? await sb.from("sada_deb_modelo").update(linha).eq("id", id).select("*").single()
    : await sb
        .from("sada_deb_modelo")
        .upsert(linha, { onConflict: "cnpj_orgao,nome" })
        .select("*")
        .single();

  if (resposta.error) {
    if (faltaMigracao(resposta.error.code)) {
      return NextResponse.json({ erro: AVISO_MIGRACAO }, { status: 503 });
    }
    return NextResponse.json({ erro: resposta.error.message }, { status: 500 });
  }
  return NextResponse.json({ modelo: doModelo(resposta.data as Record<string, unknown>) });
}

/** DELETE /api/sada/deb/modelo?id=123 */
export async function DELETE(req: NextRequest) {
  const profile = await getProfileAtual();
  const barrado = semAcesso(profile);
  if (barrado) return barrado;

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ erro: "id inválido." }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  // Modelo global some para todo mundo: confere o nível antes de apagar.
  const { data: alvo, error: erroBusca } = await sb
    .from("sada_deb_modelo")
    .select("cnpj_orgao")
    .eq("id", id)
    .maybeSingle();
  if (erroBusca) {
    if (faltaMigracao(erroBusca.code)) {
      return NextResponse.json({ erro: AVISO_MIGRACAO }, { status: 503 });
    }
    return NextResponse.json({ erro: erroBusca.message }, { status: 500 });
  }
  if (!alvo) return NextResponse.json({ erro: "Modelo não encontrado." }, { status: 404 });
  if (!alvo.cnpj_orgao && !profile!.is_superadmin) {
    return NextResponse.json(
      { erro: "Só superadmin exclui modelo de todos os entes." },
      { status: 403 },
    );
  }

  const { error } = await sb.from("sada_deb_modelo").delete().eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
