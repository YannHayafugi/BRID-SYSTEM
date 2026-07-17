"use client";

/** Arquivos — todos os documentos do sistema, por tipo (enviados × gerados). */
import { useEffect, useState } from "react";

interface Processo {
  id: string; titulo: string; data: string; tr_nome: string; arquivos: string[];
  orgao: { razao_social: string } | null;
}

function fmtData(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function ArquivosPage() {
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetch("/api/processos").then(async (r) => {
      if (r.status === 401) { window.location.href = "/login"; return; }
      setProcessos((await r.json()).processos || []);
      setCarregando(false);
    }).catch(() => setCarregando(false));
  }, []);

  const enviados = processos.filter((p) => p.arquivos.includes("tr"));
  const gerados = processos.filter((p) => p.arquivos.includes("proposta"));

  if (carregando) return <div className="page-larga"><p className="vazio">Carregando...</p></div>;

  return (
    <div className="page-larga">
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>Arquivos</h1>
      <p className="detalhe" style={{ marginBottom: 20 }}>Todos os documentos do sistema, organizados por tipo.</p>

      <h3 style={{ borderBottom: "2px solid var(--borda)", paddingBottom: 8 }}>📥 Enviados — Termos de Referência</h3>
      {enviados.length ? enviados.map((p) => (
        <div className="item" key={`tr-${p.id}`}>
          <div>
            <strong>📄 {p.tr_nome || "TR"}</strong>
            <span className="detalhe">{fmtData(p.data)} — processo: {p.titulo}</span>
          </div>
          <a className="btn-dl btn-sec" href={`/api/processos/${p.id}/download/tr`}
            title="Baixar o Termo de Referência original">⬇ Baixar TR</a>
        </div>
      )) : <p className="vazio">Nenhum TR enviado ainda.</p>}

      <h3 style={{ borderBottom: "2px solid var(--borda)", paddingBottom: 8, marginTop: 32 }}>📤 Gerados — Propostas e Resumos</h3>
      {gerados.length ? gerados.map((p) => (
        <div className="item item-col" key={`ger-${p.id}`}>
          <div>
            <strong>{p.titulo}</strong>
            <span className="detalhe">{p.orgao ? `${p.orgao.razao_social} — ` : ""}{fmtData(p.data)}</span>
          </div>
          <div className="downloads">
            <a className="btn-dl" href={`/api/processos/${p.id}/download/proposta`}
              title="Baixar a proposta completa (.docx)">⬇ Proposta.docx</a>
            <a className="btn-dl" href={`/api/processos/${p.id}/download/resumo`}
              title="Baixar o resumo executivo (.docx)">⬇ Resumo.docx</a>
          </div>
        </div>
      )) : <p className="vazio">Nenhum documento gerado ainda.</p>}
    </div>
  );
}
