"use client";

/** Conteúdo do cadastro de Órgãos, com a seção "Ações" (D15) — reaproveitado
 * pela página /orgaos e pelo modal aberto a partir do header (D18). */
import { useEffect, useState } from "react";
import Link from "next/link";
import { OrgaoComAcoes, TipoEnte } from "@/lib/orgaos/types";
import { mascaraCnpj } from "@/lib/mascaras";
import { ETAPAS_FLUXO } from "@/lib/processos/etapas";
import FormularioOrgao from "./FormularioOrgao";

interface FiltrosOrgaos {
  q: string;
  tipo: TipoEnte | "";
  de: string;
  ate: string;
}

const FILTROS_VAZIOS: FiltrosOrgaos = { q: "", tipo: "", de: "", ate: "" };

export default function OrgaosConteudo() {
  const [filtrosInput, setFiltrosInput] = useState<FiltrosOrgaos>(FILTROS_VAZIOS);
  const [filtrosAplicados, setFiltrosAplicados] = useState<FiltrosOrgaos>(FILTROS_VAZIOS);

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [orgaos, setOrgaos] = useState<OrgaoComAcoes[]>([]);

  const [formAberto, setFormAberto] = useState(false);

  async function carregarOrgaos(filtros: FiltrosOrgaos) {
    setCarregando(true);
    setErro(null);
    try {
      const params = new URLSearchParams();
      if (filtros.q.trim()) params.set("q", filtros.q.trim());
      if (filtros.tipo) params.set("tipo", filtros.tipo);
      if (filtros.de) params.set("de", filtros.de);
      if (filtros.ate) params.set("ate", filtros.ate);

      const resp = await fetch(`/api/orgaos?${params.toString()}`);
      const dados = await resp.json();
      if (!resp.ok || !dados.ok) throw new Error(dados.erro || "Falha ao carregar órgãos.");
      setOrgaos(dados.orgaos || []);
    } catch (err: any) {
      setErro(err.message || "Erro ao carregar órgãos.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarOrgaos(filtrosAplicados);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrosAplicados]);

  function buscar() {
    setFiltrosAplicados(filtrosInput);
  }

  function limparFiltros() {
    setFiltrosInput(FILTROS_VAZIOS);
    setFiltrosAplicados(FILTROS_VAZIOS);
  }

  function fecharForm() {
    setFormAberto(false);
  }

  async function aoCadastrarOrgao() {
    fecharForm();
    await carregarOrgaos(filtrosAplicados);
  }

  return (
    <div>
      <section className="card">
        <h2>Filtros</h2>
        <div className="grid">
          <div className="field">
            <label>Razão social</label>
            <input
              value={filtrosInput.q}
              onChange={(e) => setFiltrosInput((f) => ({ ...f, q: e.target.value }))}
              placeholder="Buscar por nome..."
            />
          </div>
          <div className="field">
            <label>Tipo do ente</label>
            <select
              value={filtrosInput.tipo}
              onChange={(e) => setFiltrosInput((f) => ({ ...f, tipo: e.target.value as TipoEnte | "" }))}
            >
              <option value="">Todos</option>
              <option value="Município">Município</option>
              <option value="Estado">Estado</option>
            </select>
          </div>
          <div className="field">
            <label>Cadastrado de</label>
            <input
              type="date"
              value={filtrosInput.de}
              onChange={(e) => setFiltrosInput((f) => ({ ...f, de: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Cadastrado até</label>
            <input
              type="date"
              value={filtrosInput.ate}
              onChange={(e) => setFiltrosInput((f) => ({ ...f, ate: e.target.value }))}
            />
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={buscar}>Buscar</button>
          <button className="btn secondary" onClick={limparFiltros}>Limpar filtros</button>
        </div>
      </section>

      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Órgãos cadastrados ({orgaos.length})</h2>
          <button className="btn" onClick={() => setFormAberto((v) => !v)}>
            {formAberto ? "Cancelar" : "+ Novo órgão"}
          </button>
        </div>

        {formAberto && (
          <div style={{ borderTop: "1px solid #d8dee3", marginTop: 12, paddingTop: 12 }}>
            <FormularioOrgao onSucesso={aoCadastrarOrgao} onCancelar={fecharForm} />
          </div>
        )}
      </section>

      {carregando && <p>Carregando...</p>}
      {erro && <p className="msg erro">{erro}</p>}

      {!carregando && orgaos.length === 0 && !erro && <p>Nenhum órgão encontrado.</p>}

      {orgaos.map((o) => {
        const acoes = o.processos || [];
        return (
          <div key={o.id} className="item-analise">
            <Link href={`/orgaos/${o.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="item-analise-cabecalho" style={{ cursor: "pointer" }}>
                <span className="etapa-badge">
                  {o.razao_social} — {o.cidade}/{o.uf}
                </span>
                <span className="decisao-tag decisao-pendente">{o.tipo_ente}</span>
              </div>
              <p className="item-analise-resumo">
                CNPJ: {mascaraCnpj(o.cnpj)} — Cadastrado em {new Date(o.created_at).toLocaleString("pt-BR")}
              </p>
            </Link>

            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e2e8f0" }}>
              <span className="detalhe" style={{ fontWeight: 600 }}>
                Ações ({acoes.length})
              </span>
              {acoes.length === 0 ? (
                <p className="detalhe" style={{ margin: "4px 0 0" }}>
                  Nenhuma ação (processo) aberta para este órgão ainda.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                  {acoes.map((a) => {
                    const temTR = a.arquivos.includes("tr");
                    const temProposta = a.arquivos.includes("proposta");
                    const temOficio = !!a.documentos?.oficio;
                    const pct = ETAPAS_FLUXO.length
                      ? Math.round(((a.etapa + 1) / ETAPAS_FLUXO.length) * 100)
                      : 0;
                    return (
                      <div key={a.id} style={{ background: "var(--bg-suave)", borderRadius: 8, padding: "8px 10px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <strong style={{ fontSize: 13 }}>{a.titulo}</strong>
                          <span className="detalhe" style={{ fontSize: 12 }}>{pct}%</span>
                        </div>
                        <div className="fu-progresso" style={{ margin: "6px 0" }}>
                          <div className="fu-barra" style={{ width: `${pct}%` }} />
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12 }}>
                          <span className={`detalhe ${temTR ? "" : "pendente"}`}>
                            {temTR ? "✅ TR" : "⏳ TR"}
                          </span>
                          <span className={`detalhe ${temProposta ? "" : "pendente"}`}>
                            {temProposta ? "✅ Proposta" : "⏳ Proposta"}
                          </span>
                          <span className={`detalhe ${temOficio ? "" : "pendente"}`}>
                            {temOficio ? "✅ Ofício" : a.proposta_aprovada ? "⏳ Ofício" : "🔒 Ofício"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
