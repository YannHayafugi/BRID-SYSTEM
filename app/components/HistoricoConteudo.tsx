"use client";

/** Conteúdo de "Histórico de análises de TR" — reaproveitado pela página
 * /historico e pelo modal aberto a partir do header (D18). */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface CadastroResumo {
  id: string;
  classificacao: string;
  nome_ente: string;
  uf: string;
  nome_arquivo_tr: string;
  status: string;
  relatorio_gerado_em: string | null;
  created_at: string;
}

interface Etapa { nome: string; tipo: "auto" | "manual" }
interface ProcessoResumo {
  id: string;
  titulo: string;
  orgao: { id: string; razao_social: string } | null;
  data: string;
  etapa: number;
  criado_por: { id: string; nome: string } | null;
}

export default function HistoricoConteudo() {
  const router = useRouter();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [cadastros, setCadastros] = useState<CadastroResumo[]>([]);

  // D44: processos abertos por este usuário — no Histórico todo mundo
  // (inclusive admin) vê apenas o que criou.
  const [processos, setProcessos] = useState<ProcessoResumo[]>([]);
  const [etapas, setEtapas] = useState<Etapa[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const supabase = getSupabaseBrowserClient();

        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          router.replace("/login?proximo=/historico");
          return;
        }

        // D44: no Histórico, cada um vê só o que criou — vale também para
        // admin, nas duas listas (análises de TR e processos).
        const { data, error } = await supabase
          .from("gp_cadastros_tr")
          .select("id, classificacao, nome_ente, uf, nome_arquivo_tr, status, relatorio_gerado_em, created_at")
          .eq("criado_por", userData.user.id)
          .order("created_at", { ascending: false });

        if (error) throw new Error(error.message);
        setCadastros(data || []);

        const rp = await fetch("/api/processos?meus=1");
        if (rp.ok) {
          const dp = await rp.json();
          setProcessos(dp.processos || []);
          setEtapas(dp.etapas || []);
        }
      } catch (err: any) {
        setErro(err.message || "Erro ao carregar histórico.");
      } finally {
        setCarregando(false);
      }
    })();
  }, [router]);

  return (
    <div>
      {carregando && <p>Carregando...</p>}
      {erro && <p className="msg erro">{erro}</p>}

      <h3 style={{ fontSize: 15, margin: "0 0 10px" }}>
        📋 Meus processos abertos ({processos.length})
      </h3>
      {!carregando && processos.length === 0 && <p className="vazio" style={{ marginBottom: 20 }}>Nenhum processo aberto ainda.</p>}
      {processos.map((p) => {
        const pct = etapas.length ? Math.round(((p.etapa + 1) / etapas.length) * 100) : 0;
        return (
          <Link key={p.id} href={`/followup?processo=${p.id}`} className="item"
            style={{ display: "block", textDecoration: "none", color: "inherit", marginBottom: 10 }}
            title="Abrir este processo no Follow-up">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <strong style={{ fontSize: 13 }}>{p.titulo}</strong>
              <span className="detalhe">{pct}%</span>
            </div>
            <div className="fu-progresso" style={{ margin: "6px 0" }}>
              <div className="fu-barra" style={{ width: `${pct}%` }} />
            </div>
            <span className="detalhe">
              {p.orgao ? `${p.orgao.razao_social} — ` : ""}{etapas[p.etapa]?.nome || ""}
              {p.criado_por ? ` — criado por ${p.criado_por.nome}` : ""}
            </span>
          </Link>
        );
      })}

      <h3 style={{ fontSize: 15, margin: "24px 0 10px", borderTop: "1px solid var(--borda)", paddingTop: 16 }}>
        🔍 Minhas análises de TR ({cadastros.length})
      </h3>
      {!carregando && cadastros.length === 0 && !erro && <p>Nenhuma análise salva ainda.</p>}

      {cadastros.map((c) => (
        <Link key={c.id} href={`/historico/${c.id}`} style={{ textDecoration: "none", color: "inherit" }}>
          <div className="item-analise" style={{ cursor: "pointer" }}>
            <div className="item-analise-cabecalho">
              <span className="etapa-badge">
                {c.classificacao} de {c.nome_ente} — {c.uf}
              </span>
              <span className={`decisao-tag ${c.status === "concluida" ? "decisao-aceita" : "decisao-pendente"}`}>
                {c.status === "concluida" ? "Concluída" : "Em análise"}
              </span>
            </div>
            <p className="item-analise-resumo">
              Arquivo: {c.nome_arquivo_tr} — analisado em {new Date(c.created_at).toLocaleString("pt-BR")}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
