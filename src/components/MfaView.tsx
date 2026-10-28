import type { SupabaseClient } from '@supabase/supabase-js';
import { KeyRound, LogOut, ShieldCheck, Smartphone } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { audit, painelErrorMessage } from '../lib/painel';
import { Brand, Busy, Button, EASE, ThemeToggle } from './ui';

type Step =
  | { kind: 'loading' }
  | { kind: 'enroll'; factorId: string; qr: string; secret: string }
  | { kind: 'challenge'; factorId: string }
  | { kind: 'error'; message: string };

const FRIENDLY_NAME = 'Painel Falkyria';

/**
 * O supabase-js devolve o QR como `data:image/svg+xml;utf-8,<svg...>` sem
 * codificar: um "#" de cor dentro do SVG corta o endereço e a imagem quebra.
 * Tira o prefixo e codifica o SVG.
 */
export function qrSource(qr: string): string {
  const svg = qr.replace(/^data:image\/svg\+xml;utf-?8,/i, '');
  return svg.startsWith('data:') ? svg : `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Segundo fator: na primeira vez cadastra um app autenticador (Google
 * Authenticator, Microsoft Authenticator, 1Password...) pelo QR code; depois
 * pede o código de 6 dígitos a cada entrada. Sem isso o banco não libera
 * nenhum dado.
 */
export function MfaView({ client, email, onSignOut }: { client: SupabaseClient; email: string; onSignOut: () => void }) {
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const reduce = useReducedMotion();
  const codeId = useId();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: listError } = await client.auth.mfa.listFactors();
      if (listError) throw listError;
      const verified = data.totp[0];
      if (verified) {
        if (!cancelled) setStep({ kind: 'challenge', factorId: verified.id });
        return;
      }
      // Cadastro abandonado antes deixa um fator não verificado: limpa e recomeça.
      for (const factor of data.all.filter((f) => f.factor_type === 'totp' && f.status !== 'verified')) {
        await client.auth.mfa.unenroll({ factorId: factor.id });
      }
      const { data: enrolled, error: enrollError } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: FRIENDLY_NAME,
        issuer: 'Falkyria',
      });
      if (enrollError) throw enrollError;
      if (!cancelled) {
        setStep({ kind: 'enroll', factorId: enrolled.id, qr: qrSource(enrolled.totp.qr_code), secret: enrolled.totp.secret });
      }
    })().catch((e: unknown) => {
      if (!cancelled) setStep({ kind: 'error', message: painelErrorMessage(e) });
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    if (step.kind === 'challenge' || step.kind === 'enroll') input.current?.focus();
  }, [step.kind]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || (step.kind !== 'enroll' && step.kind !== 'challenge')) return;
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) {
      setError('O código tem 6 dígitos.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { error: verifyError } = await client.auth.mfa.challengeAndVerify({ factorId: step.factorId, code: digits });
      if (verifyError) {
        setError(painelErrorMessage(verifyError));
        setCode('');
        input.current?.focus();
        return;
      }
      // A sessão agora é aal2; o App percebe pela mudança de sessão.
      if (step.kind === 'enroll') void audit(client, 'mfa_enrolled');
      void audit(client, 'mfa_verified');
    } catch (e) {
      setError(painelErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const enrolling = step.kind === 'enroll';

  return (
    <div className="relative min-h-[100dvh]">
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-5 sm:px-8">
        <Brand />
        <ThemeToggle />
      </header>
      <main className="mx-auto flex min-h-[100dvh] max-w-xl items-center px-5 pb-12 pt-24 sm:px-8">
        <motion.section
          aria-labelledby="titulo-mfa"
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE }}
          className="card w-full p-6 sm:p-8"
          style={{ boxShadow: 'var(--shadow-float)' }}
        >
          <div className="mb-6 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent">
              {enrolling ? <Smartphone size={17} aria-hidden="true" /> : <ShieldCheck size={17} aria-hidden="true" />}
            </span>
            <div className="min-w-0">
              <h1 id="titulo-mfa" className="text-lg font-semibold tracking-tight text-ink">
                {enrolling ? 'Proteja sua conta' : 'Código de verificação'}
              </h1>
              <p className="truncate font-mono text-[11px] text-subtle">{email}</p>
            </div>
          </div>

          {step.kind === 'loading' && <Busy label="Preparando a verificação..." />}

          {step.kind === 'error' && (
            <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-[13px] leading-relaxed text-danger">
              {step.message}
            </p>
          )}

          {enrolling && (
            <div className="mb-6 grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
              <img
                src={step.qr}
                alt="QR code para cadastrar o Painel Falkyria no app autenticador"
                className="mx-auto size-44 rounded-2xl border border-line bg-white p-2"
              />
              <ol className="list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-muted marker:text-subtle">
                <li>Abra um app autenticador (Google Authenticator, Microsoft Authenticator, 1Password...).</li>
                <li>Escaneie o QR code. Sem câmera? Use a chave abaixo.</li>
                <li>Digite o código de 6 dígitos que o app mostrar.</li>
              </ol>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setShowSecret((v) => !v)}
                  aria-expanded={showSecret}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-accent underline-offset-4 hover:underline"
                >
                  <KeyRound size={13} aria-hidden="true" />
                  {showSecret ? 'Esconder a chave' : 'Mostrar a chave para digitar no app'}
                </button>
                <AnimatePresence initial={false}>
                  {showSecret && (
                    <motion.code
                      initial={reduce ? false : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-2 block break-all rounded-xl bg-surface-2 px-3 py-2 font-mono text-xs text-ink"
                    >
                      {step.secret}
                    </motion.code>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          {(step.kind === 'enroll' || step.kind === 'challenge') && (
            <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
              {step.kind === 'challenge' && (
                <p className="text-[13px] leading-relaxed text-muted">
                  Abra o app autenticador e digite o código do <strong className="text-ink">{FRIENDLY_NAME}</strong>.
                </p>
              )}
              <label htmlFor={codeId} className="text-xs font-medium text-muted">
                Código de 6 dígitos
              </label>
              <input
                ref={input}
                id={codeId}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]*"
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
                className="h-14 rounded-xl border border-line-strong bg-canvas/60 px-4 text-center font-mono text-2xl tracking-[0.5em] text-ink outline-none transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)]"
                aria-invalid={Boolean(error)}
              />
              {error && (
                <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-[13px] text-danger">
                  {error}
                </p>
              )}
              <Button type="submit" variant="primary" disabled={busy} className="w-full">
                {busy ? 'Verificando...' : enrolling ? 'Ativar e entrar' : 'Verificar e entrar'}
              </Button>
            </form>
          )}

          <div className="mt-6 flex justify-center">
            <Button onClick={onSignOut}>
              <LogOut size={14} aria-hidden="true" /> Sair
            </Button>
          </div>
        </motion.section>
      </main>
    </div>
  );
}
