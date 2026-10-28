import { AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useMemo, useState } from 'react';
import { fmtDateTime, fmtInt, fmtSmall } from '../lib/format';
import { healthSummary, LOG_LEVEL_LABELS, type HealthEvent, type LogGroup, type LogLevel } from '../lib/painel';
import { useSpotlight } from '../lib/hooks';
import { ChartCard, DataTable, EmptyState, RankedBars } from './charts';
import { EASE, Reveal, SectionHeading } from './ui';

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

const LEVEL_STYLE: Record<LogLevel, { icon: typeof Info; className: string }> = {
  critical: { icon: AlertOctagon, className: 'bg-danger text-[var(--canvas)]' },
  error: { icon: AlertTriangle, className: 'bg-danger-soft text-danger' },
  warning: { icon: Info, className: 'bg-amber-soft text-amber-ink' },
};

function LevelBadge({ level }: { level: LogLevel }) {
  const { icon: Icon, className } = LEVEL_STYLE[level];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>
      <Icon size={11} aria-hidden="true" />
      {LOG_LEVEL_LABELS[level]}
    </span>
  );
}

type Filter = 'todos' | 'erros' | 'avisos';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'erros', label: 'Erros' },
  { key: 'avisos', label: 'Avisos' },
];

export function LogsSection({ index, logs }: { index: string; logs: LogGroup[] }) {
  const [filter, setFilter] = useState<Filter>('todos');
  const reduce = useReducedMotion();
  const counts = useMemo(
    () => ({
      erros: logs.filter((l) => l.level !== 'warning').length,
      avisos: logs.filter((l) => l.level === 'warning').length,
      vezes: logs.reduce((acc, l) => acc + l.occurrences, 0),
    }),
    [logs],
  );
  const shown = logs.filter((l) =>
    filter === 'todos' ? true : filter === 'erros' ? l.level !== 'warning' : l.level === 'warning',
  );

  return (
    <section aria-labelledby="sec-logs">
      <SectionHeading
        index={index}
        id="sec-logs"
        title="Logs do Nicx"
        note="Avisos e erros dos últimos 30 dias, agrupados e sem dados pessoais."
      />
      <Reveal>
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <p className="text-[13px] text-muted">
              <span className="font-semibold text-ink tabular">{fmtInt(counts.erros)}</span> tipos de erro ·{' '}
              <span className="font-semibold text-ink tabular">{fmtInt(counts.avisos)}</span> de aviso ·{' '}
              <span className="font-semibold text-ink tabular">{fmtInt(counts.vezes)}</span> ocorrências
            </p>
            <div role="radiogroup" aria-label="Filtrar logs" className="inline-flex rounded-full border border-line bg-surface/70 p-1">
              {FILTERS.map((f) => {
                const active = f.key === filter;
                return (
                  <button
                    key={f.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setFilter(f.key)}
                    className={`relative rounded-full px-3 py-1 text-xs font-medium transition-colors ${active ? 'text-[var(--accent-ink)]' : 'text-muted hover:text-ink'}`}
                  >
                    {active && (
                      <motion.span
                        layoutId="filtro-logs"
                        className="absolute inset-0 rounded-full bg-accent"
                        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                      />
                    )}
                    <span className="relative">{f.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {shown.length === 0 ? (
            <EmptyState compact>
              {logs.length === 0
                ? 'Nenhum aviso ou erro nos últimos 30 dias. Ou o Nicx está bem, ou ninguém com consentimento usou.'
                : 'Nada neste filtro.'}
            </EmptyState>
          ) : (
            <div className="max-h-[560px] overflow-auto">
              <DataTable
                head={['Nível', 'O que aconteceu', { label: 'Vezes', num: true }, { label: 'Instalações', num: true }, 'Última vez']}
                caption="Logs do Nicx"
              >
                {shown.map((l) => (
                  <tr key={l.fingerprint}>
                    <td className="whitespace-nowrap">
                      <LevelBadge level={l.level} />
                    </td>
                    <td className="min-w-[18rem]">
                      <div className="font-mono text-xs leading-relaxed text-ink">{l.message}</div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10.5px] text-subtle">
                        <span>{l.logger}</span>
                        {l.exc_type && <span className="text-danger">{l.exc_type}</span>}
                        {l.location && <span title="Onde no código do Nicx">{l.location}</span>}
                        {l.versions.length > 0 && <span>v{l.versions.join(', v')}</span>}
                      </div>
                    </td>
                    <td className="num font-semibold">{fmtInt(l.occurrences)}</td>
                    <td className="num">{fmtInt(l.installations)}</td>
                    <td className="whitespace-nowrap font-mono text-xs">{fmtDateTime(l.last_seen_at)}</td>
                  </tr>
                ))}
              </DataTable>
            </div>
          )}
        </div>
      </Reveal>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Saúde
// ---------------------------------------------------------------------------

function Stat({ label, value, hint, delay }: { label: string; value: string; hint: string; delay: number }) {
  const spotlight = useSpotlight<HTMLDivElement>();
  return (
    <Reveal delay={delay}>
      <div ref={spotlight} className="card flex h-full flex-col p-5">
        <div className="eyebrow">{label}</div>
        <motion.div
          className="mt-3 text-[clamp(1.9rem,3.4vw,2.5rem)] font-semibold leading-none tracking-[-0.03em] text-ink tabular"
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: EASE, delay: delay + 0.1 }}
        >
          {value}
        </motion.div>
        <div className="mt-3 text-xs text-subtle">{hint}</div>
      </div>
    </Reveal>
  );
}

const orDash = (v: number | null, f: (n: number) => string) => (v === null ? '—' : f(v));

export function HealthSection({ index, health }: { index: string; health: HealthEvent[] }) {
  const s = useMemo(() => healthSummary(health), [health]);
  if (health.length === 0) {
    return (
      <section aria-labelledby="sec-saude">
        <SectionHeading index={index} id="sec-saude" title="Saúde do Nicx" note="Últimos 30 dias." />
        <Reveal>
          <div className="card">
            <EmptyState compact>
              Ainda sem dados de saúde. Eles chegam quando um Nicx com consentimento abre o servidor (e depois a
              cada hora).
            </EmptyState>
          </div>
        </Reveal>
      </section>
    );
  }
  return (
    <section aria-labelledby="sec-saude">
      <SectionHeading index={index} id="sec-saude" title="Saúde do Nicx" note="Últimos 30 dias, de quem deu consentimento." />
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Memória do Nicx"
          value={orDash(s.rssAvgMb, (n) => `${fmtInt(Math.round(n))} MB`)}
          hint={s.rssMaxMb === null ? 'Sem medições ainda' : `média · pico de ${fmtInt(s.rssMaxMb)} MB`}
          delay={0}
        />
        <Stat
          label="RAM do PC em uso"
          value={orDash(s.ramAvgPercent, (n) => `${fmtInt(Math.round(n))}%`)}
          hint="média nas medições de hora em hora"
          delay={0.06}
        />
        <Stat
          label="Tempo para abrir"
          value={orDash(s.startupMs, (n) => `${fmtSmall(Math.round(n / 100) / 10)} s`)}
          hint={`média de ${fmtInt(s.starts)} aberturas`}
          delay={0.12}
        />
        <Stat
          label="Ollama ligado pelo Nicx"
          value={`${fmtInt(s.autostarted)} de ${fmtInt(s.starts)}`}
          hint="aberturas em que o motor estava desligado"
          delay={0.18}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Reveal>
          <ChartCard title="Modelos em uso" subtitle="Família do modelo em cada abertura do servidor" empty={s.models.length === 0} emptyText="Nenhum modelo informado ainda.">
            <RankedBars rows={s.models} color="var(--cyan)" />
          </ChartCard>
        </Reveal>
        <Reveal delay={0.08}>
          <ChartCard title="Motores e voz" subtitle="Em quantas aberturas cada coisa estava ligada" empty={s.starts === 0} emptyText="Nenhuma abertura registrada ainda.">
            <RankedBars
              rows={[
                ...s.engines.map((e) => ({ label: `Motor: ${e.label}`, value: e.value })),
                { label: 'Reconhecimento de voz', value: s.voice.input },
                { label: 'Voz do Nicx', value: s.voice.output },
                { label: '"Nicx, ligar"', value: s.voice.wakeWord },
              ]}
            />
          </ChartCard>
        </Reveal>
      </div>
    </section>
  );
}
