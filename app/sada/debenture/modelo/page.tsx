"use client";

/** SADA · Debênture — montagem do documento.
 *
 * Escolhe quais tópicos compõem o InfoPack daquele ente, em que ordem, e
 * guarda a escolha como modelo reutilizável.
 *
 * Duas decisões que a tela toma por conta própria:
 *
 *   As DIVISÓRIAS de seção não são selecionáveis — aparecem sozinhas quando a
 *   seção tem algum tópico. Deixá-las na lista permitiria montar a capa de uma
 *   seção vazia.
 *
 *   A ORDEM DAS SEÇÕES é fixa; reordenar só acontece dentro da seção. Um
 *   documento com o disclaimer no meio não seria um documento.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ComoUsar, Dica } from "@/app/components/Ajuda";
import { AbasDebenture } from "../Abas";
import {
  ROTULO_FONTE,
  SECOES,
  SELECAO_PADRAO,
  TOPICOS,
  TOPICO_POR_SLUG,
  contarPaginas,
  montarSumario,
  normalizarSelecao,
  topicosSemDado,
  type ModeloDocumento,
  type Topico,
} from "@/lib/sada/debenture";

interface Cliente {
  id: string;
  razaoSocial: string;
  uf: string;
  cnpjs: { id: number; cnpj: string; apelido: string | null }[];
}

interface Exigencia {
  cnpjOrgao: string;
  codigo: string;
  pronto: boolean;
  detalhe: string;
}

export default function MontagemPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cliente, setCliente] = useState("");

  const [selecao, setSelecao] = useState<string[]>(SELECAO_PADRAO);
  const [modelos, setModelos] = useState<ModeloDocumento[]>([]);
  const [modeloAberto, setModeloAberto] = useState<number | null>(null);
  const [nome, setNome] = useState("");
  const [padrao, setPadrao] = useState(false);

  const [prontos, setProntos] = useState<Set<string>>(new Set());
  const [avisoMigracao, setAvisoMigracao] = useState("");
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch("/api/sada/clientes")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setClientes(j.clientes ?? []))
      .catch(() => {});
  }, []);

  const cnpjDoCliente = useMemo(() => {
    const c = clientes.find((x) => x.id === cliente);
    // Modelo é por ente. Com cliente de vários CNPJs, o primeiro é o
    // principal — e a tela diz isso em vez de escolher calada.
    return c?.cnpjs[0]?.cnpj ?? null;
  }, [clientes, cliente]);

  const carregar = useCallback(
    async (sinal?: AbortSignal) => {
      const q = cliente ? `?cliente=${encodeURIComponent(cliente)}` : "";
      const [rModelos, rDados] = await Promise.all([
        fetch(`/api/sada/deb/modelo${q}`, { signal: sinal, cache: "no-store" }),
        fetch(`/api/sada/deb/dados${q}`, { signal: sinal, cache: "no-store" }),
      ]);
      if (rModelos.status === 401 || rDados.status === 401) {
        window.location.href = "/login";
        return;
      }
      const jModelos = await rModelos.json();
      if (!rModelos.ok) throw new Error(jModelos.erro || "Falha ao carregar modelos.");
      setModelos(jModelos.modelos ?? []);
      setAvisoMigracao(jModelos.avisoMigracao ?? "");

      // A ficha de dados pode falhar por conta própria (a migração da onda 1
      // também pode não estar aplicada). Isso não impede montar o documento:
      // só perde o aviso de tópico sem dado.
      if (rDados.ok) {
        const jDados = await rDados.json();
        const exigencias: Exigencia[] = jDados.prontidao ?? [];
        const porCodigo = new Map<string, boolean>();
        for (const e of exigencias) {
          porCodigo.set(e.codigo, (porCodigo.get(e.codigo) ?? true) && e.pronto);
        }
        setProntos(new Set([...porCodigo].filter(([, v]) => v).map(([k]) => k)));
      } else {
        setProntos(new Set());
      }

      // Modelo padrão do ente abre selecionado — é o que se quer na maior
      // parte das vezes, e evita remontar tudo a cada documento.
      const preferido: ModeloDocumento | undefined =
        (jModelos.modelos ?? []).find((m: ModeloDocumento) => m.padrao) ?? undefined;
      if (preferido) {
        setSelecao(preferido.topicos);
        setModeloAberto(preferido.id);
        setNome(preferido.nome);
        setPadrao(true);
      } else {
        setSelecao(SELECAO_PADRAO);
        setModeloAberto(null);
        setNome("");
        setPadrao(false);
      }
    },
    [cliente],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    setErro("");
    setOk("");
    carregar(ctrl.signal).catch((e) => {
      if ((e as Error).name !== "AbortError") setErro((e as Error).message);
    });
    return () => ctrl.abort();
  }, [carregar]);

  const escolhidos = useMemo(() => new Set(selecao), [selecao]);

  function alternar(t: Topico) {
    if (t.obrigatorio) return;
    setOk("");
    setSelecao((atual) =>
      normalizarSelecao(
        escolhidos.has(t.slug) ? atual.filter((s) => s !== t.slug) : [...atual, t.slug],
      ),
    );
  }

  /** Move o tópico uma posição dentro da própria seção. */
  function mover(slug: string, direcao: -1 | 1) {
    setOk("");
    setSelecao((atual) => {
      const t = TOPICO_POR_SLUG.get(slug);
      if (!t) return atual;
      // Os índices são os da seleção inteira, mas a troca só considera
      // vizinhos DA MESMA SEÇÃO — senão subir o primeiro item de uma seção o
      // jogaria para dentro da anterior.
      const naSecao = atual.filter((s) => TOPICO_POR_SLUG.get(s)?.secao === t.secao);
      const pos = naSecao.indexOf(slug);
      const destino = pos + direcao;
      if (pos < 0 || destino < 0 || destino >= naSecao.length) return atual;
      const trocado = [...naSecao];
      [trocado[pos], trocado[destino]] = [trocado[destino], trocado[pos]];
      let i = 0;
      return atual.map((s) =>
        TOPICO_POR_SLUG.get(s)?.secao === t.secao ? trocado[i++] : s,
      );
    });
  }

  function abrirModelo(id: number) {
    const m = modelos.find((x) => x.id === id);
    setOk("");
    if (!m) {
      setSelecao(SELECAO_PADRAO);
      setModeloAberto(null);
      setNome("");
      setPadrao(false);
      return;
    }
    setSelecao(m.topicos);
    setModeloAberto(m.id);
    setNome(m.nome);
    setPadrao(m.padrao);
  }

  async function salvar() {
    setSalvando(true);
    setErro("");
    setOk("");
    try {
      const r = await fetch("/api/sada/deb/modelo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: modeloAberto ?? undefined,
          nome,
          topicos: selecao,
          cnpjOrgao: cnpjDoCliente ?? undefined,
          padrao,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || "Falha ao salvar.");
      setOk(`Modelo “${j.modelo.nome}” salvo.`);
      await carregar();
      setModeloAberto(j.modelo.id);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!modeloAberto) return;
    setSalvando(true);
    setErro("");
    setOk("");
    try {
      const r = await fetch(`/api/sada/deb/modelo?id=${modeloAberto}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || "Falha ao excluir.");
      setOk("Modelo excluído.");
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const sumario = montarSumario(selecao);
  const paginas = contarPaginas(selecao);
  const semDado = topicosSemDado(selecao, prontos);
  const podeSalvar = !!nome.trim() && selecao.length > 0 && !salvando && !avisoMigracao;

  return (
    <main className="sada-wrap">
      <header className="sada-head">
        <div>
          <h1>Debênture — montagem</h1>
          <p className="sub">
            Escolha os tópicos que compõem o documento, a ordem dentro de cada
            seção, e guarde como modelo para reaproveitar na próxima operação.
          </p>
        </div>
        <Link href="/sada" className="landing-cta secundario">← Dashboard</Link>
      </header>

      <AbasDebenture ativa="/sada/debenture/modelo" />

      <ComoUsar chave="deb-montagem-v1" titulo="Como usar esta aba">
        <p>
          Cada tópico é uma ou mais páginas do documento. Desmarque o que não se
          aplica à operação; a <strong>capa</strong> e o <strong>disclaimer</strong> não
          saem — um material de investidor sem identificação ou sem aviso legal não
          deveria circular.
        </p>
        <p>
          As <strong>divisórias de seção</strong> não aparecem na lista: elas entram
          sozinhas quando a seção tem algum tópico, e somem junto com ela. As setas
          reordenam <em>dentro</em> da seção — a ordem das seções é fixa.
        </p>
        <p>
          Tópico marcado com <strong>sem dado</strong> depende de arquivo que o ente
          ainda não mandou. Pode ficar selecionado, mas sairá vazio: confira a aba{" "}
          <strong>Ficha de dados</strong> antes de gerar.
        </p>
      </ComoUsar>

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="field">
          <label>Cliente</label>
          <select value={cliente} onChange={(e) => setCliente(e.target.value)}>
            <option value="">Todos os entes</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.razaoSocial}{c.uf ? " — " + c.uf : ""} ({c.cnpjs.length} CNPJ)
              </option>
            ))}
          </select>
          <small>
            {cliente
              ? cnpjDoCliente
                ? `O modelo será salvo para o CNPJ ${cnpjDoCliente}.`
                : "Este cliente não tem CNPJ vinculado — só dá para salvar modelo global."
              : "Sem cliente selecionado, o modelo vale para todos os entes (só superadmin)."}
          </small>
        </div>
      </section>

      {avisoMigracao && <p className="deb-aviso">{avisoMigracao}</p>}
      {erro && <p className="erro-texto">{erro}</p>}
      {ok && <p className="deb-ok">{ok}</p>}

      <div className="deb-montagem">
        {/* ---------------- tópicos ---------------- */}
        <section className="card">
          <h2 style={{ marginTop: 0 }}>
            Tópicos{" "}
            <Dica texto="As páginas indicadas são as do documento-modelo de dezembro de 2025, para conferência lado a lado." />
          </h2>

          {SECOES.map((secao) => {
            const daSecao = TOPICOS.filter((t) => t.secao === secao.id);
            if (daSecao.length === 0) return null;
            // Dentro da seção, a ordem exibida é a da seleção; os não
            // selecionados vão para o fim, na ordem do catálogo.
            const ordenados = [
              ...selecao
                .filter((s) => TOPICO_POR_SLUG.get(s)?.secao === secao.id)
                .map((s) => TOPICO_POR_SLUG.get(s)!),
              ...daSecao.filter((t) => !escolhidos.has(t.slug)),
            ];
            const marcados = daSecao.filter((t) => escolhidos.has(t.slug)).length;
            return (
              <div key={secao.id} className="deb-secao">
                <h3>
                  {secao.titulo}
                  <small>{marcados} de {daSecao.length}</small>
                </h3>
                <ul>
                  {ordenados.map((t, i) => {
                    const marcado = escolhidos.has(t.slug);
                    const falta = marcado && t.exige?.some((e) => !prontos.has(e));
                    const selecionadosDaSecao = selecao.filter(
                      (s) => TOPICO_POR_SLUG.get(s)?.secao === secao.id,
                    );
                    return (
                      <li key={t.slug} className={marcado ? "marcado" : undefined}>
                        <label>
                          <input
                            type="checkbox"
                            checked={marcado}
                            disabled={t.obrigatorio}
                            onChange={() => alternar(t)}
                          />
                          <span className="deb-topico-titulo">
                            {t.titulo}
                            {t.obrigatorio && <em className="deb-tag">sempre entra</em>}
                            {falta && <em className="deb-tag alerta">sem dado</em>}
                          </span>
                        </label>
                        <p className="deb-topico-desc">{t.descricao}</p>
                        <div className="deb-topico-pe">
                          <small>
                            {ROTULO_FONTE[t.fonte]} ·{" "}
                            {t.paginas.length === 1
                              ? `página ${t.paginas[0]}`
                              : `páginas ${t.paginas.join(" e ")}`}{" "}
                            do modelo
                          </small>
                          {marcado && selecionadosDaSecao.length > 1 && (
                            <span className="deb-setas">
                              <button
                                className="btn secondary"
                                aria-label={`Subir ${t.titulo}`}
                                disabled={i === 0}
                                onClick={() => mover(t.slug, -1)}
                              >
                                ↑
                              </button>
                              <button
                                className="btn secondary"
                                aria-label={`Descer ${t.titulo}`}
                                disabled={i >= selecionadosDaSecao.length - 1}
                                onClick={() => mover(t.slug, 1)}
                              >
                                ↓
                              </button>
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>

        {/* ---------------- sumário e modelo ---------------- */}
        <aside>
          <section className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0 }}>Sumário</h2>
            <p className="deb-contagem">
              <strong>{selecao.length}</strong> de {TOPICOS.length} tópicos ·{" "}
              <strong>{paginas}</strong> páginas estimadas
            </p>
            <ol className="deb-sumario">
              {sumario.map((i, n) => (
                <li key={`${i.tipo}-${i.slug ?? i.secao}-${n}`}
                    className={i.tipo === "divisoria" ? "divisoria" : undefined}>
                  {i.titulo}
                </li>
              ))}
            </ol>
            {semDado.length > 0 && (
              <p className="deb-aviso">
                {semDado.length === 1
                  ? "1 tópico selecionado sairia vazio"
                  : `${semDado.length} tópicos selecionados sairiam vazios`}{" "}
                por falta de dado importado:{" "}
                {semDado.map((t) => t.titulo).join(", ")}.{" "}
                <Link href="/sada/debenture">Ver o que falta pedir ao ente →</Link>
              </p>
            )}
          </section>

          <section className="card">
            <h2 style={{ marginTop: 0 }}>Modelo</h2>
            <div className="field">
              <label>Abrir modelo salvo</label>
              <select
                value={modeloAberto ?? ""}
                onChange={(e) => abrirModelo(Number(e.target.value))}
              >
                <option value="">Seleção nova (todos os tópicos)</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                    {m.cnpjOrgao ? "" : " (todos os entes)"}
                    {m.padrao ? " · padrão" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Nome</label>
              <input
                value={nome}
                maxLength={80}
                placeholder="Ex.: Emissão padrão municipal"
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
            <label className="deb-check" style={{ margin: "8px 0 12px" }}>
              <input type="checkbox" checked={padrao} onChange={(e) => setPadrao(e.target.checked)} />
              Abrir este modelo por padrão neste ente
            </label>
            <div className="depara-filtros">
              <button className="btn" disabled={!podeSalvar} onClick={salvar}>
                {salvando ? "Salvando…" : modeloAberto ? "Salvar alterações" : "Salvar modelo"}
              </button>
              {modeloAberto !== null && (
                <button className="btn secondary" disabled={salvando} onClick={excluir}>
                  Excluir
                </button>
              )}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
