"use client";

/** D32/D33/D35: mini modal (popover) que aparece ao passar o mouse — usado
 * nos indicadores, listas e gráficos do Dashboard no lugar da dica de
 * ferramenta nativa do navegador, para poder mostrar conteúdo formatado
 * (lista de processos, timeline de fase etc.).
 *
 * Renderiza via portal direto no <body>, posicionado com "fixed" a partir
 * da posição do item na tela — assim o popover flutua por cima de tudo,
 * sem ficar preso (e sem gerar scroll/resize) dentro de contêineres com
 * overflow, como as listas roláveis do Dashboard. Fica aberto enquanto o
 * mouse estiver sobre o gatilho OU sobre o próprio popover, para dar tempo
 * de clicar nos links de dentro dele. */
import { useRef, useState, ReactNode, CSSProperties } from "react";
import { createPortal } from "react-dom";

export default function HoverCard({
  children,
  conteudo,
  largura = 260,
  estiloTrigger,
}: {
  children: ReactNode;
  conteudo: ReactNode;
  largura?: number;
  estiloTrigger?: CSSProperties;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const refGatilho = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function abrir() {
    if (timerRef.current) clearTimeout(timerRef.current);
    const r = refGatilho.current?.getBoundingClientRect();
    if (r) {
      let left = r.left;
      if (left + largura > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - largura - 12);
      }
      setPos({ top: r.bottom + 6, left });
    }
    setAberto(true);
  }

  function agendarFechar() {
    timerRef.current = setTimeout(() => setAberto(false), 150);
  }

  return (
    <div
      ref={refGatilho}
      style={{ position: "relative", width: "100%", ...estiloTrigger }}
      onMouseEnter={abrir}
      onMouseLeave={agendarFechar}
    >
      {children}
      {aberto && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            onMouseEnter={abrir}
            onMouseLeave={agendarFechar}
            style={{
              position: "fixed",
              zIndex: 1000,
              top: pos.top,
              left: pos.left,
              width: largura,
              maxHeight: 300,
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
          </div>,
          document.body
        )}
    </div>
  );
}
