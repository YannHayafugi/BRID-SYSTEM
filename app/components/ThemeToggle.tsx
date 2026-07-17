"use client";

/** D22: alterna entre tema claro e escuro. Persiste em localStorage e aplica
 * via atributo data-theme na <html> (definido cedo por um script inline no
 * layout para evitar flash do tema errado ao carregar a página). */
import { useEffect, useState } from "react";

export default function ThemeToggle() {
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

  return (
    <button
      type="button"
      onClick={alternar}
      title={escuro ? "Mudar para tema claro" : "Mudar para tema escuro"}
      style={{
        background: "none",
        border: "1px solid #3a3529",
        borderRadius: 8,
        width: 32,
        height: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        fontSize: 15,
        color: "#c9c4b6",
      }}
    >
      {escuro ? "☀️" : "🌙"}
    </button>
  );
}
