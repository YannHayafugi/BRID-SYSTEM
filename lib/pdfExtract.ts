/**
 * O pdf-parse usa o pdfjs-dist (build "legacy"), que referencia `DOMMatrix`
 * já no carregamento do módulo (não só ao renderizar). Em Node, o próprio
 * pdfjs-dist tenta preencher isso via um `require("@napi-rs/canvas")`
 * dinâmico e ofuscado — dinâmico demais para o rastreador de arquivos da
 * Vercel enxergar, então o binário nativo não entra no pacote da função e o
 * require falha silenciosamente, deixando `DOMMatrix` indefinido
 * ("ReferenceError: DOMMatrix is not defined" ao processar qualquer PDF).
 * Fazemos o mesmo import aqui, de forma estática, para o rastreador incluir
 * o binário — e populamos `globalThis` antes do pdf-parse ser carregado, já
 * que o pdfjs-dist só tenta o require dele se `globalThis.DOMMatrix` ainda
 * não existir.
 */
async function garantirPolyfillPdfjs() {
  if (typeof (globalThis as any).DOMMatrix !== "undefined") return;
  try {
    const canvas = await import("@napi-rs/canvas");
    (globalThis as any).DOMMatrix = canvas.DOMMatrix;
    (globalThis as any).ImageData = canvas.ImageData;
    (globalThis as any).Path2D = canvas.Path2D;
  } catch {
    // Sem o polyfill o pdfjs-dist tenta por conta própria (e provavelmente
    // falha do mesmo jeito) — não interrompe o fluxo aqui.
  }
}

/**
 * Extrai o texto de um PDF localmente (no servidor), sem enviar o arquivo
 * binário para nenhuma API externa. O texto extraído é o que será usado
 * depois na chamada única à API do Claude.
 */
export async function extrairTextoPdf(arquivo: Buffer): Promise<string> {
  await garantirPolyfillPdfjs();
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: arquivo });
  try {
    const resultado = await parser.getText();
    return resultado.text;
  } finally {
    await parser.destroy();
  }
}
