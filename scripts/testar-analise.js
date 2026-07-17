// Script de teste manual para o endpoint /api/tr/analyze.
//
// Como usar:
// 1. Deixe o servidor rodando em outro terminal (npm run dev).
// 2. Coloque um PDF de teste na pasta do projeto e ajuste o nome do arquivo abaixo,
//    ou passe o caminho como argumento: node scripts/testar-analise.js caminho\para\arquivo.pdf
// 3. Rode: node scripts/testar-analise.js

const fs = require("fs");
const path = require("path");

async function main() {
  const caminhoArquivo = process.argv[2] || "teste.pdf";
  const caminhoCompleto = path.resolve(process.cwd(), caminhoArquivo);

  if (!fs.existsSync(caminhoCompleto)) {
    console.error(`Arquivo não encontrado: ${caminhoCompleto}`);
    console.error(
      "Coloque um PDF na pasta do projeto com esse nome, ou informe o caminho: node scripts/testar-analise.js meu-arquivo.pdf"
    );
    process.exit(1);
  }

  console.log(`Enviando ${caminhoCompleto} para análise...`);

  const bytes = fs.readFileSync(caminhoCompleto);
  const formData = new FormData();
  formData.append("arquivo", new Blob([bytes]), path.basename(caminhoCompleto));

  const resposta = await fetch("http://localhost:3000/api/tr/analyze", {
    method: "POST",
    body: formData,
  });

  const dados = await resposta.json();
  console.log(`Status HTTP: ${resposta.status}`);
  console.log(JSON.stringify(dados, null, 2));
}

main().catch((erro) => {
  console.error("Erro ao rodar o teste:", erro);
  process.exit(1);
});
