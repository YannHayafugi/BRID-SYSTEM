/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse depende do pdfjs-dist, que não pode ser processado pelo
  // empacotador (webpack) do Next.js — precisa ser carregado direto pelo
  // Node.js em tempo de execução, daí ficar de fora do bundle. O
  // @napi-rs/canvas (binário nativo que fornece DOMMatrix ao pdfjs-dist em
  // Node) também precisa estar na lista — sem ele, o bundle da função na
  // Vercel fica sem o binário nativo e o pdf.js quebra com
  // "ReferenceError: DOMMatrix is not defined" ao processar o PDF.
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
    // O pdfjs-dist (Node) carrega o worker com `import(caminho)` usando uma
    // variável, não uma string fixa — o rastreador de arquivos da Vercel não
    // consegue ver essa dependência sozinho e deixa pdf.worker.mjs de fora
    // do pacote da função, quebrando com "Cannot find module '.../pdf.worker.mjs'".
    outputFileTracingIncludes: {
      "/api/**": [
        "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
        "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs.map",
      ],
    },
  },
};

module.exports = nextConfig;
