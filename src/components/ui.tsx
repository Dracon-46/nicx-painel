import { Loader2, Monitor, Moon, Sun } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useTheme } from '../lib/theme';

export const EASE = [0.16, 1, 0.3, 1] as const;

// ---------------------------------------------------------------------------
// Marca
// ---------------------------------------------------------------------------

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-2 select-none">
      <span className="signature-dot translate-y-[-0.08em]" aria-hidden="true" />
      <span className="font-semibold tracking-tight text-ink">Falkyria</span>
      {!compact && (
        <>
          <span className="text-subtle" aria-hidden="true">
            /
          </span>
          <span className="text-muted">Painel</span>
        </>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Botões
// ---------------------------------------------------------------------------

type Variant = 'primary' | 'ghost';

export function Button({
  variant = 'ghost',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium transition-[background-color,color,transform,box-shadow] duration-200 ease-out-expo active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100';
  const look =
    variant === 'primary'
      ? 'min-h-11 px-5 bg-accent text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] shadow-[0_8px_24px_-10px_var(--accent)]'
      : 'min-h-9 px-3.5 border border-line bg-surface/70 text-ink hover:bg-surface-2';
  return (
    <button type="button" className={`${base} ${look} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/** Claro, escuro ou o do sistema; o ícone gira na troca. */
export function ThemeToggle() {
  const { choice, cycle } = useTheme();
  const reduce = useReducedMotion();
  const Icon = choice === 'system' ? Monitor : choice === 'light' ? Sun : Moon;
  const label =
    choice === 'system' ? 'Tema: igual ao sistema' : choice === 'light' ? 'Tema: claro' : 'Tema: escuro';
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`${label}. Trocar tema`}
      title={label}
      className="relative grid size-9 place-items-center rounded-full border border-line bg-surface/70 text-muted transition-colors hover:text-ink hover:bg-surface-2"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={choice}
          initial={reduce ? false : { rotate: -90, opacity: 0, scale: 0.6 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { rotate: 90, opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="grid place-items-center"
        >
          <Icon size={16} aria-hidden="true" />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

export function Busy({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-3 text-sm text-muted">
      <Loader2 size={16} aria-hidden="true" className="animate-spin text-accent" />
      {label}
    </div>
  );
}

export function Centered({ children }: { children: ReactNode }) {
  return <main className="flex min-h-[100dvh] items-center justify-center px-4 py-12">{children}</main>;
}

// ---------------------------------------------------------------------------
// Texto em movimento
// ---------------------------------------------------------------------------

/** Título que entra palavra por palavra (sem animação com movimento reduzido). */
export function RevealWords({ text, className = '', delay = 0 }: { text: string; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  const words = text.split(' ');
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, i) => (
          <span key={`${word}-${i}`} className="inline-block overflow-hidden pb-[0.12em] align-bottom">
            <motion.span
              className="inline-block"
              initial={reduce ? false : { y: '105%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.8, ease: EASE, delay: delay + i * 0.06 }}
            >
              {word}
              {i < words.length - 1 ? ' ' : ''}
            </motion.span>
          </span>
        ))}
      </span>
    </span>
  );
}

/** Aparece ao rolar até ele, uma vez. */
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Cabeçalho de seção numerado, estilo editorial. */
export function SectionHeading({ index, id, title, note }: { index: string; id: string; title: string; note?: string }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line pb-4">
      <div className="flex items-baseline gap-4">
        <span className="font-mono text-xs tracking-[0.14em] text-amber-ink tabular" aria-hidden="true">
          {index}
        </span>
        <h2 id={id} className="font-display text-[clamp(1.7rem,3.2vw,2.4rem)] leading-none tracking-tight text-ink">
          {title}
        </h2>
      </div>
      {note && <p className="text-xs text-subtle">{note}</p>}
    </header>
  );
}
