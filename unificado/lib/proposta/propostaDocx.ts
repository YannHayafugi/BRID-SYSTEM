/**
 * Renderização local dos DOCX da proposta (D7 — parte "docxBuilder" do híbrido):
 * conteúdo vindo da IA (ConteudoProposta) com o timbrado FIA (cabeçalho/rodapé)
 * do docxBuilder do gerador de securitização. Times New Roman 12, esp. 1,5.
 */
import fs from "fs";
import path from "path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { ConteudoProposta } from "./tipos";

const FONT = "Times New Roman";
const SIZE = 24; // half-points → 12pt
const LINE = 360; // 1,5
const INDENT = 720;

function asset(nome: string): Buffer {
  return fs.readFileSync(path.join(process.cwd(), "public", "assets", nome));
}

function body(texto: string, indent = true): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: LINE, lineRule: "auto", after: 160 },
    indent: indent ? { firstLine: INDENT } : undefined,
    children: [new TextRun({ text: texto, font: FONT, size: SIZE })],
  });
}

function heading(texto: string): Paragraph {
  return new Paragraph({
    spacing: { line: LINE, lineRule: "auto", before: 240, after: 160 },
    children: [new TextRun({ text: texto, font: FONT, size: SIZE, bold: true })],
  });
}

function bullet(texto: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: LINE, lineRule: "auto", after: 80 },
    bullet: { level: 0 },
    children: [new TextRun({ text: texto, font: FONT, size: SIZE })],
  });
}

function titulo(texto: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { line: LINE, lineRule: "auto", after: 240 },
    children: [new TextRun({ text: texto, font: FONT, size: 32, bold: true })],
  });
}

function buildHeader(): Header {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type: "png",
            data: asset("header-logo.png"),
            transformation: { width: 142, height: 37 },
          }),
        ],
      }),
    ],
  });
}

function buildFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type: "png",
            data: asset("footer-bar.png"),
            transformation: { width: 816, height: 77 },
          }),
        ],
      }),
    ],
  });
}

function celula(texto: string, opts: { bold?: boolean; shade?: boolean } = {}): TableCell {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    shading: opts.shade ? { type: ShadingType.CLEAR, fill: "D9D9D9" } : undefined,
    children: [
      new Paragraph({
        spacing: { line: LINE, lineRule: "auto" },
        children: [new TextRun({ text: texto, font: FONT, size: SIZE, bold: opts.bold })],
      }),
    ],
  });
}

function tabelaEtapas(c: ConteudoProposta): Table {
  const bordas = {
    top: { style: BorderStyle.SINGLE, size: 4 },
    bottom: { style: BorderStyle.SINGLE, size: 4 },
    left: { style: BorderStyle.SINGLE, size: 4 },
    right: { style: BorderStyle.SINGLE, size: 4 },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4 },
    insideVertical: { style: BorderStyle.SINGLE, size: 4 },
  };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: bordas,
    rows: [
      new TableRow({
        children: [
          celula("Etapa", { bold: true, shade: true }),
          celula("Descrição", { bold: true, shade: true }),
          celula("Prazo", { bold: true, shade: true }),
        ],
      }),
      ...c.etapas.map(
        (e) =>
          new TableRow({
            children: [celula(e.nome), celula(e.descricao), celula(e.prazo)],
          })
      ),
    ],
  });
}

const PROPS_SECAO = {
  page: {
    margin: { top: 1440, bottom: 1440, left: 1080, right: 1080 },
  },
};

/** Proposta completa (timbrado FIA + 10 seções do conteúdo da IA). */
export async function buildPropostaHibrida(c: ConteudoProposta): Promise<Buffer> {
  const filhos: (Paragraph | Table)[] = [
    titulo(c.titulo),
    body(`Cliente: ${c.orgao_cliente}`, false),
    body(`Data: ${new Date().toLocaleDateString("pt-BR")}`, false),
    heading("1. Objeto"),
    body(c.objeto),
    heading("2. Contexto e Justificativa"),
    body(c.contexto),
    heading("3. Escopo"),
    ...c.escopo.map(bullet),
    heading("4. Metodologia"),
    body(c.metodologia),
    heading("5. Etapas e Prazos"),
    tabelaEtapas(c),
    body(`Prazo total: ${c.prazo_total}`, false),
    heading("6. Equipe Técnica"),
    ...c.equipe.map((m) => bullet(`${m.quantidade}x ${m.perfil}: ${m.atribuicoes}`)),
    heading("7. Atendimento aos Requisitos do TR"),
    ...c.requisitos_atendidos.map(bullet),
    heading("8. Condições de Pagamento"),
    body(c.criterios_pagamento),
    heading("9. Premissas"),
    ...c.premissas.map(bullet),
    heading("10. Riscos e Mitigações"),
    ...c.riscos.map((r) => bullet(`${r.risco} — Mitigação: ${r.mitigacao}`)),
  ];

  const doc = new Document({
    sections: [
      {
        properties: PROPS_SECAO,
        headers: { default: buildHeader() },
        footers: { default: buildFooter() },
        children: filhos,
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

/** Resumo executivo (1-2 páginas, mesmo timbrado). */
export async function buildResumoHibrido(c: ConteudoProposta): Promise<Buffer> {
  const r = c.resumo;
  const filhos: Paragraph[] = [
    titulo(`RESUMO — ${c.titulo}`),
    body(`Data: ${new Date().toLocaleDateString("pt-BR")}`, false),
    body(`Cliente: ${r.cliente}`, false),
    body(`Objeto: ${r.objeto}`, false),
    body(`Prazo: ${r.prazo}`, false),
    body(`Valor de referência: ${r.valor_referencia}`, false),
    heading("Escopo Principal"),
    ...r.escopo_resumido.map(bullet),
    heading("Destaques"),
    ...r.destaques.map(bullet),
    heading("Próximos Passos"),
    ...r.proximos_passos.map(bullet),
  ];

  const doc = new Document({
    sections: [
      {
        properties: PROPS_SECAO,
        headers: { default: buildHeader() },
        footers: { default: buildFooter() },
        children: filhos,
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
