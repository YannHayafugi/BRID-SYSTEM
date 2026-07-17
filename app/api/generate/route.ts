import { NextRequest, NextResponse } from "next/server";
import { buildProposalDocx } from "@/lib/docxBuilder";
import { PropostaFormData } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const data = (await req.json()) as PropostaFormData;

    if (!data.nomeEnte || !data.etapas || data.etapas.length === 0) {
      return NextResponse.json(
        { error: "Dados incompletos para gerar a proposta." },
        { status: 400 }
      );
    }

    const buffer = await buildProposalDocx(data);
    const nomeArquivo = `Proposta - ${data.tipoEnte} de ${data.nomeEnte}.docx`.replace(
      /[\\/:*?"<>|]/g,
      ""
    );

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(nomeArquivo)}"`,
      },
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "Erro ao gerar o documento: " + (err?.message || String(err)) },
      { status: 500 }
    );
  }
}
