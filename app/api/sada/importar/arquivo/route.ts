import { NextRequest, NextResponse } from "next/server";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getProfileAtual } from "@/lib/supabase/route";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { TIPOS_SADA, TipoSada } from "@/lib/sada/import";
import { configDePara, importarArquivo, temCopy } from "@/lib/sada/ingestao";
import { somenteDigitos } from "@/lib/mascaras";

export const runtime = "nodejs";
// O corpo é consumido como fluxo e escrito em disco; nada é bufferizado.
export const maxDuration = 300;

/**
 * Importação de arquivo GRANDE, lido pelo servidor.
 *
 * O caminho normal (navegador) não serve acima de ~100 MB: medido, a aba
 * recusa alocar 2 GB de uma vez e a leitura consome de 35 a 50 vezes o
 * tamanho do arquivo. Aqui o navegador só faz upload; quem lê é o servidor,
 * em streaming, e a carga vai por COPY quando há conexão direta ao Postgres.
 *
 * POST   envia o arquivo (corpo cru) e devolve o id do acompanhamento
 * GET    ?id= devolve o andamento
 * DELETE ?id= pede cancelamento
 *
 * Exige disco no servidor: NÃO funciona em plataforma serverless, onde o
 * processo morre junto com a resposta. A rota recusa explicitamente lá.
 */

const PASTA = process.env.SADA_UPLOAD_DIR || join(tmpdir(), "sada-uploads");

function semAcesso(profile: { is_superadmin?: boolean; pode_ver_sada?: boolean } | null) {
  if (!profile) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });
  if (!profile.is_superadmin && !profile.pode_ver_sada) {
    return NextResponse.json({ erro: "Sem acesso ao SADA." }, { status: 403 });
  }
  return null;
}

/** Plataforma serverless mata o processo ao responder: uma leitura de horas
 *  nunca terminaria, e o arquivo nem teria onde ficar. */
function serverlessDetectado() {
  return !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
}

