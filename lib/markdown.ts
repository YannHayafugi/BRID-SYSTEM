import { TextRun } from "docx";

export const FONT = "Times New Roman";
export const SIZE = 24; // 12pt (half-points)

interface RunsOptions {
  italic?: boolean;
  bold?: boolean; // força negrito em todo o texto (ignora marcação **)
}

/**
 * Converte um texto com marcação leve "**negrito**" em uma lista de TextRun,
 * já com fonte Times New Roman 12pt aplicada.
 */
export function runs(text: string, opts: RunsOptions = {}): TextRun[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((p) => p.length > 0);
  const result: TextRun[] = [];
  for (const part of parts) {
    const isBold = /^\*\*[^*]+\*\*$/.test(part);
    const content = isBold ? part.slice(2, -2) : part;
    result.push(
      new TextRun({
        text: content,
        font: FONT,
        size: SIZE,
        bold: opts.bold ?? isBold,
        italics: opts.italic ?? false,
      })
    );
  }
  if (result.length === 0) {
    result.push(new TextRun({ text: "", font: FONT, size: SIZE }));
  }
  return result;
}
