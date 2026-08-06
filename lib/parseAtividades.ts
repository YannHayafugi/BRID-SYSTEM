export interface AtividadeLinha {
  texto: string; // já sem marcação de negrito ** e sem numeração de sub-item
  bold: boolean;
  bullet: boolean; // true = sub-item (recuado, com marcador)
}

/**
 * Interpreta o texto digitado no campo "Atividades" de uma etapa.
 *
 * Convenção esperada (a mesma usada no conteúdo padrão fornecido pela FIA):
 *  - Linha iniciando e terminando com "**...**" => título do grupo de
 *    atividades, em negrito, sem recuo.
 *  - Linha com recuo (espaços/tab no início) e iniciando com "N." => sub-item,
 *    exibido como marcador (bullet) recuado, sem a numeração repetida.
 *  - Demais linhas => parágrafo normal, sem recuo.
 */
export function parseAtividades(texto: string): AtividadeLinha[] {
  const linhasBrutas = texto.replace(/\r\n/g, "\n").split("\n");
  const linhas: AtividadeLinha[] = [];

  for (const linhaBruta of linhasBrutas) {
    if (linhaBruta.trim().length === 0) continue;

    const temRecuo = /^[ \t]+/.test(linhaBruta);
    const trimmed = linhaBruta.trim();
    const ehTituloNegrito = /^\*\*.+\*\*:?$/.test(trimmed);

    if (ehTituloNegrito) {
      const semAsteriscos = trimmed.replace(/^\*\*/, "").replace(/\*\*:?$/, (m) =>
        m.includes(":") ? ":" : ""
      );
      linhas.push({ texto: semAsteriscos, bold: true, bullet: false });
      continue;
    }

    if (temRecuo) {
      const semNumeracao = trimmed.replace(/^\d+[.)]\s*/, "");
      linhas.push({ texto: semNumeracao, bold: false, bullet: true });
      continue;
    }

    linhas.push({ texto: trimmed, bold: false, bullet: false });
  }

  return linhas;
}