export async function POST(req: NextRequest) {
  const profile = await getProfileAtual();
  const barrado = semAcesso(profile);
  if (barrado) return barrado;

  if (serverlessDetectado()) {
    return NextResponse.json(
      {
        erro:
          "Este servidor não suporta arquivos grandes (ambiente sem disco próprio). " +
          "Use o servidor do VPS, ou envie o arquivo dividido por ano.",
      },
      { status: 501 },
    );
  }

  const sp = new URL(req.url).searchParams;
  const cnpj = somenteDigitos(sp.get("cnpj") ?? "");
  const tipo = sp.get("tipo") ?? "";
  const mapaNome = (sp.get("mapa") ?? "").trim() || null;
  const arquivoNome = (sp.get("arquivo") ?? "planilha.xlsx").trim();

  if (!cnpj || !TIPOS_SADA.includes(tipo as TipoSada)) {
    return NextResponse.json({ erro: "Informe cnpj e um tipo válido." }, { status: 400 });
  }
  if (!req.body) {
    return NextResponse.json({ erro: "Corpo vazio: envie o arquivo." }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  // Duas leituras grandes ao mesmo tempo no mesmo ente/tipo disputariam
  // memória e acabariam gravando lotes concorrentes.
  const { data: emAndamento } = await sb
    .from("sada_importacao_arquivo")
    .select("id")
    .eq("cnpj_orgao", cnpj)
    .eq("tipo", tipo)
    .in("status", ["recebendo", "lendo", "gravando"])
    .limit(1);
  if (emAndamento && emAndamento.length > 0) {
    return NextResponse.json(
      { erro: `Já existe uma importação em andamento para este ente (nº ${emAndamento[0].id}).` },
      { status: 409 },
    );
  }

  const ins = await sb
    .from("sada_importacao_arquivo")
    .insert({
      cnpj_orgao: cnpj,
      tipo,
      mapa_nome: mapaNome,
      arquivo_nome: arquivoNome,
      status: "recebendo",
      criado_por: profile!.id,
    })
    .select("id")
    .single();
  if (ins.error) return NextResponse.json({ erro: ins.error.message }, { status: 500 });

  const id = Number(ins.data.id);
  const caminho = join(PASTA, `${id}-${arquivoNome.replace(/[^\w.\-]+/g, "_")}`);

  try {
    await mkdir(PASTA, { recursive: true });
    // Fluxo direto para o disco: o arquivo nunca passa inteiro pela memória.
    await pipeline(Readable.fromWeb(req.body as never), createWriteStream(caminho));
  } catch (e) {
    await sb
      .from("sada_importacao_arquivo")
      .update({ status: "erro", erro: `Falha ao receber o arquivo: ${(e as Error).message}` })
      .eq("id", id);
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }

  await sb
    .from("sada_importacao_arquivo")
    .update({ status: "lendo", caminho, mensagem: "Arquivo recebido. Lendo…" })
    .eq("id", id);

  // Processa em segundo plano: a resposta não espera horas de leitura. Isso
  // depende de o processo continuar vivo — daí a recusa em serverless.
  void processar(id).catch(async (e) => {
    await getSupabaseAdmin()
      .from("sada_importacao_arquivo")
      .update({ status: "erro", erro: (e as Error).message })
      .eq("id", id);
  });

  return NextResponse.json({ id, via: temCopy() ? "copy" : "api" });
}

export async function GET(req: NextRequest) {
  const profile = await getProfileAtual();
  const barrado = semAcesso(profile);
  if (barrado) return barrado;

  const sp = new URL(req.url).searchParams;

  // A tela pergunta isto ao abrir: sem saber se o servidor aguenta arquivo
  // grande, a pessoa só descobriria depois de escolher um arquivo de 2 GB e
  // ver o envio ser recusado.
  if (sp.get("capacidade")) {
    return NextResponse.json({
      suportaGrande: !serverlessDetectado(),
      via: temCopy() ? "copy" : "api",
    });
  }

  const id = Number(sp.get("id"));
  const sb = getSupabaseAdmin();

  if (!Number.isInteger(id) || id <= 0) {
    // Sem id: as últimas importações por arquivo, para a tela mostrar o
    // histórico e permitir voltar a acompanhar depois de fechar a aba.
    const cnpj = somenteDigitos(sp.get("cnpj") ?? "");
    let q = sb
      .from("sada_importacao_arquivo")
      .select("id, cnpj_orgao, tipo, arquivo_nome, bytes, status, linhas_lidas, linhas_gravadas, anos, mensagem, erro, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (cnpj) q = q.eq("cnpj_orgao", cnpj);
    const { data, error } = await q;
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json({ importacoes: data ?? [] });
  }

  const { data, error } = await sb
    .from("sada_importacao_arquivo")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ erro: "Importação não encontrada." }, { status: 404 });
  return NextResponse.json({ importacao: data });
}

/** Pede cancelamento. O laço de leitura confere o status a cada bloco. */
export async function DELETE(req: NextRequest) {
  const profile = await getProfileAtual();
  const barrado = semAcesso(profile);
  if (barrado) return barrado;

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ erro: "id inválido." }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("sada_importacao_arquivo")
    .update({ status: "cancelado", mensagem: "Cancelada pelo usuário." })
    .eq("id", id)
    .in("status", ["recebendo", "lendo", "gravando"]);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// =====================================================================
// Processamento
//
// A regra de negócio (abrir o lote não vigente, ler, descartar quando há
// bloqueio, trocar a vigência no fim) mora em lib/sada/ingestao.ts, e é a
// mesma que o importador de linha de comando usa. Aqui fica só o que é da
// rota: refletir o andamento na tabela de acompanhamento e obedecer ao
// pedido de cancelamento.
// =====================================================================

async function processar(id: number) {
  const sb = getSupabaseAdmin();
  const { data: job } = await sb.from("sada_importacao_arquivo").select("*").eq("id", id).single();
  if (!job) return;

  const cnpj = String(job.cnpj_orgao);
  const tipo = String(job.tipo) as TipoSada;
  const caminho = String(job.caminho);
  const arquivoNome = String(job.arquivo_nome ?? "planilha.xlsx");

  try {
    const cfg = await configDePara(cnpj, tipo, (job.mapa_nome as string) ?? null);

    let cancelado = false;
    let ultimoAviso = 0;

    const r = await importarArquivo({
      caminho,
      nomeArquivo: arquivoNome,
      cnpj,
      tipo,
      cfg,
      cancelado: () => cancelado,
      aoAbrirLote: async (importacaoId, via) => {
        await sb
          .from("sada_importacao_arquivo")
          .update({
            status: "gravando",
            importacao_id: importacaoId,
            mensagem: via === "copy"
              ? "Lendo e gravando (COPY direto no banco)."
              : "Lendo e gravando pela API (sem SADA_DB_URL configurada, é bem mais lento).",
          })
          .eq("id", id);
      },
      aoProgresso: async (p) => {
        // Uma escrita a cada bloco seria uma por 20 mil linhas; com arquivos de
        // dezenas de milhões isso vira ruído. A cada 3 segundos basta para a
        // tela parecer viva — e é aqui que o cancelamento é percebido.
        const agora = Date.now();
        if (agora - ultimoAviso < 3000) return;
        ultimoAviso = agora;
        const { data } = await sb
          .from("sada_importacao_arquivo")
          .update({
            linhas_lidas: p.linhasLidas,
            linhas_gravadas: p.linhasGravadas,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .select("status")
          .maybeSingle();
        if (data?.status === "cancelado") cancelado = true;
      },
    });

    if (r.descartado) {
      await sb
        .from("sada_importacao_arquivo")
        .update({
          status: cancelado ? "cancelado" : "erro",
          relatorio: r.relatorio,
          linhas_lidas: r.linhas,
          ...(cancelado ? { mensagem: r.motivo } : { erro: r.motivo }),
        })
        .eq("id", id);
      await unlink(caminho).catch(() => {});
      return;
    }

    await sb
      .from("sada_importacao_arquivo")
      .update({
        status: "concluido",
        linhas_lidas: r.linhas,
        linhas_gravadas: r.linhas,
        anos: r.anos,
        relatorio: r.relatorio,
        mensagem: `${r.linhas.toLocaleString("pt-BR")} linhas publicadas.`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    await unlink(caminho).catch(() => {});
  } catch (e) {
    await sb
      .from("sada_importacao_arquivo")
      .update({ status: "erro", erro: (e as Error).message })
      .eq("id", id);
    // O arquivo FICA no disco quando dá erro: é o que permite investigar sem
    // pedir um novo upload de vários GB.
  }
}
