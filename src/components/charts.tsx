import { BarChart3, Inbox, Table2 } from 'lucide-react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { fmtCompact, fmtDayLong, fmtDayShort, fmtInt, fmtPercent } from '../lib/format';
import { useSpotlight, useWidth } from '../lib/hooks';
import { EASE } from './ui';

/*
 * Gráficos do painel em SVG próprio: traços finos, grade discreta, linhas de
 * 2px, pontas arredondadas, um tooltip por posição e, para cada gráfico, uma
 * tabela equivalente (acessível). Revelam-se uma vez ao aparecer.
 */

const svgId = (raw: string) => raw.replace(/[^a-zA-Z0-9_-]/g, '');

/** Passo "redondo" para os eixos (inteiros: contagens). */
export function niceStep(max: number, ticks = 4): number {
  if (max <= 0) return 1;
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  return Math.max(1, step);
}

export function yTicks(max: number, ticks = 4): number[] {
  const step = niceStep(max, ticks);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const out: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) out.push(v);
  return out;
}

/** Índices das datas que aparecem no eixo X (no máximo ~6). */
function xLabelIndices(n: number, maxLabels: number): number[] {
  if (n <= 1) return [0];
  const every = Math.max(1, Math.ceil((n - 1) / (maxLabels - 1)));
  const out: number[] = [];
  for (let i = 0; i < n; i += every) out.push(i);
  if (out[out.length - 1] !== n - 1) {
    if (n - 1 - out[out.length - 1] < every / 2) out.pop();
    out.push(n - 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cartão, legenda, vazio, tabela
// ---------------------------------------------------------------------------

export function EmptyState({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 text-center ${compact ? 'py-8' : 'py-12'}`}>
      <span className="grid size-10 place-items-center rounded-full border border-dashed border-line-strong text-subtle">
        <Inbox size={16} aria-hidden="true" />
      </span>
      <p className="max-w-xs text-[13px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}

interface ChartCardProps {
  title: string;
  subtitle?: string;
  table?: ReactNode;
  legend?: ReactNode;
  empty?: boolean;
  emptyText?: string;
  children: ReactNode;
  className?: string;
}

export function ChartCard({
  title,
  subtitle,
  table,
  legend,
  empty = false,
  emptyText = 'Sem dados neste período.',
  children,
  className = '',
}: ChartCardProps) {
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();
  const spotlight = useSpotlight<HTMLElement>();
  return (
    <figure ref={spotlight} className={`card flex min-w-0 flex-col p-5 sm:p-6 ${className}`} aria-labelledby={titleId}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <figcaption className="min-w-0">
          <div id={titleId} className="text-[15px] font-semibold tracking-tight text-ink">
            {title}
          </div>
          {subtitle && <div className="mt-1 text-xs leading-relaxed text-subtle">{subtitle}</div>}
        </figcaption>
        {table && !empty && (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            {showTable ? <BarChart3 size={12} aria-hidden="true" /> : <Table2 size={12} aria-hidden="true" />}
            {showTable ? 'Gráfico' : 'Tabela'}
          </button>
        )}
      </div>
      {empty ? (
        <EmptyState>{emptyText}</EmptyState>
      ) : showTable ? (
        <div className="max-h-80 overflow-auto rounded-xl border border-line">{table}</div>
      ) : (
        <>
          {legend}
          {children}
        </>
      )}
    </figure>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-2.5 rounded-[3px]" style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function DataTable({
  head,
  children,
  caption,
}: {
  head: (string | { label: string; num?: boolean })[];
  children: ReactNode;
  caption: string;
}) {
  return (
    <table className="data-table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {head.map((h) => {
            const cell = typeof h === 'string' ? { label: h } : h;
            return (
              <th key={cell.label} scope="col" className={cell.num ? 'num' : undefined}>
                {cell.label}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

function Tooltip({
  x,
  width,
  title,
  rows,
}: {
  x: number;
  width: number;
  title: string;
  rows: { label: string; value: string; color: string }[];
}) {
  const left = Math.min(Math.max(x, 80), Math.max(80, width - 80));
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 min-w-[150px] -translate-x-1/2 rounded-xl border border-line bg-surface px-3 py-2 text-xs"
      style={{ left, boxShadow: 'var(--shadow-float)' }}
    >
      <div className="mb-1 text-subtle">{title}</div>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2 py-0.5">
          <span aria-hidden="true" className="inline-block h-0.5 w-3 rounded" style={{ background: row.color }} />
          <span className="font-semibold text-ink tabular">{row.value}</span>
          <span className="text-muted">{row.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Teclado: ← → passeiam pelos dias de um gráfico focado. */
function useActiveIndex(n: number) {
  const [active, setActive] = useState<number | null>(null);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setActive((i) => {
        const cur = i ?? n - 1;
        return Math.min(n - 1, Math.max(0, cur + (e.key === 'ArrowRight' ? 1 : -1)));
      });
    } else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(n - 1);
  };
  return {
    active,
    setActive,
    keyboard: {
      tabIndex: 0,
      onKeyDown,
      onFocus: () => setActive((i) => i ?? n - 1),
      onBlur: () => setActive(null),
    },
  };
}

// ---------------------------------------------------------------------------
// Área diária (uma série)
// ---------------------------------------------------------------------------

const M = { top: 14, right: 14, bottom: 26, left: 40 };

export function AreaChart({
  data,
  name,
  height = 210,
  valueFormat = fmtInt,
}: {
  data: { day: string; value: number }[];
  name: string;
  height?: number;
  valueFormat?: (v: number) => string;
}) {
  const [wrap, width] = useWidth<HTMLDivElement>();
  const inView = useInView(wrap, { once: true, margin: '-40px' });
  const reduce = useReducedMotion();
  const shown = reduce || inView;
  const uid = svgId(useId());
  const n = data.length;
  const { active, setActive, keyboard } = useActiveIndex(n);

  const geo = useMemo(() => {
    const innerW = Math.max(0, width - M.left - M.right);
    const innerH = height - M.top - M.bottom;
    const ticks = yTicks(Math.max(0, ...data.map((d) => d.value)));
    const top = ticks[ticks.length - 1];
    const x = (i: number) => M.left + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
    const y = (v: number) => M.top + innerH - (v / top) * innerH;
    const pts = data.map((d, i) => [x(i), y(d.value)] as const);
    const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
    const area = pts.length
      ? `${line}L${pts[pts.length - 1][0].toFixed(1)},${M.top + innerH}L${pts[0][0].toFixed(1)},${M.top + innerH}Z`
      : '';
    return { innerW, innerH, ticks, x, y, pts, line, area };
  }, [data, width, height, n]);

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - M.left;
    const i = n <= 1 ? 0 : Math.round((px / Math.max(1, geo.innerW)) * (n - 1));
    setActive(Math.min(n - 1, Math.max(0, i)));
  };

  const labels = xLabelIndices(n, width < 420 ? 4 : 6);
  const total = data.reduce((acc, d) => acc + d.value, 0);
  const last = geo.pts[geo.pts.length - 1];

  return (
    <div ref={wrap} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${name}: ${fmtInt(total)} no período. Use as setas para ver cada dia.`}
          className="block overflow-visible rounded-lg"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setActive(null)}
          {...keyboard}
        >
          <defs>
            <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--viz-1)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--viz-1)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {geo.ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={geo.y(t)} y2={geo.y(t)} stroke="var(--line)" />
              <text x={M.left - 8} y={geo.y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--viz-tick)" className="tabular">
                {fmtCompact(t)}
              </text>
            </g>
          ))}
          <line x1={M.left} x2={width - M.right} y1={M.top + geo.innerH} y2={M.top + geo.innerH} stroke="var(--viz-axis)" />
          {labels.map((i) => (
            <text key={i} x={geo.x(i)} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--viz-tick)" className="tabular">
              {fmtDayShort(data[i]?.day)}
            </text>
          ))}

          {/* A linha se desenha, a área aparece logo depois. */}
          <motion.path
            d={geo.area}
            fill={`url(#${uid}-fill)`}
            initial={{ opacity: reduce ? 1 : 0 }}
            animate={{ opacity: shown ? 1 : 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.35 }}
          />
          <motion.path
            d={geo.line}
            fill="none"
            stroke="var(--viz-1)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            initial={{ pathLength: reduce ? 1 : 0 }}
            animate={{ pathLength: shown ? 1 : 0 }}
            transition={{ duration: 1.3, ease: EASE }}
          />
          {last && (
            <motion.circle
              cx={last[0]}
              cy={last[1]}
              r={4}
              fill="var(--viz-1)"
              stroke="var(--surface)"
              strokeWidth={2}
              initial={{ opacity: reduce ? 1 : 0 }}
              animate={{ opacity: shown ? 1 : 0 }}
              transition={{ duration: 0.4, delay: reduce ? 0 : 1.1 }}
            />
          )}

          {active !== null && geo.pts[active] && (
            <g pointerEvents="none">
              <line x1={geo.pts[active][0]} x2={geo.pts[active][0]} y1={M.top} y2={M.top + geo.innerH} stroke="var(--viz-axis)" strokeDasharray="3 3" />
              <circle cx={geo.pts[active][0]} cy={geo.pts[active][1]} r={5} fill="var(--viz-1)" stroke="var(--surface)" strokeWidth={2} />
            </g>
          )}
        </svg>
      )}
      {active !== null && data[active] && (
        <Tooltip
          x={geo.pts[active]?.[0] ?? 0}
          width={width}
          title={fmtDayLong(data[active].day)}
          rows={[{ label: name, value: valueFormat(data[active].value), color: 'var(--viz-1)' }]}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Colunas empilhadas (entrada / saída)
// ---------------------------------------------------------------------------

function topRounded(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}L${x},${y + rr}Q${x},${y} ${x + rr},${y}L${x + w - rr},${y}Q${x + w},${y} ${x + w},${y + rr}L${x + w},${y + h}Z`;
}

export function StackedColumns({
  data,
  lower,
  upper,
  height = 230,
}: {
  data: { day: string; lower: number; upper: number }[];
  lower: string;
  upper: string;
  height?: number;
}) {
  const [wrap, width] = useWidth<HTMLDivElement>();
  const inView = useInView(wrap, { once: true, margin: '-40px' });
  const reduce = useReducedMotion();
  const n = data.length;
  const { active, setActive, keyboard } = useActiveIndex(n);

  const innerW = Math.max(0, width - M.left - M.right);
  const innerH = height - M.top - M.bottom;
  const ticks = yTicks(Math.max(0, ...data.map((d) => d.lower + d.upper)));
  const top = ticks[ticks.length - 1];
  const band = n > 0 ? innerW / n : 0;
  const barW = Math.max(2, Math.min(22, band * 0.68));
  const y = (v: number) => M.top + innerH - (v / top) * innerH;
  const baseline = M.top + innerH;
  const cx = (i: number) => M.left + band * i + band / 2;

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left - M.left) / Math.max(1, band));
    setActive(Math.min(n - 1, Math.max(0, i)));
  };
  const labels = xLabelIndices(n, width < 420 ? 4 : 6);
  const total = data.reduce((acc, d) => acc + d.lower + d.upper, 0);

  return (
    <div ref={wrap} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Tokens: ${fmtInt(total)} no período. Use as setas para ver cada dia.`}
          className="block overflow-visible rounded-lg"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setActive(null)}
          {...keyboard}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="var(--line)" />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--viz-tick)" className="tabular">
                {fmtCompact(t)}
              </text>
            </g>
          ))}
          {active !== null && (
            <rect x={M.left + band * active} y={M.top} width={band} height={innerH} fill="var(--accent-soft)" rx={4} />
          )}
          {/* As colunas crescem a partir da base. */}
          <motion.g
            style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}
            initial={{ scaleY: reduce ? 1 : 0 }}
            animate={{ scaleY: reduce || inView ? 1 : 0 }}
            transition={{ duration: 1, ease: EASE }}
          >
            {data.map((d, i) => {
              const x = cx(i) - barW / 2;
              const lowTop = y(d.lower);
              const lowH = baseline - lowTop;
              const upH = Math.max(0, y(d.lower) - y(d.lower + d.upper) - (d.lower > 0 ? 2 : 0));
              return (
                <g key={d.day}>
                  {lowH > 0 && <path d={topRounded(x, lowTop, barW, lowH, d.upper > 0 ? 0 : 4)} fill="var(--viz-1)" />}
                  {upH > 0 && <path d={topRounded(x, y(d.lower + d.upper), barW, upH, 4)} fill="var(--viz-2)" />}
                </g>
              );
            })}
          </motion.g>
          <line x1={M.left} x2={width - M.right} y1={baseline} y2={baseline} stroke="var(--viz-axis)" />
          {labels.map((i) => (
            <text key={i} x={cx(i)} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--viz-tick)" className="tabular">
              {fmtDayShort(data[i]?.day)}
            </text>
          ))}
        </svg>
      )}
      {active !== null && data[active] && (
        <Tooltip
          x={cx(active)}
          width={width}
          title={fmtDayLong(data[active].day)}
          rows={[
            { label: upper, value: fmtInt(data[active].upper), color: 'var(--viz-2)' },
            { label: lower, value: fmtInt(data[active].lower), color: 'var(--viz-1)' },
          ]}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barras ordenadas e funil (HTML: texto de verdade, acessível)
// ---------------------------------------------------------------------------

export interface RankedRow {
  label: string;
  value: number;
}

export function RankedBars({ rows, color = 'var(--viz-1)' }: { rows: RankedRow[]; color?: string }) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="flex flex-col gap-3">
      {rows.map((row, i) => (
        <li key={row.label} className="grid grid-cols-[minmax(6.5rem,11rem)_1fr_auto] items-center gap-3 text-[13px]">
          <span className="truncate text-ink" title={row.label}>
            {row.label}
          </span>
          <span className="relative h-2.5 overflow-hidden rounded-full bg-[var(--viz-track)]" aria-hidden="true">
            <motion.span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ background: color, minWidth: row.value > 0 ? 6 : 0 }}
              initial={{ width: reduce ? `${(row.value / max) * 100}%` : 0 }}
              whileInView={{ width: `${(row.value / max) * 100}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.9, ease: EASE, delay: i * 0.06 }}
            />
          </span>
          <span className="font-mono text-xs text-muted tabular">{fmtInt(row.value)}</span>
        </li>
      ))}
    </ol>
  );
}

export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const reduce = useReducedMotion();
  const first = steps[0]?.value ?? 0;
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step, i) => {
        const share = first > 0 ? step.value / first : null;
        const width = `${(step.value / max) * 100}%`;
        return (
          <li key={step.label} className="grid grid-cols-[minmax(7.5rem,11rem)_1fr_auto] items-center gap-3 text-[13px]">
            <span className="text-ink">{step.label}</span>
            <span className="relative h-3 overflow-hidden rounded-full bg-[var(--viz-track)]" aria-hidden="true">
              <motion.span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  minWidth: step.value > 0 ? 6 : 0,
                  background: `color-mix(in oklab, var(--accent) ${100 - i * 18}%, var(--cyan))`,
                }}
                initial={{ width: reduce ? width : 0 }}
                whileInView={{ width }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, ease: EASE, delay: i * 0.08 }}
              />
            </span>
            <span className="whitespace-nowrap text-right tabular">
              <span className="font-semibold text-ink">{fmtInt(step.value)}</span>
              {i > 0 && share !== null && <span className="ml-1.5 text-xs text-subtle">{fmtPercent(share)}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Minigráfico dos cartões de número
// ---------------------------------------------------------------------------

export function Sparkline({ values, color = 'var(--viz-1)' }: { values: number[]; color?: string }) {
  const uid = svgId(useId());
  const reduce = useReducedMotion();
  if (values.length < 2 || values.every((v) => v === 0)) {
    return <div className="h-9" aria-hidden="true" />;
  }
  const max = Math.max(...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 30 - (v / max) * 26] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('');
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-9 w-full" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L100,32L0,32Z`} fill={`url(#${uid}-g)`} />
      <motion.path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
        initial={reduce ? false : { pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.1, ease: EASE }}
      />
    </svg>
  );
}
