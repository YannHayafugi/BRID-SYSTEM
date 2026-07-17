/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse depende do pdfjs-dist, que não pode ser processado pelo
  // empacotador (webpack) do Next.js — precisa ser carregado direto pelo
  // Node.js em tempo de execução, daí ficar de fora do bundle.
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "pdfjs-dist"],
  },
};

module.exports = nextConfig;
