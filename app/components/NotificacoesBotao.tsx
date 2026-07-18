"use client";

/** D27: ícone de notificações no header global (antes só existia dentro do
 * Dashboard). Busca os processos, calcula os avisos de automação/manual e
 * mostra tudo num modal — acessível em qualquer página do sistema. */
import { useEffect, useState } from "react";
import Link from "next/link";
import Modal from "./Modal";

interface Etapa { nome: string; tipo: "auto" | "manual" }
interface Processo {
  id: string; titulo: string; etapa: number;
  arquivos: string[]; documentos: { oficio?: unknown };
  atualizado_em: string;
}

function fmtData(iso: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function NotificacoesBotao() {
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    fetch("/api/processos").then(async (r) => {
      if (!r.ok) return;
      const d = await r.json();
      setProcessos(d.processos || []);
      setEtapas(d.etapas || []);
    }).catch(() => {});
  }, []);

  const temOficio = (p: Processo) => !!p.documentos?.oficio;
  const temTR = (p: Processo) => p.arquivos.includes("tr");
  const temProposta = (p: Processo) => p.arquivos.includes("proposta");
  const primeiraManual = etapas.findIndex((e) => e.tipo === "manual");

  // D46: processos finalizados (última fase, 100%) não geram notificação —
  // não há mais pendência neles.
  const ativos = processos.filter((p) => !(etapas.length && p.etapa === etapas.length - 1));

  const avisosAutomacao = ativos.flatMap((p) => {
    if (!temOficio(p)) return [{ p, msg: "sem Ofício de abertura — gere ou anexe pelo Follow-up", pronto: false }];
    if (!temTR(p)) return [{ p, msg: "aguardando envio do TR", pronto: false }];
    if (!temProposta(p)) return [{ p, msg: "TR enviado — pronto para gerar a Proposta 🤖", pronto: true }];
    return [];
  });

  const avisosManual = ativos.flatMap((p) => {
    if (primeiraManual < 0 || p.etapa < primeiraManual) return [];
    return [{ p, msg: `Fase atual: ${etapas[p.etapa]?.nome || "-"}`, pronto: false }];
  });

  const total = avisosAutomacao.length + avisosManual.length;

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        title="Ver notificações de automação e de fases manuais"
        style={{
          position: "relative",
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
        🔔
        {total > 0 && (
          <span
            style={{
              position: "absolute",
              top: -5,
              right: -5,
              background: "var(--primaria)",
              color: "var(--escuro)",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 800,
              minWidth: 16,
              height: 16,
              padding: "0 3px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            {total}
          </span>
        )}
      </button>

      {aberto && (
        <Modal titulo="🔔 Notificações" onFechar={() => setAberto(false)}>
          <span className="detalhe" style={{ fontWeight: 700, display: "block", margin: "4px 0" }}>🤖 Automação</span>
          {avisosAutomacao.length ? avisosAutomacao.map((a, i) => (
            <Link href={`/followup?processo=${a.p.id}`} className={`item notif ${a.pronto ? "pronto" : ""}`} key={i}
              style={{ display: "block", textDecoration: "none", color: "inherit", cursor: "pointer" }}
              title="Abrir este processo no Follow-up" onClick={() => setAberto(false)}>
              <div>
                <strong>{a.p.titulo}</strong>
                <span className="detalhe">{a.msg}</span>
                <span className="detalhe">Última atualização: {fmtData(a.p.atualizado_em)}</span>
              </div>
            </Link>
          )) : <p className="vazio">✅ Nenhuma pendência de automação.</p>}

          <span className="detalhe" style={{ fontWeight: 700, display: "block", margin: "12px 0 4px" }}>✋ Manual</span>
          {avisosManual.length ? avisosManual.map((a, i) => (
            <Link href={`/followup?processo=${a.p.id}`} className="item notif" key={i}
              style={{ display: "block", textDecoration: "none", color: "inherit", cursor: "pointer" }}
              title="Abrir este processo no Follow-up" onClick={() => setAberto(false)}>
              <div>
                <strong>{a.p.titulo}</strong>
                <span className="detalhe">{a.msg}</span>
                <span className="detalhe">Última atualização: {fmtData(a.p.atualizado_em)}</span>
              </div>
            </Link>
          )) : <p className="vazio">✅ Nenhum processo em fase manual.</p>}
        </Modal>
      )}
    </>
  );
}
