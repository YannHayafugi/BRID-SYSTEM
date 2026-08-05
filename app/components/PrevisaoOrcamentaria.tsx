"use client";

/**
 * SADA · Previsão orçamentária da dívida ativa — 10 exercícios.
 *
 * A API entrega a base calibrada; a projeção roda aqui, então mexer num
 * parâmetro responde na hora. Fórmulas e limites em
 * docs/SADA-PREVISAO-ORCAMENTARIA.md — vale ler antes de interpretar o número.
 */
import { useEffect, useMemo, useState } from "react";
import {
  AnoProjetado, BasePrevisao, PARAMETROS_PADRAO, Parametros, cenarios,
} from "@/lib/sada/previsao";

interface Calibracao {
  crescimentoInscricoesCagr: number;
  crescimentoInscricoesLogLinear: number;
  crescimentoLancadoLogLinear: number;
  encargosAA: number;
  idadeFoto: number;
  ciclo: number;
  recuperadoAcum: number;
  abertoComEncargos: number;
  quebra: {
    detectada: boolean;
    ano: number | null;
    razaoAtual: number | null;
    mediaAnterior: number;
    salto: number;
  };
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const mi = (v: number) => (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** Campo percentual: guarda decimal, mostra em %. */
function CampoPct({
  rotulo, valor, onChange, ajuda, passo = 0.5, min = 0, max = 100,
}: {
  rotulo: string; valor: number; onChange: (v: number) => void;
  ajuda?: string; passo?: number; min?: number; max?: number;
}) {
  return (
    <div className="field">
      <label>{rotulo}</label>
      <input type="number" step={passo} min={min} max={max}
        value={Number((valor * 100).toFixed(2))}
        onChange={(e) => onChange((parseFloat(e.target.value) || 0) / 100)} />
      {ajuda && <small>{ajuda}</small>}
    </div>
  );
}

export default function PrevisaoOrcamentaria() {
  const [base, setBase] = useState<BasePrevisao | null>(null);
  const [calib, setCalib] = useState<Calibracao | null>(null);
  const [p, setP] = useState<Parametros>(PARAMETROS_PADRAO);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [verParametros, setVerParametros] = useState(false);

  useEffect(() => {
    fetch("/api/sada/previsao")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro || "Falha ao carregar a previsão.");
        setBase(j.base);
        setCalib(j.calibracao);
        // Parte do padrão vem da própria base: a tendência medida no ente é um
        // ponto de partida melhor que a constante do código.
        setP((atual) => ({
          ...atual,
          crescimento: j.calibracao.crescimentoInscricoesLogLinear || atual.crescimento,
        }));
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);

  const proj = useMemo(
    () => (base ? cenarios(base, p) : null),
    [base, p],
  );

  if (carregando) return <section className="card"><p className="vazio">Calculando projeção…</p></section>;
  if (erro) return <section className="card"><p className="erro-texto">{erro}</p></section>;
  if (!base || !calib || !proj) return null;

  const linhas: AnoProjetado[] = proj.base;
  const ultimo = linhas[linhas.length - 1];
  const totalRecuperado = linhas.reduce((s, a) => s + a.recuperacao, 0);
  const totalRecuperadoReal = linhas.reduce((s, a) => s + a.recuperacaoReal, 0);
  const maxEstoque = Math.max(...proj.otimista.map((a) => a.estoqueFinal));

  return (
    <section className="card sada-col-2">
      <h2>Previsão orçamentária — {linhas[0].ano} a {ultimo.ano}</h2>
      <p className="detalhe">
        Equação de balanço por safra: estoque + inscrições + encargos − recuperação
        − prescrição. Calibrada em {base.safras.length} exercícios.{" "}
        <strong>É cenário condicionado às hipóteses abaixo, não previsão.</strong>
      </p>

      {calib.quebra.detectada && (
        <div className="qualidade-relatorio aviso" style={{ marginTop: 12 }}>
          <strong>Quebra estrutural detectada em {calib.quebra.ano}</strong>
          <p className="detalhe">
            A razão títulos por contribuinte saltou de {calib.quebra.mediaAnterior.toFixed(2)} (média
            dos exercícios anteriores) para {calib.quebra.razaoAtual?.toFixed(2)} — {calib.quebra.salto.toFixed(1)}×.
            A tendência foi ajustada até {base.anoInscricaoBase} e {calib.quebra.ano} entra
            apenas como saldo de abertura. Se a mudança de política de inscrição
            for permanente, ajuste o <em>patamar de inscrição</em> nos parâmetros —
            os dados não distinguem mutirão pontual de mudança definitiva.
          </p>
        </div>
      )}

      <div className="dash-kpis" style={{ marginTop: 14 }}>
        <div className="kpi">
          <span className="kpi-valor">{brl(totalRecuperado)}</span>
          <span className="kpi-nome">Recuperação acumulada</span>
          <span className="kpi-desc">{linhas.length} exercícios, preços correntes</span>
        </div>
        <div className="kpi">
          <span className="kpi-valor">{brl(totalRecuperadoReal)}</span>
          <span className="kpi-nome">O mesmo a preços de {base.anoBase}</span>
          <span className="kpi-desc">deflacionado por {pct(p.inflacao)} a.a.</span>
        </div>
        <div className="kpi">
          <span className="kpi-valor">{brl(ultimo.estoqueFinal)}</span>
          <span className="kpi-nome">Estoque em {ultimo.ano}</span>
          <span className="kpi-desc">
            {brl(proj.conservador[9].estoqueFinal)} a {brl(proj.otimista[9].estoqueFinal)}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-valor">{brl(ultimo.provisaoPerdas)}</span>
          <span className="kpi-nome">Provisão para perdas</span>
          <span className="kpi-desc">MCASP, sobre o estoque de {ultimo.ano}</span>
        </div>
      </div>

      {/* Trajetória do estoque nos três cenários */}
      <h3 style={{ marginTop: 20 }}>Estoque projetado (R$ mi)</h3>
      <div className="prev-grafico">
        {linhas.map((a, i) => (
          <div key={a.ano} className="prev-col" title={
            `${a.ano}\nconservador ${brl(proj.conservador[i].estoqueFinal)}\n` +
            `base ${brl(a.estoqueFinal)}\notimista ${brl(proj.otimista[i].estoqueFinal)}`
          }>
            <div className="prev-faixa" style={{
              height: `${(proj.otimista[i].estoqueFinal / maxEstoque) * 100}%`,
            }}>
              <div className="prev-base" style={{
                height: `${(a.estoqueFinal / proj.otimista[i].estoqueFinal) * 100}%`,
              }} />
            </div>
            <span className="prev-rotulo">{String(a.ano).slice(2)}</span>
          </div>
        ))}
      </div>
      <p className="detalhe">
        Barra clara = intervalo entre conservador e otimista; barra cheia = cenário base.
      </p>

      <h3 style={{ marginTop: 20 }}>Cenário base, exercício a exercício</h3>
      <div style={{ overflowX: "auto" }}>
        <table className="sada-tabela">
          <thead>
            <tr>
              <th>Ano</th><th>Estoque inicial</th><th>+ Inscrições</th><th>+ Encargos</th>
              <th>− Recuperação</th><th>− Prescrição</th><th>Estoque final</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((a) => (
              <tr key={a.ano}>
                <td>{a.ano}</td>
                <td>{mi(a.estoqueInicial)}</td>
                <td>{mi(a.inscricoes)}</td>
                <td>{mi(a.encargos)}</td>
                <td>{mi(a.recuperacao)}</td>
                <td>{a.baixas > 0 ? mi(a.baixas) : "—"}</td>
                <td><strong>{mi(a.estoqueFinal)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="detalhe">Valores em R$ milhões, preços correntes.</p>

      <button className="btn secondary" style={{ marginTop: 16 }}
        onClick={() => setVerParametros((v) => !v)}>
        {verParametros ? "Ocultar parâmetros" : "Ajustar parâmetros e hipóteses"}
      </button>

      {verParametros && (
        <div style={{ marginTop: 14 }}>
          <div className="depara-filtros">
            <CampoPct rotulo="Correção monetária (a.a.)" valor={p.correcao}
              ajuda="IPCA-E, IPCA ou SELIC, conforme a lei municipal"
              onChange={(v) => setP({ ...p, correcao: v })} />
            <CampoPct rotulo="Juros de mora (a.a.)" valor={p.juros}
              ajuda="CTN art. 161 §1º admite 1% a.m. Com SELIC, zere este campo"
              onChange={(v) => setP({ ...p, juros: v })} />
            <CampoPct rotulo="Crescimento das inscrições (a.a.)" valor={p.crescimento}
              ajuda={`Log-linear medido: ${pct(calib.crescimentoInscricoesLogLinear)} · CAGR: ${pct(calib.crescimentoInscricoesCagr)}`}
              onChange={(v) => setP({ ...p, crescimento: v })} />
          </div>
          <div className="depara-filtros" style={{ marginTop: 10 }}>
            <CampoPct rotulo="φ — inadimplido que vira inscrição" valor={p.phi}
              ajuda="Parcelamentos e impugnações seguram parte. Não é observável nesta base"
              onChange={(v) => setP({ ...p, phi: v })} />
            <CampoPct rotulo="θ — prescrição interrompida" valor={p.theta}
              ajuda="Fração com citação, protesto ou confissão. CTN art. 174"
              onChange={(v) => setP({ ...p, theta: v })} />
            <CampoPct rotulo="Inflação projetada (a.a.)" valor={p.inflacao}
              ajuda="Só para a série a preços constantes"
              onChange={(v) => setP({ ...p, inflacao: v })} />
          </div>
          <div className="depara-filtros" style={{ marginTop: 10 }}>
            <div className="field">
              <label>Patamar de inscrição</label>
              <input type="number" step={0.1} min={0.1} max={5} value={p.patamar}
                onChange={(e) => setP({ ...p, patamar: parseFloat(e.target.value) || 1 })} />
              <small>1 = mantém o padrão histórico. Hipótese administrativa, não estatística</small>
            </div>
            <div className="field">
              <label>Prescrição (anos)</label>
              <input type="number" step={1} min={1} max={20} value={p.anosPrescricao}
                onChange={(e) => setP({ ...p, anosPrescricao: parseInt(e.target.value, 10) || 5 })} />
              <small>CTN art. 174 usa 5</small>
            </div>
            <div className="field">
              <label>&nbsp;</label>
              <button className="btn secondary" onClick={() => setP(PARAMETROS_PADRAO)}>
                Restaurar padrões
              </button>
            </div>
          </div>

          <h3 style={{ marginTop: 18 }}>Calibração medida nesta base</h3>
          <table className="sada-tabela">
            <tbody>
              <tr>
                <td>Encargos implícitos</td>
                <td><strong>{pct(calib.encargosAA)} a.a.</strong></td>
                <td className="detalhe">
                  Razão total/principal entre as duas safras com encargos preenchidos.
                  Idade implícita da foto: {calib.idadeFoto.toFixed(2)} ano — serve de
                  teste de sanidade para correção + juros acima
                </td>
              </tr>
              <tr>
                <td>Recuperação de ciclo de vida</td>
                <td><strong>{pct(calib.ciclo)}</strong></td>
                <td className="detalhe">
                  {brl(calib.recuperadoAcum)} recuperados contra {brl(calib.abertoComEncargos)} em
                  aberto. Soma exercícios a preços nominais diferentes — ordem de grandeza,
                  não estimativa precisa
                </td>
              </tr>
              <tr>
                <td>Curva de recuperação por idade</td>
                <td><strong>{pct(base.curvaW[0] ?? 0)}</strong> na idade 0</td>
                <td className="detalhe">
                  {pct((base.curvaW[0] ?? 0) + (base.curvaW[1] ?? 0))} do total recuperado entra
                  nos dois primeiros anos. É por isso que uma taxa única distorce
                </td>
              </tr>
              <tr>
                <td>Crescimento das inscrições</td>
                <td><strong>{pct(calib.crescimentoInscricoesLogLinear)}</strong></td>
                <td className="detalhe">
                  Log-linear até {base.anoInscricaoBase}. CAGR dá {pct(calib.crescimentoInscricoesCagr)} —
                  divergência grande entre os dois indica tendência instável
                </td>
              </tr>
            </tbody>
          </table>

          <p className="detalhe" style={{ marginTop: 12 }}>
            Taxas de crescimento são <strong>nominais</strong> e cobrem uma década de
            inflação relevante — o crescimento real é menor. Limitações completas em{" "}
            <code>docs/SADA-PREVISAO-ORCAMENTARIA.md</code>.
          </p>
        </div>
      )}
    </section>
  );
}
