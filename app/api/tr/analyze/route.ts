import { NextRequest, NextResponse } from "next/server";
import { extrairTextoPdf } from "@/lib/pdfExtract";
import { analisarTR, analisarTRViaPDF } from "@/lib/claudeAnalysis";
import { getProfileAtual } from "@/lib/supabase/route";

// Precisa rodar em Node.js (não Edge): usamos Buffer e uma lib de parsing de PDF.
export const runtime = "nodejs";
// TRs grandes + chamada à IA podem levar mais que o padrão de 10s.
export const maxDuration = 120;

// Abaixo deste tamanho, consideramos que a extração local não capturou texto
// suficiente (ex.: PDF escaneado/imagem) e caímos para o modo de leitura via
// imagem (ver analisarTRViaPDF).
const LIMIAR_TEXTO_SUFICIENTE = 300;

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfileAtual();
    if (!profile) {
      return NextResponse.json({ erro: "Sessão expirada. Faça login novamente." }, { status: 401 });
    }

    const formData = await request.formData();
    const arquivo = formData.get("arquivo");

    if (!arquivo || !(arquivo instanceof Blob)) {
      return NextResponse.json(
        { erro: "Envie o TR em PDF no campo 'arquivo'." },
        { status: 400 }
      );
    }

    const bytes = Buffer.from(await arquivo.arrayBuffer());
    const nomeArquivo = arquivo instanceof File ? arquivo.name : "TR.pdf";

    // 1. Extração local do texto — nada de binário vai para a API do Claude
    //    quando essa extração funciona (caso da grande maioria dos TRs).
    const textoTr = await extrairTextoPdf(bytes);

    let resultado;
    let modo: "texto" | "imagem";

    if (textoTr && textoTr.trim().length >= LIMIAR_TEXTO_SUFICIENTE) {
      // 2a. Modo padrão: única chamada à API do Claude, com o conteúdo de
      //     referência cacheado no prompt, e o texto extraído localmente.
      resultado = await analisarTR(textoTr);
      modo = "texto";
    } else {
      // 2b. Fallback: a extração local não encontrou texto suficiente —
      //     provavelmente um TR escaneado (imagem). Envia o PDF diretamente
      //     à API do Claude, que lê o documento via visão computacional.
      resultado = await analisarTRViaPDF(bytes, nomeArquivo);
      modo = "imagem";
    }

    if (!resultado.documentoValido) {
      return NextResponse.json(
        {
          ok: false,
          erro:
            resultado.motivoInvalido ||
            "Não foi possível analisar o documento enviado (vazio, ilegível ou não reconhecido como TR).",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ ok: true, resultado, modo });
  } catch (erro) {
    console.error("Erro na análise de TR:", erro);
    const mensagem = erro instanceof Error ? erro.message : "Erro desconhecido.";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
