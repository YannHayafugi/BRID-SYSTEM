"use client";

import AdminUsuariosConteudo from "@/app/components/AdminUsuariosConteudo";

export default function AdminUsuariosPage() {
  return (
    <main>
      <header className="topo">
        <h1>Administração de usuários</h1>
      </header>

      <div className="page">
        <AdminUsuariosConteudo />
      </div>
    </main>
  );
}
