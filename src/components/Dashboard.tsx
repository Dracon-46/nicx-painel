import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowDownRight, ArrowUpRight, Minus, RefreshCw } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AUDIT_LABELS,
  computeKpis,
  dailySeries,
  EMPTY_DATA_MESSAGE,
  ERROR_LABELS,
  EVENT_LABELS,
  FEATURE_LABELS,
  fetchPainelData,
  FUNNEL_STEPS,
  isEmpty,
  PainelAccessError,
  PERIODS,
  relativeChange,
  type Kpi,
  type PainelData,
  type Period,
} from '../lib/painel';
import {
  fmtClock,
  fmtCompact,
  fmtDateTime,
  fmtDayLong,
  fmtInt,
  fmtPercent,
  fmtProperties,
  fmtSmall,
} from '../lib/format';
import { useCountUp, useSpotlight } from '../lib/hooks';
import {
  AreaChart,
  ChartCard,
  DataTable,
  EmptyState,
  Funnel,
  Legend,
  RankedBars,
  Sparkline,
  StackedColumns,
} from './charts';
import { HealthSection, LogsSection } from './LogsHealth';
import { NicxCore } from './Nicx3D/NicxCore';
import { EASE, Reveal, RevealWords, SectionHeading } from './ui';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: PainelData; at: Date }
  | { kind: 'error'; message: string; data?: PainelData; at?: Date };

const RANKED_LIMIT = 8;

/** As linhas do topo e um "Outros" com o resto: a lista nunca passa de 9. */
function ranked<T>(rows: T[], label: (r: T) => string, value: (r: T) => number) {
  const sorted = [...rows].sort((a, b) => value(b) - value(a));
  const top = sorted.slice(0, RANKED_LIMIT).map((r) => ({ label: label(r), value: value(r) }));
  const rest = sorted.slice(RANKED_LIMIT).reduce((acc, r) => acc + value(r), 0);
  return rest > 0 ? [...top, { label: 'Outros', value: rest }] : top;
}

