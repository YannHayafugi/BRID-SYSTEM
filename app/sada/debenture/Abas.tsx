"use client";

/**
 * Abas do módulo de debênture.
 *
 * Componente próprio, e não entradas na barra de cima, porque as etapas aqui
 * são de um mesmo trabalho e se faz uma depois da outra: conferir os dados,
 * montar o documento. A barra do topo lista módulos, não passos.
 */
import Link from "next/link";

const ABAS = [
  { href: "/sada/debenture", rotulo: "Ficha de dados" },
  { href: "/sada/debenture/modelo", rotulo: "Montagem" },
] as const;

export function AbasDebenture({ ativa }: { ativa: string }) {
  return (
    <nav className="deb-abas" aria-label="Etapas do documento">
      {ABAS.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className={a.href === ativa ? "ativa" : undefined}
          aria-current={a.href === ativa ? "page" : undefined}
        >
          {a.rotulo}
        </Link>
      ))}
    </nav>
  );
}
