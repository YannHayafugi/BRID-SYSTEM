"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Etapa, PropostaFormData, Tratamento } from "@/lib/types";
import { ETAPAS_PADRAO } from "@/lib/etapasPadrao";
import { Contato, NovoContatoInput, OrgaoComContatos } from "@/lib/orgaos/types";
import { mascaraTelefone } from "@/lib/mascaras";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
  "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const hoje = new Date();

function novaEtapaVazia(): Etapa {
  return { titulo: "", atividades: "", periodo: "" };
}

function novoContatoVazio(): NovoContatoInput {
  return { nomeCompleto: "", cargo: "", telefone: "", email: "" };
}

/** Aplica máscara de moeda brasileira (milhar com ".", decimais com ",")
 * conforme o usuário digita, no estilo dos campos de valor de apps bancários. */
function mascaraMoeda(valorDigitado: string): string {
  const digitos = valorDigitado.replace(/\D/g, "");
  if (!digitos) return "";
  const numero = parseInt(digitos, 10) / 100;
  return numero.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function etapasIguais(a: Etapa[], b: Etapa[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function PropostaPage() {
  return (
    <Suspense fallback={<main><div className="page"><p>Carregando...</p></div></main>}>
      <PropostaPageConteudo />
    </Suspense>
  );
}

function PropostaPageConteudo() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orgaoId = searchParams.get("orgao");

  const [carregandoOrgao, setCarregandoOrgao] = useState(true);
  const [erroOrgao, setErroOrgao] = useState<string | null>(null);
  const [orgao, setOrgao] = useState<OrgaoComContatos | null>(null);

  const [contatoSelecionadoId, setContatoSelecionadoId] = useState("");
  const [contatoForm, setContatoForm] = useState<NovoContatoInput | null>(null);
  const [salvandoContato, setSalvandoContato] = useState(false);
  const [erroContato, setErroContato] = useState<string | null>(null);

  const [dataDia, setDataDia] = useState(hoje.getDate());
  const [dataMes, setDataMes] = useState(hoje.getMonth() + 1);
  const [dataAno, setDataAno] = useState(hoje.getFullYear());

  const [tratamento, setTratamento] = useState<Tratamento>("Senhor");

  const [prazoMeses, setPrazoMeses] = useState<number | "">("");
  const [honorarios, setHonorarios] = useState("");
  const [parcelas, setParcelas] = useState<number | "">("");

  const [etapas, setEtapas] = useState<Etapa[]>(ETAPAS_PADRAO);

  const [gerando, setGerando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const anos = Array.from({ length: 6 }, (_, i) => hoje.getFullYear() + i - 1);
  const dias = Array.from({ length: 31 }, (_, i) => i + 1);
  const mesesOpts = MESES.map((m, i) => ({ valor: i + 1, label: m }));
  const numeros36 = Array.from({ length: 36 }, (_, i) => i + 1);

  useEffect(() => {
    if (!orgaoId) {
      router.replace("/orgaos");
      return;
    }
    (async () => {
      setCarregandoOrgao(true);
      setErroOrgao(null);
      try {
        const resp = await fetch(`/api/orgaos/${orgaoId}`);
        const dados = await resp.json();
        if (!resp.ok || !dados.ok) throw new Error(dados.erro || "Falha ao carregar o órgão.");
        setOrgao(dados.orgao);
        if (dados.orgao.contatos.length === 1) {
          setContatoSelecionadoId(dados.orgao.contatos[0].id);
        }
      } catch (err: any) {
        setErroOrgao(err.message || "Erro ao carregar o órgão.");
      } finally {
        setCarregandoOrgao(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgaoId]);

  async function salvarNovoContato() {
    if (!contatoForm || !orgaoId) return;
    setErroContato(null);
    setSalvandoContato(true);
    try {
      const resp = await fetch(`/api/orgaos/${orgaoId}/contatos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contatoForm),
      });
      const dados = await resp.json();
      if (!resp.ok || !dados.ok) throw new Error(dados.erro || "Falha ao salvar o contato.");

      const novoContato = dados.contato as Contato;
      setOrgao((prev) => (prev ? { ...prev, contatos: [...prev.contatos, novoContato] } : prev));
      setContatoSelecionadoId(novoContato.id);
      setContatoForm(null);
    } catch (err: any) {
      setErroContato(err.message || "Erro inesperado ao salvar o contato.");
    } finally {
      setSalvandoContato(false);
    }
  }

  function atualizarEtapa(idx: number, campo: keyof Etapa, valor: string) {
    setEtapas((prev) => prev.map((e, i) => (i === idx ? { ...e, [campo]: valor } : e)));
  }

  function adicionarEtapa() {
    setEtapas((prev) => [...prev, novaEtapaVazia()]);
  }

  function removerEtapa(idx: number) {
    setEtapas((prev) => prev.filter((_, i) => i !== idx));
  }

  function moverEtapa(idx: number, direcao: -1 | 1) {
    setEtapas((prev) => {
      const novo = [...prev];
      const alvo = idx + direcao;
      if (alvo < 0 || alvo >= novo.length) return prev;
      [novo[idx], novo[alvo]] = [novo[alvo], novo[idx]];
      return novo;
    });
  }

  function parseHonorarios(valor: string): number {
    const limpo = valor.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
    const n = parseFloat(limpo);
    return isNaN(n) ? 0 : n;
  }

  const contatoSelecionado = orgao?.contatos.find((c) => c.id === contatoSelecionadoId) || null;

  /** Verifica os campos obrigatórios. Retorna a lista de campos que ainda
   * faltam preencher (vazia se estiver tudo ok). */
  function camposObrigatoriosFaltando(): string[] {
    const faltando: string[] = [];

    if (!contatoSelecionado) faltando.push("Contato (destinatário) do órgão");

    if (!dataDia || !dataMes || !dataAno) faltando.push("Data de emissão");

    if (!prazoMeses) faltando.push("Prazo do contrato (meses)");
    if (!honorarios.trim() || parseHonorarios(honorarios) <= 0) faltando.push("Honorários");
    if (!parcelas) faltando.push("Parcelas");

    return faltando;
  }

  async function gerarDocumento() {
    setMensagem(null);
    if (!orgao) return;

    const faltando = camposObrigatoriosFaltando();
    if (faltando.length > 0) {
      window.alert(
        "Antes de gerar a proposta, preencha os seguintes campos obrigatórios:\n\n– " +
          faltando.join("\n– ")
      );
      setMensagem({ tipo: "erro", texto: "Existem campos obrigatórios não preenchidos." });
      return;
    }

    if (etapas.length === 0) {
      setMensagem({ tipo: "erro", texto: "Adicione ao menos uma etapa ao cronograma." });
      return;
    }

    if (!etapasIguais(etapas, ETAPAS_PADRAO)) {
      const confirmou = window.confirm(
        "Você alterou o cronograma padrão (título, atividades, período de alguma etapa, e/ou " +
          "adicionou ou removeu etapas).\n\nDeseja confirmar essas alterações e seguir com a geração da proposta?"
      );
      if (!confirmou) {
        setMensagem({ tipo: "erro", texto: "Geração cancelada. Revise o cronograma antes de continuar." });
        return;
      }
    }

    const payload: PropostaFormData = {
      tipoEnte: orgao.tipo_ente,
      nomeEnte: orgao.razao_social,
      uf: orgao.uf,
      dataDia,
      dataMes,
      dataAno,
      tratamento,
      nomeDestinatario: contatoSelecionado!.nome_completo,
      cargoDestinatario: contatoSelecionado!.cargo,
      prazoMeses: Number(prazoMeses),
      honorarios: parseHonorarios(honorarios),
      parcelas: Number(parcelas),
      etapas,
    };

    setGerando(true);
    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const erro = await resp.json().catch(() => ({}));
        throw new Error(erro.error || "Falha ao gerar o documento.");
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Proposta - ${orgao.tipo_ente} de ${orgao.razao_social}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setMensagem({ tipo: "ok", texto: "Proposta gerada com sucesso. O download foi iniciado." });
    } catch (err: any) {
      setMensagem({ tipo: "erro", texto: err.message || "Erro inesperado ao gerar o documento." });
    } finally {
      setGerando(false);
    }
  }

  if (carregandoOrgao) {
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
          <p className="msg erro">{erroOrgao || "Órgão não encontrado."}</p>
          <Link href="/orgaos">← voltar aos órgãos</Link>
        </div>
      </main>
    );
  }

  return (
    <main>
      <header className="topo">
        <h1>Gerador de Propostas – Securitização</h1>
        <p>FIA – Fundação Instituto de Administração</p>
      </header>

      <div className="page">
        <p style={{ marginBottom: 20 }}>
          <Link href={`/orgaos/${orgao.id}`}>← voltar ao órgão</Link>
        </p>

        <section className="card">
          <h2>1. Ente contratante</h2>
          <p>
            <strong>Tipo:</strong> {orgao.tipo_ente}
            <br />
            <strong>Razão social:</strong> {orgao.razao_social}
            <br />
            <strong>UF:</strong> {orgao.uf}
          </p>
          <small>
            Dados vindos do cadastro do órgão. Para alterar, use{" "}
            <Link href={`/orgaos/${orgao.id}`}>editar cadastro</Link>.
          </small>
        </section>

        <section className="card">
          <h2>2. Data de emissão</h2>
          <div className="grid">
            <div className="field">
              <label>Dia *</label>
              <select value={dataDia} onChange={(e) => setDataDia(Number(e.target.value))}>
                {dias.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Mês *</label>
              <select value={dataMes} onChange={(e) => setDataMes(Number(e.target.value))}>
                {mesesOpts.map((m) => (
                  <option key={m.valor} value={m.valor}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Ano *</label>
              <select value={dataAno} onChange={(e) => setDataAno(Number(e.target.value))}>
                {anos.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>
          <small>
            Vem pré-preenchida com a data de hoje. Será exibida no documento como: {dataDia} de{" "}
            {MESES[dataMes - 1]} de {dataAno}
          </small>
        </section>

        <section className="card">
          <h2>3. Destinatário</h2>
          <div className="grid">
            <div className="field">
              <label>Tratamento *</label>
              <select value={tratamento} onChange={(e) => setTratamento(e.target.value as Tratamento)}>
                <option value="Senhor">Senhor</option>
                <option value="Senhora">Senhora</option>
              </select>
            </div>
            <div className="field">
              <label>Contato *</label>
              <select value={contatoSelecionadoId} onChange={(e) => setContatoSelecionadoId(e.target.value)}>
                <option value="">Selecione...</option>
                {orgao.contatos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome_completo} — {c.cargo}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {contatoSelecionado && (
            <p style={{ fontSize: 13, color: "#667085" }}>
              Destinatário: {contatoSelecionado.nome_completo} ({contatoSelecionado.cargo})
            </p>
          )}

          {!contatoForm ? (
            <button type="button" className="btn secondary" onClick={() => setContatoForm(novoContatoVazio())}>
              + Adicionar contato
            </button>
          ) : (
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
                {erroContato && <span className="msg erro">{erroContato}</span>}
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <h2>4. Prazo e honorários</h2>
          <div className="grid">
            <div className="field">
              <label>Prazo do contrato (meses) *</label>
              <select value={prazoMeses} onChange={(e) => setPrazoMeses(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Selecione...</option>
                {numeros36.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Honorários (R$) *</label>
              <input
                value={honorarios}
                onChange={(e) => setHonorarios(mascaraMoeda(e.target.value))}
                placeholder="0,00"
                inputMode="numeric"
              />
            </div>
            <div className="field">
              <label>Parcelas *</label>
              <select value={parcelas} onChange={(e) => setParcelas(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Selecione...</option>
                {numeros36.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="card">
          <h2>5. Cronograma (Etapas / Atividades / Período)</h2>
          <p style={{ fontSize: 13, color: "#667085", marginTop: -8 }}>
            Cada etapa é numerada automaticamente em algarismos romanos (Etapa I, II, III...) na ordem em que
            aparece abaixo. No campo &quot;Atividades&quot;, use <code>**texto**</code> para títulos de grupo em
            negrito e recue com espaços as sub-atividades numeradas. Qualquer alteração nesta seção (edição,
            inclusão ou exclusão de etapas) pedirá confirmação antes de gerar a proposta.
          </p>

          {etapas.map((etapa, idx) => (
            <div className="etapa-card" key={idx}>
              <button
                type="button"
                className="etapa-remove"
                onClick={() => removerEtapa(idx)}
                title="Remover etapa"
              >
                remover ✕
              </button>
              <span className="etapa-badge">Etapa {toRomanPreview(idx + 1)}</span>
              <div className="field">
                <label>Título da etapa</label>
                <input
                  value={etapa.titulo}
                  onChange={(e) => atualizarEtapa(idx, "titulo", e.target.value)}
                  placeholder="Ex.: Análise Legal e Normativa"
                />
              </div>
              <div className="field">
                <label>Atividades</label>
                <textarea
                  value={etapa.atividades}
                  onChange={(e) => atualizarEtapa(idx, "atividades", e.target.value)}
                  rows={8}
                />
              </div>
              <div className="field">
                <label>Período</label>
                <input
                  value={etapa.periodo}
                  onChange={(e) => atualizarEtapa(idx, "periodo", e.target.value)}
                  placeholder="Ex.: 1º mês"
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn secondary" onClick={() => moverEtapa(idx, -1)} disabled={idx === 0}>
                  mover para cima
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => moverEtapa(idx, 1)}
                  disabled={idx === etapas.length - 1}
                >
                  mover para baixo
                </button>
              </div>
            </div>
          ))}

          <button type="button" className="btn secondary" onClick={adicionarEtapa}>
            + adicionar etapa
          </button>
        </section>

        <div className="actions">
          <button className="btn" onClick={gerarDocumento} disabled={gerando}>
            {gerando ? "Gerando documento..." : "Gerar proposta (.docx)"}
          </button>
          {mensagem && <span className={`msg ${mensagem.tipo}`}>{mensagem.texto}</span>}
        </div>
      </div>
    </main>
  );
}

function toRomanPreview(num: number): string {
  const valores: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let n = num;
  let out = "";
  for (const [v, s] of valores) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}
