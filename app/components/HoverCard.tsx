"use client";

/** D32/D33: mini modal (popover) que aparece ao passar o mouse — usado nos
 * indicadores, listas e gráficos do Dashboard no lugar da dica de ferramenta
 * nativa do navegador, para poder mostrar conteúdo formatado (lista de
 * processos, timeline de fase etc.).
 *
 * posicao="direita" abre o popover ao lado do item, em vez de embaixo —
 * usado em listas verticais (Processos por fase / Processos e progresso)
 * para não sobrepor os itens seguintes da lista. */
import { useState, ReactNode } from "react";

export default function HoverCard({
  children,
  conteudo,
  largura = 260,
  alinhar = "left",
  posicao = "baixo",
}: {
  children: ReactNode;
  conteudo: ReactNode;
  largura?: number;
  alinhar?: "left" | "right";
  posicao?: "baixo" | "direita";
}) {
  const [aberto, setAberto] = useState(false);

  const estiloPopover: React.CSSProperties =
    posicao === "direita"
      ? { position: "absolute", zIndex: 300, top: 0, left: "100%", marginLeft: 8 }
      : { position: "absolute", zIndex: 300, top: "100%", [alinhar]: 0, marginTop: 6 } as React.CSSProperties;

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
            ...estiloPopover,
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
