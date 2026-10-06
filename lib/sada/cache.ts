/**
 * SADA · cabeçalho de cache das rotas de LEITURA.
 *
 * As telas do módulo refazem as mesmas consultas o tempo todo: voltar ao
 * dashboard, alternar entre Qualidade e Validação, trocar de cliente e
 * voltar. Sem cache nenhum — e não havia nenhum — cada ida dessas custava a
 * viagem inteira ao servidor e ao banco.
 *
 * `private` porque a resposta depende da sessão: é para o navegador de quem
 * pediu, nunca para um cache compartilhado. `max-age` curto porque o dado só
 * muda em importação, que é rara e demorada; e `stale-while-revalidate` deixa
 * a tela abrir com o valor anterior enquanto busca o novo em segundo plano —
 * é o que faz a navegação parecer instantânea sem mostrar número velho por
 * muito tempo.
 *
 * NÃO usar em rota de escrita, nem no DE/PARA: ali o usuário salva e espera
 * ver o que salvou, e 30 segundos de atraso viram um bug difícil de explicar.
 */
export const CACHE_LEITURA = {
  "Cache-Control": "private, max-age=30, stale-while-revalidate=300",
} as const;
