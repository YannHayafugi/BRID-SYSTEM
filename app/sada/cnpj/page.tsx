"use client";

/** SADA · Consulta de CNPJ.
 *
 * Um documento pode aparecer em dois papéis, e a tela mostra os dois:
 * como ENTE (cliente vinculado, importações, DE/PARA, envios, qualidade) e
 * como CONTRIBUINTE (dívida ativa em nome dele, em qualquer ente).
 *
 * A situação cadastral vem da Receita pela BrasilAPI, servida de cache. Só
 * existe para CNPJ: CPF não tem consulta pública, e a tela diz isso em vez de
 * mostrar "não encontrado", que sugeriria irregularidade.
 */
import { useState } from "react";
import Link from "next/link";
import { somenteDigitos, mascaraCnpj } from "@/lib/mascaras";
import StatusDaBase from "./StatusDaBase";

interface Receita {
  razao_social: string | null; nome_fantasia: string | null;
  situacao: string | null; situacao_data: string | null; situacao_motivo: string | null;
  matriz_filial: string | null; uf: string | null; municipio: string | null;
  cnae_codigo: string | null; cnae_descricao: string | null;
  natureza_juridica: string | null; porte: string | null;
  inicio_atividade: string | null; capital_social: number | null;
}
interface Interno {
  documento: string;
  tipoDocumento: "CNPJ" | "CPF";
  comoEnte: {
    cliente: { id: string; razaoSocial: string; cidade: string; uf: string } | null;
    vinculoExplicito: boolean;
    apelido: string | null;
    lotes: { id: number; tipo: string; vigente: boolean; arquivo_nome: string | null;
             linhas_importadas: number | null; ano_inicio: number | null; ano_fim: number | null;
             created_at: string }[];
    mapas: { tipo: string; nome: string; abas_modo: string; updated_at: string }[];
    envios: { id: number; arquivo_nome: string; enviado_em: string; indice_completude: number | null }[];
    qualidade: { comProblema: number; totalOcorrencias: number;
                 checks: { codigo: string; problema: string; qtd: number; base: number }[] };
  };
  comoContribuinte: { cnpjOrgao: string; ente: string | null; dividaTotal: number; qtdTitulos: number }[];
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (v: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");

/** Verde só para ATIVA: qualquer outra situação muda a leitura de recuperabilidade. */
function corSituacao(s: string | null): string {
  if (!s) return "inherit";
  return s.toUpperCase() === "ATIVA" ? "var(--ok, #2e7d32)" : "var(--alerta, #c62828)";
}

export default function ConsultaCnpjPage() {
  // Duas atividades diferentes no mesmo assunto: olhar UM documento a fundo,
  // ou enriquecer em massa os que já estão na base.
  const [aba, setAba] = useState<"individual" | "base">("individual");
  const [doc, setDoc] = useState("");
  const [receita, setReceita] = useState<Receita | null>(null);
  const [semConsulta, setSemConsulta] = useState<string | null>(null);
  const [idadeCache, setIdadeCache] = useState<number | null>(null);
  const [avisoOrigem, setAvisoOrigem] = useState("");
  const [interno, setInterno] = useState<Interno | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroReceita, setErroReceita] = useState("");

  async function consultar(forcar = false) {
    const d = somenteDigitos(doc);
    if (d.length !== 11 && d.length !== 14) {
      setErro("Informe um CPF (11 dígitos) ou CNPJ (14).");
      return;
    }
    setCarregando(true);
    setErro(""); setErroReceita(""); setAvisoOrigem("");
    setReceita(null); setSemConsulta(null); setInterno(null);

    // As duas consultas são independentes: a interna não pode ficar refém da
    // disponibilidade da Receita, que é serviço de terceiro.
    const [rI, rR] = await Promise.allSettled([
      fetch(`/api/cnpj/interno?cnpj=${d}`).then(async (r) => ({ ok: r.ok, j: await r.json() })),
      fetch(`/api/cnpj/receita?cnpj=${d}${forcar ? "&forcar=1" : ""}`).then(async (r) => ({ ok: r.ok, j: await r.json() })),
    ]);

    if (rI.status === "fulfilled") {
      if (rI.value.ok) setInterno(rI.value.j);
      else setErro(rI.value.j.erro || "Falha ao consultar o sistema.");
    } else setErro("Falha ao consultar o sistema.");

    if (rR.status === "fulfilled") {
      const { ok, j } = rR.value;
      if (!ok) setErroReceita(j.erro || "Falha na consulta à Receita.");
      else if (j.semConsulta) setSemConsulta(j.motivo);
      else {
        setReceita(j.dados);
        setIdadeCache(j.doCache ? j.idadeDias : 0);
        if (j.avisoOrigem) setAvisoOrigem(j.avisoOrigem);
      }
    } else setErroReceita("Falha na consulta à Receita.");

    setCarregando(false);
  }

  const ente = interno?.comoEnte;
  const temEnte = !!ente && (ente.lotes.length > 0 || ente.mapas.length > 0 ||
                             ente.envios.length > 0 || !!ente.cliente);

  return (
    <main className="sada-wrap">
      <header className="sada-head">
        <div>
          <h1>Consulta de CNPJ</h1>
          <p className="sub">
            Situação cadastral na Receita e o que o sistema sabe sobre o documento,
            como ente e como contribuinte.
          </p>
        </div>
        <Link href="/sada" className="landing-cta secundario">← Dashboard</Link>
      </header>

      <div className="depara-abas">
        <button className={aba === "individual" ? "ativa" : ""}
                onClick={() => setAba("individual")}>Consulta individual</button>
        <button className={aba === "base" ? "ativa" : ""}
                onClick={() => setAba("base")}>Status da base</button>
      </div>

      {aba === "base" && <StatusDaBase />}

      {aba === "individual" && (
       <>

      <section className="card" style={{ marginBottom: 16, maxWidth: 520 }}>
        <div className="field">
          <label>CNPJ ou CPF</label>
          <input value={doc} disabled={carregando}
                 onChange={(e) => setDoc(mascaraCnpj(e.target.value))}
                 onKeyDown={(e) => { if (e.key === "Enter") void consultar(); }}
                 placeholder="00.000.000/0000-00" />
        </div>
        <button className="btn" onClick={() => void consultar()} disabled={carregando}>
          {carregando ? "Consultando…" : "Consultar"}
        </button>
      </section>

      {erro && <p className="erro-texto">{erro}</p>}

      {(receita || semConsulta || erroReceita) && (
        <section className="card" style={{ marginBottom: 16 }}>
          <h2>Situação cadastral</h2>
          {semConsulta && <p className="vazio">{semConsulta}</p>}
          {erroReceita && <p className="erro-texto">{erroReceita}</p>}
          {receita && (
            <>
              <div className="dash-kpis" style={{ marginBottom: 12 }}>
                <div className="kpi">
                  <span className="kpi-valor" style={{ color: corSituacao(receita.situacao) }}>
                    {receita.situacao ?? "—"}
                  </span>
                  <span className="kpi-nome">Situação</span>
                  <span className="kpi-desc">
                    desde {data(receita.situacao_data)}
                    {receita.situacao_motivo && receita.situacao_motivo !== "SEM MOTIVO"
                      ? ` · ${receita.situacao_motivo}` : ""}
                  </span>
                </div>
                <div className="kpi">
                  <span className="kpi-valor">{receita.matriz_filial ?? "—"}</span>
                  <span className="kpi-nome">Estabelecimento</span>
                  <span className="kpi-desc">aberto em {data(receita.inicio_atividade)}</span>
                </div>
              </div>
              <table className="sada-tabela">
                <tbody>
                  <tr><th>Razão social</th><td>{receita.razao_social ?? "—"}</td></tr>
                  <tr><th>Nome fantasia</th><td>{receita.nome_fantasia ?? "—"}</td></tr>
                  <tr><th>Município / UF</th><td>{receita.municipio ?? "—"} / {receita.uf ?? "—"}</td></tr>
                  <tr><th>Atividade principal</th><td>{receita.cnae_codigo ?? "—"} — {receita.cnae_descricao ?? "—"}</td></tr>
                  <tr><th>Natureza jurídica</th><td>{receita.natureza_juridica ?? "—"}</td></tr>
                  <tr><th>Porte</th><td>{receita.porte ?? "—"}</td></tr>
                  <tr><th>Capital social</th><td>{receita.capital_social != null ? brl(receita.capital_social) : "—"}</td></tr>
                </tbody>
              </table>
              <p className="sub" style={{ marginTop: 8 }}>
                {idadeCache === 0 ? "Consultado agora na Receita." : `Do cache, ${idadeCache} dia(s) atrás.`}
                {avisoOrigem ? ` A origem falhou nesta tentativa: ${avisoOrigem}` : ""}
                {" "}
                <button className="btn secondary" disabled={carregando}
                        onClick={() => void consultar(true)}>Atualizar da Receita</button>
              </p>
            </>
          )}
        </section>
      )}

      {interno && (
        <>
          <section className="card" style={{ marginBottom: 16 }}>
            <h2>Como ente</h2>
            {!temEnte ? (
              <p className="vazio">
                Este documento não é um ente conhecido: sem cliente vinculado, sem
                importações e sem DE/PARA cadastrado.
              </p>
            ) : (
              <>
                <table className="sada-tabela" style={{ marginBottom: 12 }}>
                  <tbody>
                    <tr>
                      <th>Cliente</th>
                      <td>
                        {ente!.cliente
                          ? `${ente!.cliente.razaoSocial}${ente!.cliente.uf ? " — " + ente!.cliente.uf : ""}`
                          : "não vinculado"}
                        {ente!.cliente && !ente!.vinculoExplicito
                          ? " (casado pelo CNPJ do cadastro, sem vínculo explícito)" : ""}
                        {ente!.apelido ? ` · ${ente!.apelido}` : ""}
                      </td>
                    </tr>
                    <tr>
                      <th>Qualidade da base</th>
                      <td>
                        {ente!.qualidade.comProblema === 0
                          ? "sem pendências"
                          : `${ente!.qualidade.totalOcorrencias.toLocaleString("pt-BR")} ocorrências em ${ente!.qualidade.comProblema} verificações`}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <h3>Importações</h3>
                {ente!.lotes.length === 0 ? <p className="vazio">Nenhuma.</p> : (
                  <table className="sada-tabela">
                    <thead><tr><th>Tipo</th><th>Vigente</th><th>Linhas</th><th>Anos</th><th>Quando</th></tr></thead>
                    <tbody>
                      {ente!.lotes.map((l) => (
                        <tr key={l.id} style={l.vigente ? undefined : { opacity: 0.55 }}>
                          <td>{l.tipo}</td>
                          <td>{l.vigente ? "sim" : "histórico"}</td>
                          <td>{(l.linhas_importadas ?? 0).toLocaleString("pt-BR")}</td>
                          <td>{l.ano_inicio && l.ano_fim ? `${l.ano_inicio}–${l.ano_fim}` : "—"}</td>
                          <td>{data(l.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <h3 style={{ marginTop: 12 }}>DE/PARA cadastrado</h3>
                {ente!.mapas.length === 0 ? (
                  <p className="vazio">Nenhum — a importação usaria o layout posicional padrão.</p>
                ) : (
                  <ul>
                    {ente!.mapas.map((m) => (
                      <li key={m.tipo + m.nome}>
                        <strong>{m.tipo}</strong> · {m.nome} ({m.abas_modo}) — atualizado em {data(m.updated_at)}
                      </li>
                    ))}
                  </ul>
                )}

                <h3 style={{ marginTop: 12 }}>Envios do INFO REQUEST LIST</h3>
                {ente!.envios.length === 0 ? <p className="vazio">Nenhum registrado.</p> : (
                  <table className="sada-tabela">
                    <thead><tr><th>Arquivo</th><th>Quando</th><th>Completude</th></tr></thead>
                    <tbody>
                      {ente!.envios.map((e) => (
                        <tr key={e.id}>
                          <td>{e.arquivo_nome}</td>
                          <td>{data(e.enviado_em)}</td>
                          <td>{e.indice_completude != null ? `${e.indice_completude}%` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </section>

          <section className="card">
            <h2>Como contribuinte</h2>
            {interno.comoContribuinte.length === 0 ? (
              <p className="vazio">Sem dívida ativa registrada em nome deste documento.</p>
            ) : (
              <table className="sada-tabela">
                <thead><tr><th>Ente credor</th><th>Títulos</th><th>Dívida (principal)</th></tr></thead>
                <tbody>
                  {interno.comoContribuinte.map((c) => (
                    <tr key={c.cnpjOrgao}>
                      <td>{c.ente ?? c.cnpjOrgao}</td>
                      <td>{c.qtdTitulos.toLocaleString("pt-BR")}</td>
                      <td>{brl(c.dividaTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
       </>
      )}
    </main>
  );
}
