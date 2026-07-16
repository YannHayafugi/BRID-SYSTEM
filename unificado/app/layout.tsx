import "./globals.css";
import type { Metadata } from "next";
import BarraUsuario from "./components/BarraUsuario";

export const metadata: Metadata = {
  title: "Gerador de Propostas — GRUPO BRID",
  description: "Follow-up, análise de TR e geração de propostas e ofícios",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <BarraUsuario />
        {children}
      </body>
    </html>
  );
}
