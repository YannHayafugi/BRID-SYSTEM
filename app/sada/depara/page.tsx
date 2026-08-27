"use client";

/**
 * SADA · DE/PARA — cada ente manda a planilha no layout do seu próprio
 * sistema. Aqui se declara a tradução: qual coluna da planilha alimenta qual
 * campo das tabelas sada_*, e qual valor de origem vira qual valor canônico.
 *
 * O arquivo enviado nesta tela NÃO é importado: serve só para ler o cabeçalho,
 * sugerir o mapa e mostrar o preview. A importação continua em /sada/atualizacao.
 */
import { useMemo, useRef, useState } from "react";
import { somenteDigitos } from "@/lib/mascaras";
import Link from "next/link";
import * as XLSX from "xlsx";
import { linhaVazia, ROTULO_TIPO, TIPOS_SADA, TipoSada } from "@/lib/sada/import";
import {
  AbaEscolhida, AbasModo, CAMPOS_DESTINO, CampoValor, chaveValor, compilarMapa,
  ehConstante, Mapa, RegraMapa, sugerirMapa, Transform, validarMapa, valoresDistintos,
} from "@/lib/sada/depara";

interface Planilha {
  nomesAbas: string[];
  /** aba usada para ler cabeçalho e amostra */
  abaLida: string;
  cabecalho: string[];
  amostra: unknown[][];
  /** todas as linhas de todas as abas — usado só na aba de Valores */
  todas: { nome: string; linhas: unknown[][] }[];
}

interface Par { valor_origem: string; valor_canonico: string }

const SEM_ORIGEM = "";
const CONSTANTE = "\u0000constante";

/** Transforms oferecidos por tipo de campo. Só aparece onde muda algo. */
const TRANSFORMS_INT: { valor: Transform | ""; rotulo: string }[] = [
  { valor: "", rotulo: "número da própria coluna" },
  { valor: "data_mes", rotulo: "mês extraído de uma data" },
  { valor: "data_ano", rotulo: "ano extraído de uma data" },
];

