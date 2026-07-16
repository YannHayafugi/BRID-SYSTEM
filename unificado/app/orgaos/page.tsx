"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NovoContatoInput, Orgao, TipoEnte, UFS_BRASIL } from "@/lib/orgaos/types";
import { mascaraCnpj, mascaraTelefone } from "@/lib/mascaras";

interface FiltrosOrgaos {
  q: string;
  tipo: TipoEnte | "";
  de: string;
  ate: string;
}

const FILTROS_VAZIOS: FiltrosOrgaos = { q: "", tipo: "", de: "", ate: "" };

function novoContatoVazio(): NovoContatoInput {
  return { nomeCompleto: "", cargo: "", telefone: "", email: "" };
}

export default function OrgaosPage() {
  const [filtrosInput, setFiltrosInput] = useState<FiltrosOrgaos>(FILTROS_VAZIOS);
  const [filtrosAplicados, setFiltrosAplicados] = useState<FiltrosOrgaos>(FILTROS_VAZIOS);

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [orgaos, setOrgaos] = useState<Orgao[]>([]);

  const [formAberto, setFormAberto] = useState(false);
  const [tipoEnte, setTipoEnte] = useState<TipoEnte>("Município");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [contatos, setContatos] = useState<NovoContatoInput[]>([novoContatoVazio()]);
  const [salvando, setSalvando] = useState(false);
  const [mensagemForm, setMensagemForm] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

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

  function atualizarContato(idx: number, campo: keyof NovoContatoInput, valor: string) {
    setContatos((prev) => prev.map((c, i) => (i === idx ? { ...c, [campo]: valor } : c)));
  }

  function adicionarContato() {
    setContatos((prev) => [...prev, novoContatoVazio()]);
  }

  function removerContato(idx: number) {
    setContatos((prev) => prev.filter((_, i) => i !== idx));
  }

  function fecharForm() {
    setFormAberto(false);
    setTipoEnte("Município");
    setRazaoSocial("");
    setCnpj("");
    setCidade("");
    setUf("");
    setContatos([novoContatoVazio()]);
    setMensagemForm(null);
  }

  async function cadastrarOrgao() {
    setMensagemForm(null);

    const faltando: string[] = [];
    if (!razaoSocial.trim()) faltando.push("Razão social");
    if (!cnpj.trim()) faltando.push("CNPJ");
    if (!cidade.trim()) faltando.push("Cidade");
    if (!uf.trim()) faltando.push("UF");
    if (faltando.length > 0) {
      setMensagemForm({ tipo: "erro", texto: "Preencha: " + faltando.join(", ") });
      return;
    }

    // Só considera contatos que o usuário começou a preencher.
    const contatosPreenchidos = contatos.filter(
      (c) => c.nomeCompleto.trim() || c.cargo.trim() || c.email.trim() || c.telefone?.trim()
    );

    setSalvando(true);
    try {
      const resp = await fetch("/api/orgaos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipoEnte, razaoSocial, cnpj, cidade, uf, contatos: contatosPreenchidos }),
      });
      const dados = await resp.json();
      if (!resp.ok || !dados.ok) throw new Error(dados.erro || "Falha ao cadastrar o órgão.");

      fecharForm();
      await carregarOrgaos(filtrosAplicados);
    } catch (err: any) {
      setMensagemForm({ tipo: "erro", texto: err.message || "Erro inesperado ao cadastrar o órgão." });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main>
      <header className="topo">
        <h1>Órgãos</h1>
        <p>Cadastro central de municípios e estados atendidos</p>
      </header>

      <div className="page">
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
              <div className="grid">
                <div className="field">
                  <label>Tipo do ente *</label>
                  <select value={tipoEnte} onChange={(e) => setTipoEnte(e.target.value as TipoEnte)}>
                    <option value="Município">Município</option>
                    <option value="Estado">Estado</option>
                  </select>
                </div>
                <div className="field">
                  <label>Razão social *</label>
                  <input
                    value={razaoSocial}
                    onChange={(e) => setRazaoSocial(e.target.value)}
                    placeholder="Ex.: Município de São Roque"
                  />
                </div>
                <div className="field">
                  <label>CNPJ *</label>
                  <input
                    value={cnpj}
                    onChange={(e) => setCnpj(mascaraCnpj(e.target.value))}
                    placeholder="00.000.000/0000-00"
                    inputMode="numeric"
                    maxLength={18}
                  />
                </div>
                <div className="field">
                  <label>Cidade *</label>
                  <input value={cidade} onChange={(e) => setCidade(e.target.value)} />
                </div>
                <div className="field">
                  <label>UF *</label>
                  <select value={uf} onChange={(e) => setUf(e.target.value)}>
                    <option value="">Selecione...</option>
                    {UFS_BRASIL.map((u) => (
                      <option key={u.sigla} value={u.sigla}>
                        {u.sigla} — {u.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <h3 style={{ marginTop: 16, marginBottom: 4, fontSize: 15 }}>Contatos (opcional)</h3>
              <p style={{ fontSize: 13, color: "#667085", marginTop: 0 }}>
                Podem ser preenchidos agora ou depois, mas serão exigidos ao analisar um TR ou gerar uma proposta
                para este órgão.
              </p>

              {contatos.map((c, idx) => (
                <div key={idx} className="etapa-card">
                  {contatos.length > 1 && (
                    <button
                      type="button"
                      className="etapa-remove"
                      onClick={() => removerContato(idx)}
                      title="Remover contato"
                    >
                      remover ✕
                    </button>
                  )}
                  <div className="grid">
                    <div className="field">
                      <label>Nome completo do responsável</label>
                      <input
                        value={c.nomeCompleto}
                        onChange={(e) => atualizarContato(idx, "nomeCompleto", e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Cargo</label>
                      <input value={c.cargo} onChange={(e) => atualizarContato(idx, "cargo", e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Telefone (com DDD)</label>
                      <input
                        value={c.telefone || ""}
                        onChange={(e) => atualizarContato(idx, "telefone", mascaraTelefone(e.target.value))}
                        placeholder="(11) 91234-5678"
                        inputMode="numeric"
                        maxLength={15}
                      />
                    </div>
                    <div className="field">
                      <label>E-mail</label>
                      <input
                        type="email"
                        value={c.email}
                        onChange={(e) => atualizarContato(idx, "email", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}

              <button type="button" className="btn secondary" onClick={adicionarContato}>
                + Adicionar contato
              </button>

              <div className="actions" style={{ marginTop: 16 }}>
                <button className="btn" onClick={cadastrarOrgao} disabled={salvando}>
                  {salvando ? "Salvando..." : "Cadastrar órgão"}
                </button>
                {mensagemForm && <span className={`msg ${mensagemForm.tipo}`}>{mensagemForm.texto}</span>}
              </div>
            </div>
          )}
        </section>

        {carregando && <p>Carregando...</p>}
        {erro && <p className="msg erro">{erro}</p>}

        {!carregando && orgaos.length === 0 && !erro && <p>Nenhum órgão encontrado.</p>}

        {orgaos.map((o) => (
          <Link key={o.id} href={`/orgaos/${o.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div className="item-analise" style={{ cursor: "pointer" }}>
              <div className="item-analise-cabecalho">
                <span className="etapa-badge">
                  {o.razao_social} — {o.cidade}/{o.uf}
                </span>
                <span className="decisao-tag decisao-pendente">{o.tipo_ente}</span>
              </div>
              <p className="item-analise-resumo">
                CNPJ: {mascaraCnpj(o.cnpj)} — Cadastrado em {new Date(o.created_at).toLocaleString("pt-BR")}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