function savedPeriod(): Period {
  try {
    const saved = Number(localStorage.getItem('nicx-painel-period'));
    return (PERIODS as readonly number[]).includes(saved) ? (saved as Period) : 30;
  } catch {
    return 30;
  }
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const reduce = useReducedMotion();
  return (
    <div role="radiogroup" aria-label="Período" className="inline-flex rounded-full border border-line bg-surface/70 p-1">
      {PERIODS.map((p) => {
        const active = p === value;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(p)}
            className={`relative rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${active ? 'text-[var(--accent-ink)]' : 'text-muted hover:text-ink'}`}
          >
            {active && (
              <motion.span
                layoutId="periodo-ativo"
                className="absolute inset-0 rounded-full bg-accent"
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative tabular">{p} dias</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Números
// ---------------------------------------------------------------------------

function Delta({ kpi, period, upIsGood }: { kpi: Kpi; period: Period; upIsGood: boolean }) {
  const change = relativeChange(kpi);
  if (change === null) {
    return (
      <span className="text-subtle">
        {kpi.current > 0 ? `Sem dados nos ${period} dias anteriores` : 'Sem dados para comparar'}
      </span>
    );
  }
  if (Math.abs(change) < 0.005) {
    return (
      <span className="inline-flex items-center gap-1 text-muted">
        <Minus size={12} aria-hidden="true" /> Estável
      </span>
    );
  }
  const up = change > 0;
  const good = up === upIsGood;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-medium ${good ? 'bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-success' : 'bg-danger-soft text-danger'}`}
      >
        <Icon size={12} aria-hidden="true" />
        {up ? '+' : '−'}
        {fmtPercent(Math.abs(change))}
      </span>
      <span className="text-subtle">vs. {period} dias antes</span>
    </span>
  );
}

function KpiTile({
  index,
  label,
  hint,
  kpi,
  format,
  period,
  spark,
  upIsGood = true,
  color,
}: {
  index: number;
  label: string;
  hint?: string;
  kpi: Kpi;
  format: (n: number) => string;
  period: Period;
  spark: number[];
  upIsGood?: boolean;
  color?: string;
}) {
  const value = useCountUp(kpi.current);
  const spotlight = useSpotlight<HTMLDivElement>();
  return (
    <Reveal delay={index * 0.06}>
      <div ref={spotlight} className="card flex h-full flex-col p-5">
        <div className="eyebrow">
          {label}
          {hint && <span className="normal-case tracking-normal"> · {hint}</span>}
        </div>
        <div className="mt-3 font-sans text-[clamp(2.2rem,4vw,2.9rem)] font-semibold leading-none tracking-[-0.03em] text-ink tabular">
          <span className="sr-only">{format(kpi.current)}</span>
          <span aria-hidden="true">{format(value)}</span>
        </div>
        <div className="mt-3 text-xs">
          <Delta kpi={kpi} period={period} upIsGood={upIsGood} />
        </div>
        <div className="mt-auto pt-4">
          <Sparkline values={spark} color={color} />
        </div>
      </div>
    </Reveal>
  );
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

export function Dashboard({ client, onAccessDenied }: { client: SupabaseClient; onAccessDenied: () => void }) {
  const [period, setPeriod] = useState<Period>(savedPeriod);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [loads, setLoads] = useState(0);
  const requestId = useRef(0);
  const reduce = useReducedMotion();

  const load = useCallback(
    async (p: Period) => {
      const id = ++requestId.current;
      setRefreshing(true);
      try {
        const data = await fetchPainelData(client, p);
        if (id === requestId.current) {
          setState({ kind: 'ready', data, at: new Date() });
          setLoads((n) => n + 1);
        }
      } catch (error) {
        if (id !== requestId.current) return;
        if (error instanceof PainelAccessError) {
          onAccessDenied();
          return;
        }
        const message = error instanceof Error ? error.message : 'Não foi possível carregar os dados.';
        setState((prev) =>
          prev.kind === 'ready' ? { kind: 'error', message, data: prev.data, at: prev.at } : { kind: 'error', message },
        );
      } finally {
        if (id === requestId.current) setRefreshing(false);
      }
    },
    [client, onAccessDenied],
  );

  useEffect(() => {
    void load(period);
    try {
      localStorage.setItem('nicx-painel-period', String(period));
    } catch {
      // Lembrar o período é só conveniência.
    }
  }, [load, period]);

  const data = state.kind === 'loading' ? undefined : state.data;
  const at = state.kind === 'loading' ? undefined : state.at;

  // O núcleo do Nicx pulsa conforme o uso no período.
  const energy = useMemo(() => {
    if (!data) return 0.2;
    const k = computeKpis(data);
    return Math.min(1, Math.log10(1 + k.chatSessions.current + k.installations.current) / 2);
  }, [data]);

  return (
    <>
      {/* Abertura */}
      <section className="grid items-center gap-6 pb-10 pt-6 lg:grid-cols-[1fr_minmax(260px,360px)] lg:pb-14">
        <div>
          <p className="eyebrow mb-4">Observatório do Nicx</p>
          <h1 className="font-display text-[clamp(2.8rem,7vw,5.2rem)] leading-[0.95] tracking-[-0.02em] text-ink">
            <RevealWords text="Como o Nicx" />{' '}
            <em className="text-accent">
              <RevealWords text="está sendo usado" delay={0.15} />
            </em>
          </h1>
          <motion.p
            className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.3 }}
          >
            Dados anônimos, enviados só por instalações que deram consentimento. Nenhuma conversa ou dado
            pessoal chega aqui. Dias no horário de Brasília.
          </motion.p>
          <motion.div
            className="mt-7 flex flex-wrap items-center gap-3"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.42 }}
          >
            <PeriodPicker value={period} onChange={setPeriod} />
            <button
              type="button"
              onClick={() => void load(period)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-surface-2 disabled:opacity-60"
            >
              <RefreshCw size={13} aria-hidden="true" className={refreshing ? 'animate-spin' : undefined} />
              Atualizar
            </button>
            <span className="font-mono text-[11px] text-subtle" role="status">
              {refreshing ? 'Carregando...' : at ? `Atualizado às ${fmtClock(at)}` : ''}
            </span>
          </motion.div>
        </div>
        <div className="relative mx-auto aspect-square w-full max-w-[220px] sm:max-w-[300px] lg:max-w-[340px]">
          <div
            aria-hidden="true"
            className="absolute inset-[14%] rounded-full blur-3xl"
            style={{ background: 'radial-gradient(circle, var(--glow-a), transparent 70%)' }}
          />
          <NicxCore className="h-full w-full" energy={energy} alert={state.kind === 'error'} bounceKey={loads} fallbackSize={200} />
        </div>
      </section>

      {state.kind === 'error' && (
        <div role="alert" className="mb-8 flex flex-wrap items-center gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] bg-danger-soft px-5 py-4 text-sm text-ink">
          <span className="min-w-0 flex-1">{state.message}</span>
          <button type="button" onClick={() => void load(period)} className="text-xs font-medium text-accent underline underline-offset-4">
            Tentar de novo
          </button>
        </div>
      )}

      {!data && state.kind === 'loading' && <Skeleton />}
      {data && (
        <div aria-busy={refreshing} className={`transition-opacity duration-300 ${refreshing ? 'opacity-70' : ''}`}>
          <Body data={data} />
        </div>
      )}
    </>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-label="Carregando o painel" className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-[188px] rounded-[20px]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="skeleton h-[300px] rounded-[20px]" />
        <div className="skeleton h-[300px] rounded-[20px]" />
      </div>
    </div>
  );
}

function Body({ data }: { data: PainelData }) {
  const period = data.period;
  const series = useMemo(() => dailySeries(data), [data]);
  const kpis = useMemo(() => computeKpis(data), [data]);
  const empty = isEmpty(data);
  const hasActivity = series.some((d) => d.installations > 0 || d.chat_sessions > 0);
  const hasTokens = series.some((d) => d.tokens_in > 0 || d.tokens_out > 0);
  const features = ranked(data.features, (r) => FEATURE_LABELS[r.feature] ?? r.feature, (r) => r.uses);
  const errors = ranked(data.errorClasses, (r) => ERROR_LABELS[r.error_class] ?? r.error_class, (r) => r.occurrences);
  const funnel = FUNNEL_STEPS.map((s) => ({ label: s.label, value: data.funnel?.[s.key] ?? 0 }));
  const funnelEmpty = funnel.every((s) => s.value === 0);
  const installsExact = data.activeInstallations !== null;

  const dailyTable = (key: 'installations' | 'chat_sessions', label: string) => (
    <DataTable head={['Dia', { label, num: true }]} caption={label}>
      {series.map((d) => (
        <tr key={d.day}>
          <td>{fmtDayLong(d.day)}</td>
          <td className="num">{fmtInt(d[key])}</td>
        </tr>
      ))}
    </DataTable>
  );

  return (
    <div className="flex flex-col gap-16 sm:gap-20">
      {empty && (
        <Reveal>
          <div className="card flex flex-col items-start gap-2 p-6 sm:flex-row sm:items-center sm:gap-6">
            <span className="signature-dot text-2xl" aria-hidden="true" />
            <div>
              <p className="font-display text-2xl text-ink">Ainda silencioso por aqui.</p>
              <p className="mt-1 text-sm text-muted">{EMPTY_DATA_MESSAGE}</p>
            </div>
          </div>
        </Reveal>
      )}

      <section aria-labelledby="sec-atividade">
        <SectionHeading
          index="01"
          id="sec-atividade"
          title={`Atividade nos últimos ${period} dias`}
          note="Variação contra o mesmo número de dias logo antes."
        />
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile
            index={0}
            label="Instalações ativas"
            hint={installsExact ? undefined : 'média por dia'}
            kpi={kpis.installations}
            format={(n) => (installsExact ? fmtCompact(Math.round(n)) : fmtSmall(Math.round(n * 10) / 10))}
            period={period}
            spark={series.map((d) => d.installations)}
          />
          <KpiTile
            index={1}
            label="Sessões de chat"
            kpi={kpis.chatSessions}
            format={(n) => fmtCompact(Math.round(n))}
            period={period}
            spark={series.map((d) => d.chat_sessions)}
            color="var(--cyan)"
          />
          <KpiTile
            index={2}
            label="Tokens"
            kpi={kpis.tokens}
            format={(n) => fmtCompact(Math.round(n))}
            period={period}
            spark={series.map((d) => d.tokens_in + d.tokens_out)}
          />
          <KpiTile
            index={3}
            label="Erros exibidos"
            kpi={kpis.errors}
            format={(n) => fmtCompact(Math.round(n))}
            period={period}
            spark={series.map((d) => d.errors)}
            upIsGood={false}
            color="var(--danger)"
          />
        </div>
        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Reveal>
            <ChartCard
              title="Instalações ativas por dia"
              subtitle="Instalações diferentes que enviaram algum evento"
              empty={!hasActivity}
              table={dailyTable('installations', 'Instalações')}
            >
              <AreaChart data={series.map((d) => ({ day: d.day, value: d.installations }))} name="instalações" />
            </ChartCard>
          </Reveal>
          <Reveal delay={0.08}>
            <ChartCard
              title="Sessões de chat por dia"
              subtitle="Conversas encerradas no app ou no terminal"
              empty={!hasActivity}
              table={dailyTable('chat_sessions', 'Sessões')}
            >
              <AreaChart data={series.map((d) => ({ day: d.day, value: d.chat_sessions }))} name="sessões" />
            </ChartCard>
          </Reveal>
        </div>
        <Reveal>
          <ChartCard
            title="Tokens por dia"
            subtitle="Soma das sessões de chat: tokens lidos (entrada) e gerados (saída)"
            empty={!hasTokens}
            legend={
              <Legend
                items={[
                  { label: 'Entrada', color: 'var(--viz-1)' },
                  { label: 'Saída', color: 'var(--viz-2)' },
                ]}
              />
            }
            table={
              <DataTable head={['Dia', { label: 'Entrada', num: true }, { label: 'Saída', num: true }]} caption="Tokens por dia">
                {series.map((d) => (
                  <tr key={d.day}>
                    <td>{fmtDayLong(d.day)}</td>
                    <td className="num">{fmtInt(d.tokens_in)}</td>
                    <td className="num">{fmtInt(d.tokens_out)}</td>
                  </tr>
                ))}
              </DataTable>
            }
          >
            <StackedColumns
              data={series.map((d) => ({ day: d.day, lower: d.tokens_in, upper: d.tokens_out }))}
              lower="entrada"
              upper="saída"
            />
          </ChartCard>
        </Reveal>
      </section>

      <section aria-labelledby="sec-uso">
        <SectionHeading index="02" id="sec-uso" title="Recursos e erros" note={`Últimos ${period} dias.`} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Reveal>
            <ChartCard
              title="Recursos mais usados"
              subtitle="Vezes em que cada recurso foi aberto"
              empty={features.length === 0}
              emptyText="Nenhum uso de recurso registrado ainda."
              table={
                <DataTable
                  head={['Recurso', { label: 'Usos', num: true }, { label: 'Instalações', num: true }, 'Último uso']}
                  caption="Recursos mais usados"
                >
                  {data.features.map((r) => (
                    <tr key={r.feature}>
                      <td>{FEATURE_LABELS[r.feature] ?? r.feature}</td>
                      <td className="num">{fmtInt(r.uses)}</td>
                      <td className="num">{fmtInt(r.installations)}</td>
                      <td>{fmtDateTime(r.last_used_at)}</td>
                    </tr>
                  ))}
                </DataTable>
              }
            >
              <RankedBars rows={features} />
            </ChartCard>
          </Reveal>
          <Reveal delay={0.08}>
            <ChartCard
              title="Classes de erro"
              subtitle="Erros mostrados às pessoas, por tipo"
              empty={errors.length === 0}
              emptyText="Nenhum erro registrado. Bom sinal."
              table={
                <DataTable
                  head={['Classe', { label: 'Ocorrências', num: true }, { label: 'Instalações', num: true }, 'Última vez']}
                  caption="Classes de erro"
                >
                  {data.errorClasses.map((r) => (
                    <tr key={r.error_class}>
                      <td>
                        {ERROR_LABELS[r.error_class] ?? r.error_class}{' '}
                        <code className="font-mono text-[10px] text-subtle">{r.error_class}</code>
                      </td>
                      <td className="num">{fmtInt(r.occurrences)}</td>
                      <td className="num">{fmtInt(r.installations)}</td>
                      <td>{fmtDateTime(r.last_seen_at)}</td>
                    </tr>
                  ))}
                </DataTable>
              }
            >
              <RankedBars rows={errors} color="var(--danger)" />
            </ChartCard>
          </Reveal>
        </div>
      </section>

      <LogsSection index="03" logs={data.logs} />

      <HealthSection index="04" health={data.health} />

      <section aria-labelledby="sec-historico">
        <SectionHeading index="05" id="sec-historico" title="Desde o início" note="Totais acumulados, sem filtro de período." />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Reveal>
            <ChartCard
              title="Funil de instalação"
              subtitle="Instalações que chegaram a cada etapa; % sobre as que começaram"
              empty={funnelEmpty}
              emptyText="Nenhuma instalação registrada ainda."
            >
              <Funnel steps={funnel} />
            </ChartCard>
          </Reveal>
          <Reveal delay={0.08}>
            <ChartCard
              title="Consentimento"
              subtitle="Escolhas registradas, por versão da política"
              empty={data.consent.length === 0}
              emptyText="Nenhuma escolha registrada ainda."
            >
              <div className="overflow-x-auto rounded-xl border border-line">
                <DataTable head={['Escolha', 'Política', { label: 'Registros', num: true }, 'Última']} caption="Consentimento">
                  {data.consent.map((r) => (
                    <tr key={`${r.granted}-${r.policy_version}`}>
                      <td>
                        <span
                          className={`inline-flex items-center gap-1.5 ${r.granted === true ? 'text-success' : r.granted === false ? 'text-danger' : 'text-muted'}`}
                        >
                          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                          {r.granted === true ? 'Aceitou' : r.granted === false ? 'Recusou' : '—'}
                        </span>
                      </td>
                      <td className="font-mono text-xs">{r.policy_version ?? '—'}</td>
                      <td className="num">{fmtInt(r.records)}</td>
                      <td>{fmtDateTime(r.last_at)}</td>
                    </tr>
                  ))}
                </DataTable>
              </div>
            </ChartCard>
          </Reveal>
        </div>
      </section>

      <section aria-labelledby="sec-plataformas">
        <SectionHeading index="06" id="sec-plataformas" title="Plataformas e versões" note="Últimos 30 dias." />
        <Reveal>
          <div className="card overflow-hidden">
            {data.platforms.length === 0 ? (
              <EmptyState compact>Nenhuma instalação ativa nos últimos 30 dias.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <DataTable
                  head={['Plataforma', 'Sistema', 'Versão', { label: 'Instalações', num: true }, 'Visto por último']}
                  caption="Plataformas e versões"
                >
                  {data.platforms.map((r) => (
                    <tr key={`${r.platform}-${r.os}-${r.app_version}`}>
                      <td>{r.platform}</td>
                      <td>{r.os}</td>
                      <td className="font-mono text-xs">{r.app_version}</td>
                      <td className="num">{fmtInt(r.installations)}</td>
                      <td>{fmtDateTime(r.last_seen_at)}</td>
                    </tr>
                  ))}
                </DataTable>
              </div>
            )}
          </div>
        </Reveal>
      </section>

      <section aria-labelledby="sec-eventos">
        <SectionHeading index="07" id="sec-eventos" title="Eventos recentes" note="Os 50 mais novos, horário de Brasília." />
        <Reveal>
          <div className="card overflow-hidden">
            {data.recent.length === 0 ? (
              <EmptyState compact>{EMPTY_DATA_MESSAGE}</EmptyState>
            ) : (
              <div className="max-h-[560px] overflow-auto">
                <DataTable head={['Quando', 'Evento', 'Plataforma', 'Versão', 'Instalação', 'Detalhes']} caption="Eventos recentes">
                  {data.recent.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap font-mono text-xs tabular">{fmtDateTime(r.received_at)}</td>
                      <td className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: eventColor(r.event) }} />
                          {EVENT_LABELS[r.event] ?? r.event}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">{[r.platform, r.os].filter(Boolean).join(' / ') || '—'}</td>
                      <td className="whitespace-nowrap font-mono text-xs">{r.app_version ?? '—'}</td>
                      <td>
                        <code title={r.anon_id} className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">
                          {r.anon_id.slice(0, 8)}
                        </code>
                      </td>
                      <td className="min-w-[16rem]">
                        <code className="break-words font-mono text-[11px] text-muted">{fmtProperties(r.properties)}</code>
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </div>
            )}
          </div>
        </Reveal>
      </section>

      <section aria-labelledby="sec-acessos">
        <SectionHeading index="08" id="sec-acessos" title="Acessos ao painel" note="Os 30 mais novos. Todo acesso fica registrado." />
        <Reveal>
          <div className="card overflow-hidden">
            {data.accesses.length === 0 ? (
              <EmptyState compact>Nenhum acesso registrado ainda.</EmptyState>
            ) : (
              <div className="max-h-[420px] overflow-auto">
                <DataTable head={['Quando', 'Conta', 'O que fez', 'Verificação', 'IP', 'Navegador']} caption="Acessos ao painel">
                  {data.accesses.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap font-mono text-xs tabular">{fmtDateTime(r.at)}</td>
                      <td className="whitespace-nowrap font-mono text-xs">{r.email}</td>
                      <td className="whitespace-nowrap">{AUDIT_LABELS[r.action] ?? r.action}</td>
                      <td className="whitespace-nowrap">
                        <span className={r.aal === 'aal2' ? 'text-success' : 'text-subtle'}>
                          {r.aal === 'aal2' ? 'Senha + código' : 'Só senha'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap font-mono text-xs text-muted">{r.ip ?? '—'}</td>
                      <td className="text-xs text-muted">{browserOf(r.user_agent)}</td>
                    </tr>
                  ))}
                </DataTable>
              </div>
            )}
          </div>
        </Reveal>
      </section>
    </div>
  );
}

/** Cor do ponto de cada tipo de evento no feed. */
function eventColor(event: string): string {
  if (event.startsWith('install') || event === 'uninstall_started' || event === 'setup_completed') return 'var(--cyan)';
  if (event === 'error_shown_to_user') return 'var(--danger)';
  if (event === 'analytics_consent') return 'var(--amber)';
  return 'var(--accent)';
}

/** "Chrome 130 · Windows" a partir do user agent, sem guardar mais nada. */
function browserOf(ua: string | null): string {
  if (!ua) return '—';
  const patterns: [RegExp, string][] = [
    [/Edg\/(\d+)/, 'Edge'],
    [/Firefox\/(\d+)/, 'Firefox'],
    [/Chrome\/(\d+)/, 'Chrome'],
    [/Version\/(\d+).*Safari/, 'Safari'],
  ];
  let browser = 'Navegador';
  for (const [re, name] of patterns) {
    const version = re.exec(ua)?.[1];
    if (version) {
      browser = `${name} ${version}`;
      break;
    }
  }
  const systems: [RegExp, string][] = [
    [/Windows/, 'Windows'],
    [/Android/, 'Android'],
    [/iPhone|iPad/, 'iOS'],
    [/Mac OS/, 'macOS'],
    [/Linux/, 'Linux'],
  ];
  const os = systems.find(([re]) => re.test(ua))?.[1];
  return os ? `${browser} · ${os}` : browser;
}
