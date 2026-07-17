// Script de diagnóstico: extrai o texto de um PDF (mesma função usada pelo
// sistema, lib/pdfExtract.ts) e imprime o texto bruto extraído, para conferir
// se a extração está capturando corretamente o conteúdo real do TR.
//
// Uso: node scripts/testar-extracao.js caminho\para\arquivo.pdf
// (ou node scripts/testar-extracao.js, se o arquivo se chamar teste.pdf na pasta do projeto)

const fs = require("fs");
const path = require("path");

async function main() {
  const caminhoArquivo = process.argv[2] || "teste.pdf";
  const caminhoCompleto = path.resolve(process.cwd(), caminhoArquivo);

  if (!fs.existsSync(caminhoCompleto)) {
    console.error(`Arquivo não encontrado: ${caminhoCompleto}`);
    process.exit(1);
  }

  const { PDFParse } = require("pdf-parse");
  const bytes = fs.readFileSync(caminhoCompleto);
  const parser = new PDFParse({ data: bytes });
  try {
    const resultado = await parser.getText();
    console.log("=== TAMANHO DO TEXTO EXTRAÍDO ===");
    console.log(resultado.text.length, "caracteres");
    console.log("\n=== TEXTO EXTRAÍDO (integral) ===\n");
    console.log(resultado.text);

    fs.writeFileSync("texto-extraido.txt", resultado.text, "utf-8");
    console.log("\n(também salvo em texto-extraido.txt para facilitar a leitura)");
  } finally {
    await parser.destroy();
  }
}

main().catch((erro) => {
  console.error("Erro ao extrair texto:", erro);
  process.exit(1);
});
