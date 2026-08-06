"use client";

/** Modal genérico (D18) — usado por Órgãos, Histórico, Perfil e Administração
 * a partir do header, sem sair da tela atual. Fecha com Esc, clique fora ou
 * o botão de fechar. */
import { useEffect } from "react";

// D38: contador global de modais abertos — com dois modais empilhados
// (ex.: "Cadastrar órgão" por cima de "Abrir novo processo"), o scroll do
// body só pode voltar quando o ÚLTIMO deles fechar, senão fechar o de cima
// destrava o scroll com o de baixo ainda aberto.
let modaisAbertos = 0;

export default function Modal({
  titulo,
  onFechar,
  children,
  zIndex = 100,
}: {
  titulo: string;
  onFechar: () => void;
  children: React.ReactNode;
  /** D38: permite abrir um modal por cima de outro (ex.: cadastro de órgão
   * disparado de dentro do modal "Abrir novo processo") sem que os dois
   * fundos escurecidos se somem de forma confusa. */
  zIndex?: number;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    document.addEventListener("keydown", onKey);
    modaisAbertos += 1;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      modaisAbertos = Math.max(0, modaisAbertos - 1);
      if (modaisAbertos === 0) document.body.style.overflow = "";
    };
  }, [onFechar]);

  return (
    <div
      onClick={onFechar}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20, 18, 13, 0.55)",
        zIndex,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 16px",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-card)",
          color: "var(--texto)",
          borderRadius: 12,
          width: "100%",
          maxWidth: 720,
          maxHeight: "calc(100vh - 80px)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: "1px solid var(--borda)",
            background: "var(--escuro)",
            borderRadius: "12px 12px 0 0",
          }}
        >
          <strong style={{ color: "var(--primaria)", fontSize: 16 }}>{titulo}</strong>
          <button
            onClick={onFechar}
            title="Fechar"
            style={{
              background: "none",
              border: "1px solid #3a3529",
              borderRadius: 8,
              color: "#c9c4b6",
              width: 30,
              height: 30,
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: 20, overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}
