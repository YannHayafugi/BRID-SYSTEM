"use client";

import PerfilConteudo from "@/app/components/PerfilConteudo";

export default function PerfilPage() {
  return (
    <main>
      <header className="topo">
        <h1>Meu perfil</h1>
        <p>Editar nome, e-mail e senha</p>
      </header>

      <div className="page" style={{ maxWidth: 480 }}>
        <PerfilConteudo />
      </div>
    </main>
  );
}
