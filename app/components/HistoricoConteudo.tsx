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

export default function HistoricoConteudo() {
  const router = useRouter();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [cadastros, setCadastros] = useState<CadastroResumo[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const supabase = getSupabaseBrowserClient();

        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          router.replace("/login?proximo=/historico");
          return;
        }

        const { data, error } = await supabase
          .from("gp_cadastros_tr")
          .select("id, classificacao, nome_ente, uf, nome_arquivo_tr, status, relatorio_gerado_em, created_at")
          .order("created_at", { ascending: false });

        if (error) throw new Error(error.message);
        setCadastros(data || []);
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
