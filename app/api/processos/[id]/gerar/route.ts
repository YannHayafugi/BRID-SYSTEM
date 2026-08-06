import { NextRequest, NextResponse } from "next/server";
import { getProfileAtual, getSupabaseRouteClient } from "@/lib/supabase/route";
import { extrairTextoPdf } from "@/lib/pdfExtract";
import {
  gerarConteudoProposta,
  gerarConteudoPropostaViaPDF,
} from "@/lib/proposta/gerarConteudo";
import { buildPropostaHibrida, buildResumoHibrido } from "@/lib/proposta/propostaDocx";
import { baixarArquivo, uploadArquivo, DOCX_MIME } from "@/lib/processos/arquivos";

export const runtime = "nodejs";
// extração + chamada à IA + montagem dos DOCX podem passar do padrão de 10s
export const maxDuration = 300;

// abaixo deste tamanho de texto extraído, tratamos como PDF escaneado e
// caímos para a leitura nativa do PDF pela IA (mesmo limiar da análise de TR)
const LIMIAR_TEXTO = 300;
const MAX_TR_CHARS = Number(process.env.MAX_TR_CHARS || 60000);

/** Gera Proposta + Resumo dentro do processo (D7 — híbrido), usando o TR já
 * enviado. Mantém o título do processo (identidade vem do ofício). Se houver
 * análise de TR vinculada (D8), os achados entram como contexto do prompt. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getProfileAtual();
  if (!profile) {
    return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const supabase = getSupabaseRouteClient();
  const { data: processo } = await supabase
    .from("gp_processos")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!processo) {
    return NextResponse.json({ erro: "Processo não encontrado." }, { status: 404 });
  }

  const arquivos = (processo.arquivos || {}) as Record<string, string>;
  const caminhoTr = arquivos.tr;
  if (!caminhoTr) {
    return NextResponse.json(
      { erro: "Envie o TR do processo antes de gerar a proposta." },
      { status: 400 }
    );
  }

  // D8: achados da análise de TR vinculada viram contexto do prompt
  let contextoAchados: string | undefined;
  if (processo.cadastro_tr_id) {
    const { data: achados } = await supabase
      .from("gp_achados_tr")
      .select("item_numero, titulo, texto, ciente, comentario")
      .eq("cadastro_id", processo.cadastro_tr_id);
    if (achados?.length) {
      contextoAchados = achados
        .map(
          (a) =>
            `Item ${a.item_numero} — ${a.titulo}: ${a.texto}` +
            (a.comentario ? ` | Comentário do analista: ${a.comentario}` : "")
        )
        .join("\n");
    }
  }

  try {
    const tr = await baixarArquivo(caminhoTr);
    const ext = caminhoTr.slice(caminhoTr.lastIndexOf(".")).toLowerCase();

    // extração local do texto (0 tokens extras); PDF escaneado → IA lê o PDF
    let conteudo;
    if (ext === ".pdf") {
      const texto = await extrairTextoPdf(tr).catch(() => "");
      if (texto.trim().length >= LIMIAR_TEXTO) {
        conteudo = await gerarConteudoProposta(texto.slice(0, MAX_TR_CHARS), contextoAchados);
      } else {
        conteudo = await gerarConteudoPropostaViaPDF(tr, contextoAchados);
      }
    } else if (ext === ".docx") {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: tr });
      if (value.trim().length < 100) {
        return NextResponse.json({ erro: "Não foi possível extrair texto do TR." }, { status: 422 });
      }
      conteudo = await gerarConteudoProposta(value.slice(0, MAX_TR_CHARS), contextoAchados);
    } else {
      const texto = tr.toString("utf-8");
      if (texto.trim().length < 100) {
        return NextResponse.json({ erro: "Não foi possível extrair texto do TR." }, { status: 422 });
      }
      conteudo = await gerarConteudoProposta(texto.slice(0, MAX_TR_CHARS), contextoAchados);
    }

    const [propostaDocx, resumoDocx] = await Promise.all([
      buildPropostaHibrida(conteudo),
      buildResumoHibrido(conteudo),
    ]);

    arquivos.proposta = `${params.id}/Proposta.docx`;
    arquivos.resumo = `${params.id}/Resumo.docx`;
    await uploadArquivo(arquivos.proposta, propostaDocx, DOCX_MIME);
    await uploadArquivo(arquivos.resumo, resumoDocx, DOCX_MIME);

    const campos: Record<string, unknown> = {
      arquivos,
      updated_at: new Date().toISOString(),
    };
    if (processo.etapa < 2) campos.etapa = 2; // "Proposta (elaboração e envio)"

    const { error } = await supabase.from("gp_processos").update(campos).eq("id", params.id);
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      etapa: campos.etapa ?? processo.etapa,
      resumo: conteudo.resumo,
      downloads: {
        proposta: `/api/processos/${params.id}/download/proposta`,
        resumo: `/api/processos/${params.id}/download/resumo`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: `Falha na geração: ${msg}` }, { status: 502 });
  }
}
