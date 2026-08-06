import "./globals.css";
import type { Metadata } from "next";
import { Antonio, Inter, Montserrat } from "next/font/google";
import BarraUsuario from "./components/BarraUsuario";

// D25: tipografia da marca Grupo BRID — títulos/nav em Montserrat (bold,
// geométrica, igual ao site institucional), corpo de texto em Inter.
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--fonte-titulo",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--fonte-corpo",
  display: "swap",
});
// D52: fonte dos títulos do site institucional (grupobrid.com) — usada na
// página inicial pública.
const antonio = Antonio({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--fonte-brid",
  display: "swap",
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
