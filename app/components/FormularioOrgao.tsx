"use client";

/** D37: formulário de cadastro de órgão, extraído de OrgaosConteudo para ser
 * reaproveitado também no modal "+ Novo órgão" do Follow-up — mesmo
 * formulário completo (tipo, razão social, CNPJ, cidade, UF e contatos),
 * em vez do atalho reduzido que existia antes. */
import { useState } from "react";
import { NovoContatoInput, OrgaoComAcoes, TipoEnte, UFS_BRASIL } from "@/lib/orgaos/types";
import { mascaraCnpj, mascaraTelefone } from "@/lib/mascaras";

function novoContatoVazio(): NovoContatoInput {
  return { nomeCompleto: "", cargo: "", telefone: "", email: "" };
}

export default function FormularioOrgao({
  onSucesso,
  onCancelar,
}: {
  onSucesso: (orgao: OrgaoComAcoes) => void;
  onCancelar?: () => void;
}) {
  const [tipoEnte, setTipoEnte] = useState<TipoEnte>("Município");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [contatos, setContatos] = useState<NovoContatoInput[]>([novoContatoVazio()]);
  const [salvando, setSalvando] = useState(false);
  const [mensagemForm, setMensagemForm] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  function atualizarContato(idx: number, campo: keyof NovoContatoInput, valor: string) {
    setContatos((prev) => prev.map((c, i) => (i === idx ? { ...c, [campo]: valor } : c)));
  }

  function adicionarContato() {
    setContatos((prev) => [...prev, novoContatoVazio()]);
  }

  function removerContato(idx: number) {
    setContatos((prev) => prev.filter((_, i) => i !== idx));
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

      onSucesso(dados.orgao);
    } catch (err: any) {
      setMensagemForm({ tipo: "erro", texto: err.message || "Erro inesperado ao cadastrar o órgão." });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
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
      <p style={{ fontSize: 13, color: "var(--texto-suave)", marginTop: 0 }}>
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
        {onCancelar && (
          <button type="button" className="btn secondary" onClick={onCancelar} disabled={salvando}>
            Cancelar
          </button>
        )}
        {mensagemForm && <span className={`msg ${mensagemForm.tipo}`}>{mensagemForm.texto}</span>}
      </div>
    </div>
  );
}
