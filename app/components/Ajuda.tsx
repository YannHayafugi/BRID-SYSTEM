"use client";

/**
 * Ajuda de tela — a caixa "Como usar" e a dica de campo (o "?").
 *
 * As telas do SADA descrevem o que fazem, mas não como a planilha precisa
 * chegar: quem recebe o arquivo do ente descobria as regras errando. Aqui a
 * instrução fica ao lado do campo, no momento de usar, em vez de num manual
 * que ninguém abre.
 *
 * Duas peças, de propósito:
 *   ComoUsar — o passo a passo da aba, uma vez no topo. Fecha e continua
 *              fechada nas próximas visitas (quem já sabe não quer ler de novo).
 *   Dica     — a regra de UM campo, escondida atrás do "?".
 */
import { useEffect, useState } from "react";

const PREFIXO = "sada.ajuda.";

/**
 * Caixa de instruções do topo da aba.
 *
 * `chave` identifica a caixa no localStorage — mude-a se o conteúdo mudar a
 * ponto de merecer ser lido de novo por quem já fechou.
 */
export function ComoUsar({
  chave,
  titulo = "Como usar esta aba",
  children,
}: {
  chave: string;
  titulo?: string;
  children: React.ReactNode;
}) {
  // Começa aberta e só fecha depois do efeito: renderizar já fechada exigiria
  // ler o localStorage no servidor, que não existe lá.
  const [aberto, setAberto] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(PREFIXO + chave) === "fechado") setAberto(false);
    } catch {
      /* navegador sem armazenamento: a caixa só fica sempre aberta */
    }
  }, [chave]);

  function alternar() {
    setAberto((v) => {
      try {
        localStorage.setItem(PREFIXO + chave, v ? "fechado" : "aberto");
      } catch {
        /* idem */
      }
      return !v;
    });
  }

  return (
    <section className={`ajuda ${aberto ? "" : "fechada"}`}>
      <button type="button" className="ajuda-cabeca" onClick={alternar} aria-expanded={aberto}>
        <span className="ajuda-icone" aria-hidden="true">💡</span>
        <strong>{titulo}</strong>
        <span className="ajuda-seta" aria-hidden="true">{aberto ? "▴" : "▾"}</span>
      </button>
      {aberto && <div className="ajuda-corpo">{children}</div>}
    </section>
  );
}

/**
 * Dica de um campo. Abre ao passar o mouse ou ao focar pelo teclado, e fica
 * presa no clique — sem isso, em tela sensível ao toque a dica aparecia e
 * sumia no mesmo gesto.
 */
export function Dica({ texto, titulo }: { texto: React.ReactNode; titulo?: string }) {
  const [sobre, setSobre] = useState(false);
  const [fixa, setFixa] = useState(false);
  const aberta = sobre || fixa;

  return (
    <span className="dica-wrap">
      <button
        type="button"
        className={`dica ${fixa ? "fixa" : ""}`}
        aria-label={titulo ? `Ajuda: ${titulo}` : "Ajuda"}
        aria-expanded={aberta}
        onMouseEnter={() => setSobre(true)}
        onMouseLeave={() => setSobre(false)}
        onFocus={() => setSobre(true)}
        onBlur={() => { setSobre(false); setFixa(false); }}
        onClick={() => setFixa((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Escape") { setFixa(false); setSobre(false); } }}
      >
        ?
      </button>
      {aberta && (
        <span className="dica-bolha" role="tooltip">
          {titulo && <strong>{titulo}</strong>}
          {texto}
        </span>
      )}
    </span>
  );
}