export default function DeParaPage() {
  const [cnpj, setCnpj] = useState("");
  const [tipo, setTipo] = useState<TipoSada>("divida_ativa");
  const [aba, setAba] = useState<"colunas" | "valores">("colunas");

  const [planilha, setPlanilha] = useState<Planilha | null>(null);
  const [mapa, setMapa] = useState<Mapa>({});
  const [abasModo, setAbasModo] = useState<AbasModo>("ano_no_nome");
  const [abasEscolhidas, setAbasEscolhidas] = useState<AbaEscolhida[]>([]);
  const [observacao, setObservacao] = useState("");
  const [ehPadrao, setEhPadrao] = useState(true);
  // Um ente pode ter mais de um mapa por tipo (ex.: trocou de sistema no meio
  // do ano). O nome identifica qual está sendo editado; vazio = o mais recente.
  const [nome, setNome] = useState("");
  const [nomesDisponiveis, setNomesDisponiveis] = useState<string[]>([]);

  const [campoValor, setCampoValor] = useState<CampoValor>("sigla");
  const [pares, setPares] = useState<Par[]>([]);

  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [ok, setOk] = useState("");
  const inputArquivo = useRef<HTMLInputElement>(null);

  const campos = CAMPOS_DESTINO[tipo];

  // -------------------------------------------------------------------
  // Carga do mapa salvo
  // -------------------------------------------------------------------
  async function carregar() {
    setErro(""); setOk(""); setAviso("");
    const cnpjChave = somenteDigitos(cnpj);
    if (!cnpjChave) { setErro("Informe o CNPJ do ente."); return; }
    setCarregando(true);
    try {
      const q = nome.trim() ? `&nome=${encodeURIComponent(nome.trim())}` : "";
      const r = await fetch(`/api/sada/depara?cnpj=${encodeURIComponent(cnpjChave)}&tipo=${tipo}${q}`);
      const j = await r.json();
      if (r.status === 401) { window.location.href = "/login"; return; }
      if (!r.ok) throw new Error(j.erro || "Falha ao carregar.");

      setMapa(j.depara.mapa ?? {});
      setAbasModo(j.depara.abas_modo ?? "ano_no_nome");
      setAbasEscolhidas(j.depara.abas ?? []);
      setObservacao(j.depara.observacao ?? "");
      setEhPadrao(!!j.padrao);
      setNomesDisponiveis(j.nomes ?? []);
      setNome(j.depara.nome ?? "");

      const rv = await fetch(`/api/sada/depara/valores?cnpj=${encodeURIComponent(cnpjChave)}&campo=${campoValor}`);
      const jv = await rv.json();
      if (rv.ok) setPares(jv.pares ?? []);

      if (j.padrao) {
        setAviso(
          "Este ente ainda não tem DE/PARA cadastrado. O que aparece abaixo é o " +
          "layout posicional padrão — é exatamente o que a importação usa hoje.",
        );
      }
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  // -------------------------------------------------------------------
  // Leitura da planilha de referência
  // -------------------------------------------------------------------
  async function lerArquivo(f: File) {
    setErro(""); setOk("");
    setCarregando(true);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const todas = wb.SheetNames.map((nome) => {
        const m = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, raw: false });
        return { nome, linhas: (m as unknown[][]).filter((r) => !linhaVazia(r)) };
      }).filter((a) => a.linhas.length > 0);

      if (todas.length === 0) throw new Error("A planilha não tem nenhuma aba com dados.");

      const primeira = todas[0];
      const cabecalho = (primeira.linhas[0] ?? []).map((c) => String(c ?? "").trim());
      const amostra = primeira.linhas.slice(1, 6);

      setPlanilha({
        nomesAbas: todas.map((a) => a.nome),
        abaLida: primeira.nome,
        cabecalho,
        amostra,
        todas,
      });

      // Só sugere quando não há mapa cadastrado — não sobrescreve trabalho salvo.
      if (ehPadrao) {
        const sug = sugerirMapa(tipo, cabecalho);
        setMapa(sug);
        const naoCasou = campos.filter((c) => !sug[c.campo]).map((c) => c.rotulo);
        setAviso(
          naoCasou.length === 0
            ? "Todas as colunas foram reconhecidas. Confira antes de salvar."
            : `Não reconheci: ${naoCasou.join(", ")}. Ajuste manualmente abaixo.`,
        );
      }

      // Abas cujo nome não é ano sugerem o modo "abas escolhidas".
      const todosAno = todas.every((a) => Number.isFinite(parseInt(a.nome, 10)));
      if (!todosAno && abasModo === "ano_no_nome") {
        setAbasModo("abas_escolhidas");
        setAbasEscolhidas(todas.map((a) => ({
          nome: a.nome,
          ano: Number.isFinite(parseInt(a.nome, 10)) ? parseInt(a.nome, 10) : new Date().getFullYear(),
        })));
      }
    } catch (e) {
      setErro((e as Error).message);
      setPlanilha(null);
    } finally {
      setCarregando(false);
    }
  }

  // -------------------------------------------------------------------
  // Edição do mapa
  // -------------------------------------------------------------------
  function definirOrigem(campo: string, valor: string) {
    setMapa((m) => {
      const novo = { ...m };
      if (valor === SEM_ORIGEM) delete novo[campo];
      else if (valor === CONSTANTE) novo[campo] = { constante: "" };
      else {
        const anterior = novo[campo];
        const transform = anterior && !ehConstante(anterior) ? anterior.transform : undefined;
        novo[campo] = transform ? { origem: valor, transform } : { origem: valor };
      }
      return novo;
    });
    setOk("");
  }

  function definirTransform(campo: string, t: string) {
    setMapa((m) => {
      const r = m[campo];
      if (!r || ehConstante(r)) return m;
      const novo = { ...m };
      novo[campo] = t ? { origem: r.origem, transform: t as Transform } : { origem: r.origem };
      return novo;
    });
    setOk("");
  }

  function definirConstante(campo: string, v: string) {
    setMapa((m) => ({ ...m, [campo]: { constante: v } }));
    setOk("");
  }

  function valorSelect(r: RegraMapa | undefined): string {
    if (!r) return SEM_ORIGEM;
    if (ehConstante(r)) return CONSTANTE;
    return typeof r.origem === "number"
      ? (planilha?.cabecalho[r.origem] ?? String(r.origem))
      : r.origem;
  }

  // -------------------------------------------------------------------
  // Preview + validação
  // -------------------------------------------------------------------
  const compilado = useMemo(() => {
    if (!planilha) return null;
    return compilarMapa(tipo, mapa, planilha.cabecalho);
  }, [planilha, mapa, tipo]);

  const validacao = useMemo(() => validarMapa(tipo, mapa), [tipo, mapa]);

  const preview = useMemo(() => {
    if (!planilha || !compilado) return [];
    return planilha.amostra.map((l) => compilado.aplicar(l));
  }, [planilha, compilado]);

  const camposMapeados = campos.filter((c) => mapa[c.campo]).length;

  // -------------------------------------------------------------------
  // Valores distintos (aba Valores)
  // -------------------------------------------------------------------
  function carregarValoresDaPlanilha() {
    if (!planilha) { setErro("Envie uma planilha de referência primeiro."); return; }
    const comp = compilarMapa(tipo, mapa, planilha.cabecalho);
    const registros: Record<string, unknown>[] = [];
    for (const a of planilha.todas) {
      for (const l of a.linhas.slice(1)) registros.push(comp.aplicar(l));
    }
    const distintos = valoresDistintos(registros, campoValor);
    setPares((atuais) => {
      const jaTem = new Set(atuais.map((p) => chaveValor(p.valor_origem)));
      const novos = distintos
        .filter((v) => !jaTem.has(chaveValor(v)))
        .map((v) => ({ valor_origem: v, valor_canonico: "" }));
      return [...atuais, ...novos];
    });
    setOk(`${distintos.length} valor(es) distinto(s) encontrado(s) em ${registros.length.toLocaleString("pt-BR")} linhas.`);
  }

  // -------------------------------------------------------------------
  // Gravação
  // -------------------------------------------------------------------
  async function salvarColunas() {
    setErro(""); setOk("");
    if (!somenteDigitos(cnpj)) { setErro("Informe o CNPJ do ente."); return; }
    if (!validacao.ok) { setErro(validacao.erros.join(" ")); return; }

    setSalvando(true);
    try {
      const r = await fetch("/api/sada/depara", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cnpj: somenteDigitos(cnpj), tipo, nome: nome.trim(), mapa, abasModo,
          abas: abasModo === "abas_escolhidas" ? abasEscolhidas : null,
          observacao: observacao.trim() || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || "Falha ao salvar.");
      setEhPadrao(false);
      setOk("DE/PARA de colunas salvo.");
      if (j.avisos?.length) setAviso(j.avisos.join(" "));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function salvarValores() {
    setErro(""); setOk("");
    if (!cnpj.trim()) { setErro("Informe o CNPJ do ente."); return; }
    setSalvando(true);
    try {
      const r = await fetch("/api/sada/depara/valores", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnpj: somenteDigitos(cnpj), campo: campoValor, pares }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || "Falha ao salvar.");
      setOk(`${j.gravados} tradução(ões) de valor gravada(s).`);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  // -------------------------------------------------------------------
  return (
    <main className="sada-wrap">
      <header className="sada-head">
        <div>
          <h1>DE/PARA</h1>
          <p className="sub">
            Traduz a planilha do ente para as colunas do SADA. Cada cliente manda
            o arquivo no layout do próprio sistema — aqui se declara a equivalência.
          </p>
        </div>
        <Link href="/sada" className="landing-cta secundario">← Dashboard</Link>
      </header>

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="depara-filtros">
          <div className="field">
            <label>CNPJ do ente</label>
            <input value={cnpj} onChange={(e) => { setCnpj(e.target.value); setOk(""); }}
              placeholder="Somente números" disabled={carregando || salvando} />
          </div>
          <div className="field">
            <label>Nome do mapa</label>
            <input value={nome} list="depara-nomes" disabled={carregando || salvando}
              onChange={(e) => { setNome(e.target.value); setOk(""); }}
              placeholder="Padrão" />
            <datalist id="depara-nomes">
              {nomesDisponiveis.map((n) => <option key={n} value={n} />)}
            </datalist>
          </div>
          <div className="field">
            <label>Tipo de planilha</label>
            <select value={tipo} disabled={carregando || salvando}
              onChange={(e) => { setTipo(e.target.value as TipoSada); setMapa({}); setPlanilha(null); setOk(""); }}>
              {TIPOS_SADA.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
            </select>
          </div>
          <button className="btn" onClick={carregar} disabled={carregando || salvando}>
            {carregando ? "Carregando…" : "Carregar"}
          </button>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>Planilha de referência (.xlsx)</label>
          <input ref={inputArquivo} type="file" accept=".xlsx" disabled={carregando || salvando}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) lerArquivo(f); }} />
          <small>
            Só para ler o cabeçalho e sugerir o mapa — <strong>este arquivo não é importado</strong>.
            A importação continua em <Link href="/sada/atualizacao">Atualização da Dívida</Link>.
          </small>
        </div>

        {ehPadrao && (
          <p className="detalhe" style={{ marginTop: 8 }}>
            Situação: <strong>sem cadastro</strong> — a importação usa o layout posicional padrão.
          </p>
        )}
        {erro && <p className="msg erro">{erro}</p>}
        {aviso && <p className="msg" style={{ opacity: 0.85 }}>{aviso}</p>}
        {ok && <p className="msg ok">✅ {ok}</p>}
      </section>

      <div className="depara-abas">
        <button className={aba === "colunas" ? "ativa" : ""} onClick={() => setAba("colunas")}>
          Colunas ({camposMapeados}/{campos.length})
        </button>
        <button className={aba === "valores" ? "ativa" : ""} onClick={() => setAba("valores")}>
          Valores ({pares.length})
        </button>
      </div>

      {aba === "colunas" && (
        <>
          <section className="card" style={{ marginBottom: 16 }}>
            <h2>Como as abas viram o ano</h2>
            <div className="field">
              <select value={abasModo} disabled={salvando}
                onChange={(e) => setAbasModo(e.target.value as AbasModo)}>
                <option value="ano_no_nome">O nome da aba é o ano (2015, 2016…)</option>
                <option value="abas_escolhidas">Escolher as abas e informar o ano de cada uma</option>
              </select>
            </div>

            {abasModo === "abas_escolhidas" && (
              <>
                {!planilha && <p className="vazio">Envie uma planilha para listar as abas.</p>}
                {planilha && (
                  <table className="sada-tabela">
                    <thead><tr><th>Aba do arquivo</th><th>Entra?</th><th>Ano</th></tr></thead>
                    <tbody>
                      {planilha.nomesAbas.map((nome) => {
                        const sel = abasEscolhidas.find((a) => a.nome === nome);
                        return (
                          <tr key={nome}>
                            <td>{nome}</td>
                            <td>
                              <input type="checkbox" checked={!!sel} disabled={salvando}
                                onChange={(e) => setAbasEscolhidas((lista) => e.target.checked
                                  ? [...lista, { nome, ano: new Date().getFullYear() }]
                                  : lista.filter((a) => a.nome !== nome))} />
                            </td>
                            <td>
                              <input type="number" value={sel?.ano ?? ""} disabled={!sel || salvando}
                                style={{ width: 90 }}
                                onChange={(e) => setAbasEscolhidas((lista) => lista.map((a) =>
                                  a.nome === nome ? { ...a, ano: parseInt(e.target.value, 10) } : a))} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </section>

          <section className="card" style={{ marginBottom: 16 }}>
            <h2>Colunas</h2>
            {!planilha && (
              <p className="detalhe">
                Sem planilha de referência você só consegue conferir o mapa salvo —
                envie o arquivo acima para escolher colunas pelo nome.
              </p>
            )}

            <table className="sada-tabela">
              <thead>
                <tr>
                  <th>Campo do SADA</th>
                  <th>Coluna da planilha</th>
                  <th>Conversão</th>
                </tr>
              </thead>
              <tbody>
                {campos.map((def) => {
                  const regra = mapa[def.campo];
                  const constante = regra && ehConstante(regra);
                  return (
                    <tr key={def.campo}>
                      <td>
                        {def.rotulo}
                        {def.obrigatorio && <span className="tag bloqueio" style={{ marginLeft: 6 }}>obrigatório</span>}
                        {def.recomendado && !regra && <span className="tag aviso" style={{ marginLeft: 6 }}>recomendado</span>}
                        <br /><small>{def.campo}</small>
                      </td>
                      <td>
                        <select value={valorSelect(regra)} disabled={salvando}
                          onChange={(e) => definirOrigem(def.campo, e.target.value)}>
                          <option value={SEM_ORIGEM}>— não mapear —</option>
                          {planilha?.cabecalho.map((c, i) => (
                            <option key={`${c}-${i}`} value={c}>{c || `(coluna ${i + 1})`}</option>
                          ))}
                          <option value={CONSTANTE}>valor fixo…</option>
                        </select>
                        {constante && (
                          <input style={{ marginTop: 4 }} placeholder="valor fixo" disabled={salvando}
                            value={String((regra as { constante: string | number | null }).constante ?? "")}
                            onChange={(e) => definirConstante(def.campo, e.target.value)} />
                        )}
                      </td>
                      <td>
                        {def.tipo === "int" && regra && !constante ? (
                          <select value={(regra as { transform?: Transform }).transform ?? ""}
                            disabled={salvando}
                            onChange={(e) => definirTransform(def.campo, e.target.value)}>
                            {TRANSFORMS_INT.map((t) => (
                              <option key={t.valor} value={t.valor}>{t.rotulo}</option>
                            ))}
                          </select>
                        ) : <span className="detalhe">{def.tipo}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {compilado && compilado.origensAusentes.length > 0 && (
              <p className="msg erro" style={{ marginTop: 8 }}>
                Não encontrei na planilha: {compilado.origensAusentes.join(", ")}
              </p>
            )}
            {validacao.erros.map((e) => <p key={e} className="msg erro">{e}</p>)}
            {validacao.avisos.map((a) => <p key={a} className="detalhe">⚠ {a}</p>)}

            <div className="actions">
              <button className="btn" onClick={salvarColunas} disabled={salvando || !validacao.ok}>
                {salvando ? "Salvando…" : "Salvar DE/PARA de colunas"}
              </button>
              {planilha && (
                <button className="btn secondary" disabled={salvando}
                  onClick={() => { setMapa(sugerirMapa(tipo, planilha.cabecalho)); setOk(""); }}>
                  Detectar novamente
                </button>
              )}
            </div>
          </section>

          {preview.length > 0 && (
            <section className="card">
              <h2>Preview — {preview.length} primeiras linhas traduzidas</h2>
              <p className="detalhe">
                Aba <strong>{planilha?.abaLida}</strong>. Confira se os valores caíram
                nas colunas certas antes de salvar.
              </p>
              <div style={{ overflowX: "auto" }}>
                <table className="sada-tabela">
                  <thead>
                    <tr>{campos.filter((c) => mapa[c.campo]).map((c) => <th key={c.campo}>{c.campo}</th>)}</tr>
                  </thead>
                  <tbody>
                    {preview.map((linha, i) => (
                      <tr key={i}>
                        {campos.filter((c) => mapa[c.campo]).map((c) => (
                          <td key={c.campo}>
                            {linha[c.campo] === null || linha[c.campo] === undefined
                              ? <span className="detalhe">null</span>
                              : String(linha[c.campo])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {aba === "valores" && (
        <section className="card">
          <h2>DE/PARA de valores</h2>
          <p className="detalhe">
            Normaliza o vocabulário do ente. Vale para o ente inteiro, não por tipo
            de planilha: a sigla precisa casar entre dívida ativa, lançamentos e
            recebimentos, senão o ranking conta o mesmo tributo duas vezes.
            Valor sem tradução passa direto.
          </p>

          <div className="depara-filtros" style={{ marginTop: 12 }}>
            <div className="field">
              <label>Campo</label>
              <select value={campoValor} disabled={salvando}
                onChange={(e) => { setCampoValor(e.target.value as CampoValor); setPares([]); }}>
                <option value="sigla">Sigla do tributo</option>
                <option value="fase">Fase / situação</option>
              </select>
            </div>
            <button className="btn secondary" onClick={carregarValoresDaPlanilha} disabled={salvando || !planilha}>
              Buscar valores na planilha
            </button>
            <button className="btn secondary" disabled={salvando}
              onClick={() => setPares((p) => [...p, { valor_origem: "", valor_canonico: "" }])}>
              + Linha
            </button>
          </div>

          {pares.length === 0 && (
            <p className="vazio">
              Nenhuma tradução. Envie a planilha e clique em “Buscar valores” para
              listar o que o ente realmente usa.
            </p>
          )}

          {pares.length > 0 && (
            <table className="sada-tabela">
              <thead><tr><th>Valor na planilha (DE)</th><th>Valor canônico (PARA)</th><th /></tr></thead>
              <tbody>
                {pares.map((p, i) => (
                  <tr key={i}>
                    <td>
                      <input value={p.valor_origem} disabled={salvando}
                        onChange={(e) => setPares((l) => l.map((x, j) =>
                          j === i ? { ...x, valor_origem: e.target.value } : x))} />
                    </td>
                    <td>
                      <input value={p.valor_canonico} disabled={salvando} placeholder="deixe vazio para não traduzir"
                        onChange={(e) => setPares((l) => l.map((x, j) =>
                          j === i ? { ...x, valor_canonico: e.target.value } : x))} />
                    </td>
                    <td>
                      <button className="btn secondary" disabled={salvando}
                        onClick={() => setPares((l) => l.filter((_, j) => j !== i))}>remover</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="actions">
            <button className="btn" onClick={salvarValores} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar traduções de valor"}
            </button>
          </div>
        </section>
      )}

      <section className="card" style={{ marginTop: 16 }}>
        <div className="field">
          <label>Observação (opcional)</label>
          <input value={observacao} onChange={(e) => setObservacao(e.target.value)}
            placeholder="ex.: layout do sistema X, exportação de janeiro/2026" disabled={salvando} />
        </div>
      </section>
    </main>
  );
}
