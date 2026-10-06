import "./globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import BarraUsuario from "./components/BarraUsuario";

/**
 * Tipografia da marca Grupo BRID — títulos/nav em Montserrat (bold,
 * geométrica, igual ao site institucional), corpo de texto em Inter, e
 * Antonio nos títulos da página pública (D25, D52).
 *
 * Os arquivos ficam no repositório, em vez de virem do `next/font/google`.
 * Não é preferência: com o Google, **o build busca as fontes na rede**, e
 * quando essa busca falha o deploy inteiro falha — foi o que derrubou o
 * deploy de 03/10, com `Build failed because of webpack errors` apontando
 * para `next/font/google/target.css ... "import":"Montserrat"`. Três
 * famílias eram três chances de o build cair por motivo nenhum.
 *
 * São os mesmos arquivos que o `next/font/google` já baixava e servia junto
 * com o site (subconjunto latino, que cobre o português), agora versionados:
 * 110 KB no total, as três variáveis — um arquivo serve todos os pesos.
 *
 * `adjustFontFallback` mantém o que se ganhava antes de graça: o Next calcula
 * as métricas da fonte e ajusta o fallback (Arial) para o texto não "pular"
 * quando a fonte real termina de carregar.
 */
const montserrat = localFont({
  src: "./fonts/montserrat-latin-var.woff2",
  weight: "500 800",
  style: "normal",
  variable: "--fonte-titulo",
  display: "swap",
  adjustFontFallback: "Arial",
});
const inter = localFont({
  src: "./fonts/inter-latin-var.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--fonte-corpo",
  display: "swap",
  adjustFontFallback: "Arial",
});
const antonio = localFont({
  src: "./fonts/antonio-latin-var.woff2",
  weight: "600 700",
  style: "normal",
  variable: "--fonte-brid",
  display: "swap",
  adjustFontFallback: "Arial",
});

export const metadata: Metadata = {
  title: "Gerador de Propostas — GRUPO BRID",
  description: "Follow-up, análise de TR e geração de propostas e ofícios",
  icons: {
    icon: "/logo.svg",
    shortcut: "/logo.svg",
    apple: "/logo.svg",
  },
};

// D22: define o tema (claro/escuro) antes da primeira pintura, lendo a
// preferência salva (ou a do sistema), para evitar flash do tema errado.
const SCRIPT_TEMA = `(function(){try{
  var t = localStorage.getItem("tema");
  if (t === "dark" || (!t && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
  // D45: limpa a chave "senha" gravada pela versão antiga do app (modelo de
  // senha única) — o login atual (Supabase Auth) nunca salva senha no navegador.
  localStorage.removeItem("senha");
} catch (e) {}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className={`${montserrat.variable} ${inter.variable} ${antonio.variable}`}>
        <BarraUsuario />
        {children}
      </body>
    </html>
  );
}
