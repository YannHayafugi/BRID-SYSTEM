/**
 * Gerador de ofícios FIA (.docx) — port fiel do oficio.py (Python) para TS.
 * Geração 100% local (lib docx), sem chamadas de IA.
 * Layout: Garamond 11, timbrado FIA, listas romanas (dados) e numeradas com
 * subitens alfabéticos (normas).
 */
import fs from "fs";
import path from "path";
import {
  AlignmentType,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { toRoman } from "@/lib/roman";
import { OficioData } from "./tipos";

const FONT = "Garamond";
const SIZE = 22; // 11pt

function asset(nome: string): Buffer {
  return fs.readFileSync(path.join(process.cwd(), "public", "assets", nome));
}

function run(text: string, opts: { bold?: boolean; italic?: boolean; underline?: boolean } = {}) {
  return new TextRun({
    text,
    font: FONT,
    size: SIZE,
    bold: opts.bold,
    italics: opts.italic,
    underline: opts.underline ? {} : undefined,
  });
}

function para(children: TextRun[], opts: {
  after?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  firstLine?: number; left?: number; hanging?: number;
} = {}): Paragraph {
  return new Paragraph({
    alignment: opts.align,
    spacing: { after: opts.after ?? 240, line: 276, lineRule: "auto" }, // 1,15
    indent:
      opts.firstLine || opts.left || opts.hanging
        ? { firstLine: opts.firstLine, left: opts.left, hanging: opts.hanging }
        : undefined,
    children,
  });
}

/** Parágrafo de corpo: justificado, recuo de primeira linha. */
function body(texto: string): Paragraph {
  return para([run(texto)], { align: AlignmentType.JUSTIFIED, firstLine: 720 });
}

/** Item de lista com prefixo (romano/numérico/alfabético) e recuo pendurado. */
function itemLista(prefixo: string, texto: string, indentEsq: number): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 80, line: 276, lineRule: "auto" },
    indent: { left: indentEsq, hanging: 360 },
    children: [run(`${prefixo}\t${texto}`)],
  });
}

export async function montarOficio(d: OficioData): Promise<Buffer> {
  const filhos: Paragraph[] = [];

  // destinatário + endereço
  filhos.push(para([run(d.destinatario_nome, { bold: true })], { after: 200 }));
  (d.destinatario_endereco || []).forEach((linha, i, arr) => {
    filhos.push(para([run(linha)], { after: i === arr.length - 1 ? 300 : 40 }));
  });

  // Ref / Assunto
  filhos.push(
    para(
      [
        run("Ref.: ", { bold: true, underline: true }),
        run(`CONTRATO Nº ${d.numero_contrato} – Fundação Instituto de Administração.`, {
          underline: true,
        }),
      ],
      { after: 40 }
    )
  );
  filhos.push(
    para(
      [run("Assunto: ", { bold: true, underline: true }), run(d.assunto, { underline: true })],
      { after: 300 }
    )
  );

  // A/C
  if (d.ac_nome) {
    const rc: TextRun[] = [run(`A/C de ${d.ac_nome}`, { bold: true })];
    if (d.ac_cargo) {
      rc.push(run(" – ", { bold: true }));
      rc.push(run(d.ac_cargo, { bold: true, italic: true }));
    }
    rc.push(run(";", { bold: true }));
    filhos.push(para(rc, { after: 300 }));
  }

  // corpo
  filhos.push(body(`${d.saudacao}, ${d.paragrafo_abertura}`));
  if (d.paragrafo_etapas) {
    filhos.push(body(d.paragrafo_etapas.replace("{ETAPAS}", d.etapas || "")));
  }
  if (d.introducao_lista_dados) filhos.push(body(d.introducao_lista_dados));
  (d.itens_lista_dados || []).forEach((item, i) => {
    filhos.push(itemLista(`${toRoman(i + 1).toLowerCase()}.`, item, 720));
  });

  if (d.paragrafo_transicao_normas) filhos.push(body(d.paragrafo_transicao_normas));
  if (d.introducao_lista_normas) filhos.push(body(d.introducao_lista_normas));
  let num = 0;
  let letra = 0;
  for (const item of d.itens_lista_normas || []) {
    if (item.level === 0) {
      num += 1;
      letra = 0;
      filhos.push(itemLista(`${num}.`, item.text, 720));
    } else {
      letra += 1;
      filhos.push(itemLista(`${String.fromCharCode(96 + letra)})`, item.text, 1440));
    }
  }

  for (const texto of [
    d.paragrafo_pos_lista,
    d.paragrafo_reforcamos,
    d.paragrafo_tempestividade,
    d.paragrafo_teams,
    d.paragrafo_sharepoint_prazo,
    d.sharepoint_exclusividade1,
    d.sharepoint_exclusividade2,
    d.sharepoint_exclusividade3,
    d.paragrafo_reuniao,
    d.paragrafo_encerramento,
  ]) {
    if (texto) filhos.push(body(texto));
  }

  // fecho
  filhos.push(para([run("Atenciosamente,")], { align: AlignmentType.CENTER, after: 200 }));
  filhos.push(
    para([run(`${d.cidade_emissao || "São Paulo"}, ${d.data_extenso || ""}.`)], {
      align: AlignmentType.CENTER,
      after: 600,
    })
  );
  filhos.push(
    para(
      [run(d.assinatura || "FUNDAÇÃO INSTITUTO DE ADMINISTRAÇÃO – FIA", { bold: true, italic: true })],
      { after: 0 }
    )
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 1800, bottom: 1800, left: 1440, right: 1440 } },
        },
        headers: {
          default: new Header({
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
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                indent: { left: -1440, right: -1440 },
                children: [
                  new ImageRun({
                    type: "png",
                    data: asset("footer-bar.png"),
                    transformation: { width: 816, height: 77 },
                  }),
                ],
              }),
            ],
          }),
        },
        children: filhos,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
