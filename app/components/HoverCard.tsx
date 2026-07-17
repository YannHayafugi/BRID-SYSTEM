"use client";

/** D32: mini modal (popover) que aparece ao passar o mouse — usado nos
 * indicadores e listas do Dashboard no lugar da dica de ferramenta nativa
 * do navegador, para poder mostrar conteúdo formatado (lista de processos,
 * timeline de fase etc.). */
import { useState, ReactNode } from "react";

export default function HoverCard({
  children,
  conteudo,
  largura = 260,
  alinhar = "left",
}: {
  children: ReactNode;
  conteudo: ReactNode;
  largura?: number;
  alinhar?: "left" | "right";
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <div
      style={{ position: "relative", width: "100%" }}
      onMouseEnter={() => setAberto(true)}
      onMouseLeave={() => setAberto(false)}
    >
      {children}
      {aberto && (
        <div
          style={{
            position: "absolute",
            zIndex: 300,
            top: "100%",
            [alinhar]: 0,
            marginTop: 6,
            width: largura,
            maxHeight: 280,
            overflowY: "auto",
            background: "var(--bg-card)",
            border: "1px solid var(--borda)",
            borderRadius: 10,
            boxShadow: "0 10px 28px rgba(0,0,0,0.22)",
            padding: 12,
            fontSize: 12,
            color: "var(--texto)",
          }}
        >
          {conteudo}
        </div>
      )}
    </div>
  );
}
