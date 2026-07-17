"use client";

import OrgaosConteudo from "@/app/components/OrgaosConteudo";

export default function OrgaosPage() {
  return (
    <main>
      <header className="topo">
        <h1>Órgãos</h1>
        <p>Cadastro central de municípios e estados atendidos</p>
      </header>

      <div className="page">
        <OrgaosConteudo />
      </div>
    </main>
  );
}
