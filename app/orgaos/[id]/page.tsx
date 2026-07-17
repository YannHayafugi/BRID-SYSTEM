"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Contato, NovoContatoInput, OrgaoComContatos, TipoEnte, UFS_BRASIL } from "@/lib/orgaos/types";
import { mascaraCnpj, mascaraTelefone } from "@/lib/mascaras";

function novoContatoVazio(): NovoContatoInput {
  return { nomeCompleto: "", cargo: "", telefone: "", email: "" };
}

export default function OrgaoDetalhePage() {
  const params = useParams<{ id: string }>();

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [orgao, setOrgao] = useState<OrgaoComContatos | null>(null);

  const [editando, setEditando] = useState(false);
  const [tipoEnte, setTipoEnte] = useState<TipoEnte>("Município");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [mensagemEdicao, setMensagemEdicao] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const [contatoForm, setContatoForm] = useState<NovoContatoInput | null>(null);
  const [salvandoContato, setSalvandoContato] = useState(false);
  const [mensagemContato, setMensagemContato] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const resp = await fetch(`/api/orgaos/${params.id}`);
      const dados = await resp.json();
      if (!resp.ok || !dados.ok) throw new Error(dados.erro || "Falha ao carregar o órgão.");
      setOrgao(dados.orgao);
      setTipoEnte(dados.orgao.tipo_ente);
      setRazaoSocial(dados.orgao.razao_social);
      setCnpj(mascaraCnpj(dados.orgao.cnpj || ""));
      setCidade(dados.orgao.cidade);
      setUf(dados.orgao.uf);
    } catch (err: any) {
      setErro(err.message || "Erro ao carregar o órgão.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function salvarEdicao() {
    setMensagemEdicao(null);
    const faltando: string[] = [];
    if (!razaoSocial.trim()) faltando.push("Razão social");
    if (!cnpj.trim()) faltando.push("CNPJ");
    if (!cidade.trim()) faltando.push("Cidade");
    if (!uf.trim()) faltando.push("UF");
    if (faltando.length > 0) {
      setMensagemEdicao({ tipo: "erro", texto: "Preencha: " + faltando.join(", ") });
      return;
    }

    setSalvandoEdicao(true);
    try {
      const resp = await fetch(`/api/orgaos/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipoEnte, razaoSocial, cnpj, cidade, uf }),
      });
      const dados = await resp.json();
      if (!resp.ok || !dados.ok) throw new Error(dados.erro || "Falha ao salvar.");
      setOrgao((prev) => (prev ? { ...prev, ...dados.orgao } : prev));
      setEditando(false);
    } catch (err: any) {
      setMensagemEdicao({ tipo: "erro", texto: err.message || "Erro inesperado ao salvar." });
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function salvarNovoContato() {
    if (!contatoForm) return;
    setMensagemContato(null);
    setSalvandoContato(true);
    try {
      const resp = await fetch(`/api/orgaos/${params.id}/contatos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contatoForm),
      });
      const dados = await resp.json();
      if (!resp.ok || !dados.ok) throw new Error(dados.erro || "Falha ao salvar o contato.");

      setOrgao((prev) => (prev ? { ...prev, contatos: [...prev.contatos, dados.contato as Contato] } : prev));
      setContatoForm(null);
    } catch (err: any) {
      setMensagemContato({ tipo: "erro", texto: err.message || "Erro inesperado ao salvar o contato." });
    } finally {
      setSalvandoContato(false);
    }
  }

  if (carregando) {
    return (
      <main>
        <div className="page">
          <p>Carregando...</p>
        </div>
      </main>
    );
  }

  if (!orgao) {
    return (
      <main>
        <div className="page">
          <p className="msg erro">{erro || "Órgão não encontrado."}</p>
          <Link href="/orgaos">← voltar aos órgãos</Link>
        </div>
      </main>
    );
  }

  return (
    <main>
      <header className="topo">
        <h1>
          {orgao.razao_social} — {orgao.cidade}/{orgao.uf}
        </h1>
        <p>{orgao.tipo_ente}</p>
      </header>

      <div className="page">
        <p style={{ marginBottom: 20 }}>
          <Link href="/orgaos">← voltar aos órgãos</Link>
        </p>

        <section className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2>Dados do órgão</h2>
            <button className="btn secondary" onClick={() => setEditando((v) => !v)}>
              {editando ? "Cancelar" : "Editar cadastro"}
            </button>
          </div>

          {!editando ? (
            <p>
              <strong>Tipo:</strong> {orgao.tipo_ente}
              <br />
              <strong>Razão social:</strong> {orgao.razao_social}
              <br />
              <strong>CNPJ:</strong> {mascaraCnpj(orgao.cnpj)}
              <br />
              <strong>Cidade/UF:</strong> {orgao.cidade}/{orgao.uf}
              <br />
              <strong>Cadastrado em:</strong> {new Date(orgao.created_at).toLocaleString("pt-BR")}
            </p>
          ) : (
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
                  <input value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} />
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
              <div className="actions">
                <button className="btn" onClick={salvarEdicao} disabled={salvandoEdicao}>
                  {salvandoEdicao ? "Salvando..." : "Salvar alterações"}
                </button>
                {mensagemEdicao && <span className={`msg ${mensagemEdicao.tipo}`}>{mensagemEdicao.texto}</span>}
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2>Contatos ({orgao.contatos.length})</h2>
            {!contatoForm && (
              <button className="btn secondary" onClick={() => setContatoForm(novoContatoVazio())}>
                + Adicionar contato
              </button>
            )}
          </div>

          {orgao.contatos.length === 0 && !contatoForm && (
            <p style={{ color: "#667085", fontSize: 13 }}>Nenhum contato cadastrado ainda.</p>
          )}

          {orgao.contatos.map((c) => (
            <div key={c.id} className="item-analise item-ok">
              <strong>{c.nome_completo}</strong> — {c.cargo}
              <br />
              <span style={{ fontSize: 13 }}>
                {c.email}
                {c.telefone ? ` · ${c.telefone}` : ""}
              </span>
            </div>
          ))}

          {contatoForm && (
            <div className="etapa-card">
              <div className="grid">
                <div className="field">
                  <label>Nome completo do responsável *</label>
                  <input
                    value={contatoForm.nomeCompleto}
                    onChange={(e) => setContatoForm((f) => (f ? { ...f, nomeCompleto: e.target.value } : f))}
                  />
                </div>
                <div className="field">
                  <label>Cargo *</label>
                  <input
                    value={contatoForm.cargo}
                    onChange={(e) => setContatoForm((f) => (f ? { ...f, cargo: e.target.value } : f))}
                  />
                </div>
                <div className="field">
                  <label>Telefone (com DDD) *</label>
                  <input
                    value={contatoForm.telefone || ""}
                    onChange={(e) =>
                      setContatoForm((f) => (f ? { ...f, telefone: mascaraTelefone(e.target.value) } : f))
                    }
                    placeholder="(11) 91234-5678"
                    inputMode="numeric"
                    maxLength={15}
                  />
                </div>
                <div className="field">
                  <label>E-mail *</label>
                  <input
                    type="email"
                    value={contatoForm.email}
                    onChange={(e) => setContatoForm((f) => (f ? { ...f, email: e.target.value } : f))}
                  />
                </div>
              </div>
              <div className="actions">
                <button className="btn" onClick={salvarNovoContato} disabled={salvandoContato}>
                  {salvandoContato ? "Salvando..." : "Salvar contato"}
                </button>
                <button className="btn secondary" onClick={() => setContatoForm(null)}>
                  Cancelar
                </button>
                {mensagemContato && <span className={`msg ${mensagemContato.tipo}`}>{mensagemContato.texto}</span>}
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <h2>Ações</h2>
          <div className="actions">
            <Link
              href={`/tr-analise?orgao=${orgao.id}`}
              className="btn"
              style={{ display: "inline-block", textDecoration: "none" }}
            >
              Analisar TR
            </Link>
            <Link
              href={`/proposta?orgao=${orgao.id}`}
              className="btn"
              style={{ display: "inline-block", textDecoration: "none" }}
            >
              Gerar Proposta
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
