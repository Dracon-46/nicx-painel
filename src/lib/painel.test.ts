import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  computeKpis,
  dailySeries,
  daysOf,
  fetchPainelData,
  isEmpty,
  PainelAccessError,
  fetchAdminStatus,
  healthSummary,
  painelErrorMessage,
  relativeChange,
  todayInSaoPaulo,
  type PainelData,
} from './painel';

function emptyData(overrides: Partial<PainelData> = {}): PainelData {
  return {
    period: 7,
    today: '2026-10-28',
    activity: [],
    usage: [],
    activeInstallations: null,
    features: [],
    errorClasses: [],
    platforms: [],
    funnel: null,
    consent: [],
    recent: [],
    accesses: [],
    logs: [],
    health: [],
    ...overrides,
  };
}

/** Cliente falso: devolve o resultado configurado para cada tabela ou RPC. */
function fakeClient(results: Record<string, { data: unknown; error: unknown }>): SupabaseClient {
  const query = (name: string) => {
    const result = results[name] ?? { data: [], error: null };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'gte', 'in', 'order', 'limit']) chain[method] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return chain;
  };
  return {
    from: (table: string) => query(table),
    rpc: (fn: string) => Promise.resolve(results[fn] ?? { data: null, error: null }),
  } as unknown as SupabaseClient;
}

describe('datas', () => {
  it('conta os dias do período terminando hoje', () => {
    expect(daysOf(3, '2026-10-28')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28']);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('usa o dia de São Paulo, não o UTC', () => {
    // 01:30 UTC do dia 29 ainda é dia 28 em São Paulo (UTC-3).
    expect(todayInSaoPaulo(new Date('2026-10-29T01:30:00Z'))).toBe('2026-10-28');
  });
});

describe('séries e números', () => {
  const data = emptyData({
    activity: [
      { day: '2026-10-21', installations: 1, app_opens: 0, chat_sessions: 2, errors: 0, events: 3 },
      { day: '2026-10-28', installations: 2, app_opens: 1, chat_sessions: 5, errors: 1, events: 9 },
    ],
    usage: [
      { day: '2026-10-28', turns: 4, tokens_in: 300, tokens_out: 40, tool_calls: 0, latency_ms_p50: null, latency_ms_p95: null, duration_ms: 0 },
    ],
  });

  it('preenche com zero os dias sem eventos', () => {
    const series = dailySeries(data);
    expect(series).toHaveLength(7);
    expect(series[0].day).toBe('2026-10-22');
    expect(series[6]).toMatchObject({ installations: 2, chat_sessions: 5, tokens_in: 300, tokens_out: 40 });
    expect(series[3]).toMatchObject({ installations: 0, chat_sessions: 0 });
  });

  it('compara com o mesmo número de dias logo antes', () => {
    const k = computeKpis(data);
    expect(k.chatSessions).toEqual({ current: 5, previous: 2 });
    expect(k.tokens).toEqual({ current: 340, previous: 0 });
    expect(relativeChange(k.chatSessions)).toBeCloseTo(1.5);
    expect(relativeChange(k.tokens)).toBeNull();
  });

  it('reconhece um painel sem nenhum dado', () => {
    expect(isEmpty(emptyData())).toBe(true);
    expect(isEmpty(data)).toBe(false);
  });
});

describe('busca no Supabase', () => {
  it('transforma as linhas e o resumo do período', async () => {
    const client = fakeClient({
      nicx_daily_activity: {
        data: [{ day: '2026-10-28', installations: '2', app_opens: 1, chat_sessions: 3, errors: 0, events: 5 }],
        error: null,
      },
      nicx_period_summary: {
        data: { installations: 2, installations_prev: 1, features: [{ feature: 'voice', uses: 4, installations: 1 }], error_classes: [] },
        error: null,
      },
      nicx_install_funnel: {
        data: [{ install_started: 3, install_completed: 2, setup_completed: 2, first_chat_sent: 1, active_chatters: 1 }],
        error: null,
      },
    });
    const data = await fetchPainelData(client, 7, '2026-10-28');
    expect(data.activity[0].installations).toBe(2);
    expect(data.activeInstallations).toEqual({ current: 2, previous: 1 });
    expect(data.features[0]).toMatchObject({ feature: 'voice', uses: 4 });
    expect(data.funnel?.install_started).toBe(3);
  });

  it('sem permissão no banco vira PainelAccessError', async () => {
    const client = fakeClient({ nicx_daily_activity: { data: null, error: { code: '42501', message: 'permission denied' } } });
    await expect(fetchPainelData(client, 7, '2026-10-28')).rejects.toBeInstanceOf(PainelAccessError);
  });
});

describe('mensagens de erro em português', () => {
  it('traduz os erros de login conhecidos', () => {
    expect(painelErrorMessage({ code: 'invalid_credentials' })).toBe('E-mail ou senha incorretos.');
    expect(painelErrorMessage({ message: 'Email not confirmed' })).toMatch(/não confirmado/);
    expect(painelErrorMessage({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' })).toMatch(/Sem conexão/);
  });
});

describe('segundo fator', () => {
  it('lê o status de administrador e o nível da sessão', async () => {
    const client = fakeClient({ nicx_admin_status: { data: { admin: true, aal: 'aal1' }, error: null } });
    expect(await fetchAdminStatus(client)).toEqual({ admin: true, aal: 'aal1' });
    const verified = fakeClient({ nicx_admin_status: { data: { admin: true, aal: 'aal2' }, error: null } });
    expect((await fetchAdminStatus(verified)).aal).toBe('aal2');
  });

  it('resposta estranha não vira administrador', async () => {
    const client = fakeClient({ nicx_admin_status: { data: { admin: 'sim', aal: 'aal9' }, error: null } });
    expect(await fetchAdminStatus(client)).toEqual({ admin: false, aal: 'aal1' });
  });
});

describe('saúde do servidor', () => {
  it('resume aberturas, memória e motores', () => {
    const at = '2026-10-28T10:00:00Z';
    const ev = (event: 'server_started' | 'server_health', properties: Record<string, unknown>) => ({
      received_at: at,
      anon_id: 'a',
      event,
      properties,
      app_version: '1.0.0',
    });
    const summary = healthSummary([
      ev('server_started', { engine: 'ollama', model_family: 'qwen3.5', startup_ms: 8000, engine_autostarted: true, voice_input: true }),
      ev('server_started', { engine: 'ollama', model_family: 'llama3.2', startup_ms: 4000, engine_autostarted: false }),
      ev('server_health', { rss_mb: 300, ram_percent: 50 }),
      ev('server_health', { rss_mb: 500, ram_percent: 60 }),
    ]);
    expect(summary.starts).toBe(2);
    expect(summary.startupMs).toBe(6000);
    expect(summary.autostarted).toBe(1);
    expect(summary.rssAvgMb).toBe(400);
    expect(summary.rssMaxMb).toBe(500);
    expect(summary.ramAvgPercent).toBe(55);
    expect(summary.engines).toEqual([{ label: 'ollama', value: 2 }]);
    expect(summary.voice.input).toBe(1);
  });

  it('sem eventos, sem números inventados', () => {
    const summary = healthSummary([]);
    expect(summary.startupMs).toBeNull();
    expect(summary.rssAvgMb).toBeNull();
  });
});
