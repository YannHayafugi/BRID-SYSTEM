import { PDFParse } from "pdf-parse";

/**
 * Extrai o texto de um PDF localmente (no servidor), sem enviar o arquivo
 * binário para nenhuma API externa. O texto extraído é o que será usado
 * depois na chamada única à API do Claude.
 */
export async function extrairTextoPdf(arquivo: Buffer): Promise<string> {
  const parser = new PDFParse({ data: arquivo });
  try {
    const resultado = await parser.getText();
    return resultado.text;
  } finally {
    await parser.destroy();
  }
}
