"use client";

/** D22: alterna entre tema claro e escuro. Persiste em localStorage e aplica
 * via atributo data-theme na <html> (definido cedo por um script inline no
 * layout para evitar flash do tema errado ao carregar a página). */
import { useEffect, useState } from "react";

export default function ThemeToggle({
  variante = "header",
}: {
  /** "header": estilo claro-sobre-escuro fixo, para a barra superior (que
   * tem fundo escuro fixo nos dois temas). "auto": usa as variáveis de tema,
   * para telas fora da barra (ex.: login) onde o fundo muda com o tema. */
  variante?: "header" | "auto";
}) {
  const [escuro, setEscuro] = useState(false);

  useEffect(() => {
    setEscuro(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  function alternar() {
    const novo = escuro ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", novo);
    localStorage.setItem("tema", novo);
    setEscuro(!escuro);
  }

  const estiloHeader = { border: "1px solid #3a3529", color: "#c9c4b6" };
  const estiloAuto = { border: "1px solid var(--borda)", color: "var(--texto)", background: "var(--bg-suave)" };

  return (
    <button
      type="button"
      onClick={alternar}
      title={escuro ? "Mudar para tema claro" : "Mudar para tema escuro"}
      style={{
        background: "none",
        borderRadius: 8,
        width: 32,
        height: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        fontSize: 15,
        ...(variante === "auto" ? estiloAuto : estiloHeader),
      }}
    >
      {escuro ? "☀️" : "🌙"}
    </button>
  );
}
