import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowRight, Eye, EyeOff, Lock } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useId, useState, type FormEvent } from 'react';
import { painelErrorMessage } from '../lib/painel';
import { NicxCore } from './Nicx3D/NicxCore';
import { Brand, Button, EASE, RevealWords, ThemeToggle } from './ui';

/**
 * Entrada do painel. Só login: as contas de administrador são criadas à mão
 * e o cadastro está desligado no Supabase.
 */
export function LoginView({
  client,
  notice,
  onSignedIn,
}: {
  client: SupabaseClient;
  notice?: string | null;
  onSignedIn?: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [typingPassword, setTypingPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(notice ?? '');
  const [shake, setShake] = useState(0);
  const reduce = useReducedMotion();
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const { error: authError } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) {
        setError(painelErrorMessage(authError));
        setShake((n) => n + 1);
      } else {
        onSignedIn?.();
      }
    } catch (e) {
      setError(painelErrorMessage(e));
      setShake((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-[100dvh]">
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-5 sm:px-8">
        <Brand />
        <ThemeToggle />
      </header>

      <main className="mx-auto grid min-h-[100dvh] max-w-6xl items-center gap-6 px-5 pb-12 pt-24 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12 lg:pt-12">
        {/* Palco: o Nicx em 3D e o título. */}
        <section aria-labelledby="titulo-painel" className="relative">
          <p className="eyebrow mb-4">Observatório do Nicx · acesso restrito</p>
          <h1 id="titulo-painel" className="font-display text-[clamp(3.2rem,9vw,6.5rem)] leading-[0.92] tracking-[-0.02em] text-ink">
            <RevealWords text="Painel" />{' '}
            <em className="text-accent">
              <RevealWords text="Falkyria" delay={0.12} />
            </em>
          </h1>
          <motion.p
            className="mt-5 max-w-md text-[15px] leading-relaxed text-muted"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.35 }}
          >
            Como o Nicx está sendo usado, com dados anônimos de instalações que deram consentimento.
            Nenhuma conversa ou dado pessoal chega aqui.
          </motion.p>
          <motion.div
            className="relative mx-auto mt-2 aspect-square w-full max-w-[260px] sm:max-w-[360px] lg:mx-0 lg:max-w-[420px]"
            initial={reduce ? false : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.1, ease: EASE, delay: 0.2 }}
          >
            <div
              aria-hidden="true"
              className="absolute inset-[12%] rounded-full blur-3xl"
              style={{ background: 'radial-gradient(circle, var(--glow-a), transparent 70%)' }}
            />
            <NicxCore className="h-full w-full" fallbackSize={230} eyesClosed={typingPassword && !showPassword} alert={Boolean(error)} energy={0.35} />
          </motion.div>
        </section>

        {/* Formulário */}
        <motion.section
          aria-labelledby="titulo-entrar"
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.25 }}
          className="w-full max-w-md justify-self-center lg:justify-self-end"
        >
          <motion.div
            key={shake}
            animate={shake && !reduce ? { x: [0, -10, 9, -6, 4, 0] } : undefined}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="card p-6 sm:p-8"
            style={{ boxShadow: 'var(--shadow-float)' }}
          >
            <div className="mb-6 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent">
                <Lock size={17} aria-hidden="true" />
              </span>
              <div>
                <h2 id="titulo-entrar" className="text-lg font-semibold tracking-tight text-ink">
                  Entrar
                </h2>
                <p className="text-xs text-subtle">Só para administradores da Falkyria.</p>
              </div>
            </div>

            <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5" aria-describedby={error ? errorId : undefined}>
              <div className="flex flex-col gap-2">
                <label htmlFor={emailId} className="text-xs font-medium text-muted">
                  E-mail
                </label>
                <input
                  id={emailId}
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 rounded-xl border border-line-strong bg-canvas/60 px-4 text-[15px] text-ink outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-subtle focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)]"
                  placeholder="voce@exemplo.com"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor={passwordId} className="text-xs font-medium text-muted">
                  Senha
                </label>
                <div className="relative">
                  <input
                    id={passwordId}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setTypingPassword(true)}
                    onBlur={() => setTypingPassword(false)}
                    className="h-12 w-full rounded-xl border border-line-strong bg-canvas/60 pl-4 pr-12 text-[15px] text-ink outline-none transition-[border-color,box-shadow] duration-200 focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Esconder a senha' : 'Mostrar a senha'}
                    aria-pressed={showPassword}
                    className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-subtle transition-colors hover:text-ink"
                  >
                    {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <AnimatePresence initial={false}>
                {error && (
                  <motion.p
                    id={errorId}
                    role="alert"
                    initial={reduce ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="overflow-hidden rounded-xl bg-danger-soft px-4 py-3 text-[13px] leading-relaxed text-danger"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <Button type="submit" variant="primary" disabled={busy} className="group mt-1 w-full">
                {busy ? 'Entrando...' : 'Entrar no painel'}
                <ArrowRight
                  size={16}
                  aria-hidden="true"
                  className="transition-transform duration-300 ease-out-expo group-hover:translate-x-1"
                />
              </Button>
            </form>
          </motion.div>
          <p className="mt-5 text-center text-xs leading-relaxed text-subtle">
            Não há cadastro aberto. O acesso é liberado pela Falkyria.
          </p>
        </motion.section>
      </main>
    </div>
  );
}
