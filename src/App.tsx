import type { Session } from '@supabase/supabase-js';
import { LogOut, ShieldAlert, ShieldCheck } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { LoginView } from './components/LoginView';
import { MfaView } from './components/MfaView';
import { NicxCore } from './components/Nicx3D/NicxCore';
import { Brand, Busy, Button, Centered, EASE, ThemeToggle } from './components/ui';
import { audit, fetchAdminStatus, painelErrorMessage, type AdminStatus, type AuditAction } from './lib/painel';
import { getClient, takeAuthErrorFromUrl } from './lib/supabase';

type Access = { kind: 'checking' } | { kind: 'ok'; status: AdminStatus } | { kind: 'error'; message: string };

/** Sem mexer no painel por este tempo, a sessão é encerrada. */
const IDLE_LIMIT_MS = 30 * 60 * 1000;

const client = getClient();

/** Encerra a sessão depois de um tempo sem uso (mouse, teclado, toque, rolagem). */
function useIdleLogout(active: boolean, onIdle: () => void) {
  const last = useRef(0);
  useEffect(() => {
    if (!active) return;
    last.current = Date.now();
    const touch = () => {
      last.current = Date.now();
    };
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true });
    // Confere a cada 30 s e também ao voltar para a aba (o relógio corre com a aba escondida).
    const check = () => {
      if (Date.now() - last.current > IDLE_LIMIT_MS) onIdle();
    };
    const id = window.setInterval(check, 30_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      for (const e of events) window.removeEventListener(e, touch);
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, [active, onIdle]);
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [access, setAccess] = useState<Access>({ kind: 'checking' });
  const [signingOut, setSigningOut] = useState(false);
  const [notice, setNotice] = useState<string | null>(takeAuthErrorFromUrl);
  const reduce = useReducedMotion();

  // Sessão salva (só nesta aba) e mudanças de login.
  useEffect(() => {
    let cancelled = false;
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      if (!cancelled) setSession(next);
    });
    client.auth
      .getSession()
      .then(({ data: current }) => {
        if (!cancelled) setSession(current.session);
      })
      .catch(() => {
        if (!cancelled) setSession(null);
      });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  // A cada sessão nova (login, segundo fator, renovação) o banco diz quem é.
  const token = session?.access_token;
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setAccess((prev) => (prev.kind === 'ok' ? prev : { kind: 'checking' }));
    fetchAdminStatus(client)
      .then((status) => {
        if (!cancelled) setAccess({ kind: 'ok', status });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAccess({ kind: 'error', message: error instanceof Error ? error.message : painelErrorMessage(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const signOut = useCallback(async (reason: AuditAction = 'logout') => {
    setSigningOut(true);
    await audit(client, reason);
    try {
      await client.auth.signOut();
    } finally {
      setSession(null);
      setAccess({ kind: 'checking' });
      setSigningOut(false);
    }
  }, []);

  const verified = access.kind === 'ok' && access.status.admin && access.status.aal === 'aal2';
  const idle = useCallback(() => {
    setNotice('Sessão encerrada depois de 30 minutos sem uso. Entre de novo.');
    void signOut('idle_logout');
  }, [signOut]);
  useIdleLogout(Boolean(session), idle);

  // Registra uma vez por sessão verificada que os dados foram abertos.
  const viewed = useRef<string | null>(null);
  useEffect(() => {
    if (verified && session && viewed.current !== session.user.id) {
      viewed.current = session.user.id;
      void audit(client, 'view');
    }
    if (!session) viewed.current = null;
  }, [verified, session]);

  const denyAccess = useCallback(() => {
    setAccess((prev) => (prev.kind === 'ok' ? { kind: 'ok', status: { ...prev.status, admin: false } } : prev));
  }, []);

  const screen =
    session === undefined
      ? 'abrindo'
      : !session
        ? 'login'
        : access.kind === 'checking'
          ? 'verificando'
          : access.kind === 'error' || !access.status.admin
            ? 'negado'
            : access.status.aal !== 'aal2'
              ? 'segundo-fator'
              : 'painel';

  const email = session?.user?.email ?? '';

  return (
    <>
      <div className="backdrop" aria-hidden="true" />
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2 focus:text-sm"
      >
        Pular para o conteúdo
      </a>
      <AnimatePresence mode="wait">
        <motion.div
          key={screen}
          id="conteudo"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, filter: 'blur(6px)' }}
          transition={{ duration: 0.45, ease: EASE }}
        >
          {screen === 'abrindo' && (
            <Centered>
              <Busy label="Abrindo o painel..." />
            </Centered>
          )}
          {screen === 'login' && (
            <LoginView
              client={client}
              notice={notice}
              onSignedIn={() => {
                setNotice(null);
                void audit(client, 'login');
              }}
            />
          )}
          {screen === 'verificando' && (
            <Centered>
              <Busy label="Verificando seu acesso..." />
            </Centered>
          )}
          {screen === 'segundo-fator' && <MfaView client={client} email={email} onSignOut={() => void signOut()} />}
          {screen === 'negado' && (
            <Centered>
              <div className="card w-full max-w-md p-8 text-center" style={{ boxShadow: 'var(--shadow-float)' }}>
                <NicxCore className="mx-auto h-40 w-40" alert fallbackSize={120} />
                <ShieldAlert size={20} aria-hidden="true" className="mx-auto mb-3 mt-2 text-amber-ink" />
                <h1 className="font-display text-3xl text-ink">
                  {access.kind === 'error' ? 'Não deu para verificar seu acesso' : 'Acesso não liberado'}
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {access.kind === 'error'
                    ? access.message
                    : 'Esta conta não é de administrador da Falkyria, então os dados ficam fechados.'}
                </p>
                {email && <p className="mt-2 font-mono text-xs text-subtle">{email}</p>}
                <Button onClick={() => void signOut()} disabled={signingOut} className="mt-6">
                  <LogOut size={14} aria-hidden="true" /> Sair
                </Button>
              </div>
            </Centered>
          )}
          {screen === 'painel' && (
            <div className="min-h-[100dvh]">
              <header className="sticky top-0 z-20 border-b border-line bg-[var(--header-bg)] backdrop-blur-xl">
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3 sm:px-8">
                  <Brand />
                  <div className="flex items-center gap-2">
                    <span
                      className="hidden items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--success)_12%,transparent)] px-2.5 py-1 text-[11px] font-medium text-success md:inline-flex"
                      title="Sessão verificada com o app autenticador"
                    >
                      <ShieldCheck size={12} aria-hidden="true" /> Verificado
                    </span>
                    {email && (
                      <span className="hidden max-w-[16rem] truncate font-mono text-[11px] text-subtle sm:block">{email}</span>
                    )}
                    <ThemeToggle />
                    <Button onClick={() => void signOut()} disabled={signingOut} aria-label="Sair do painel">
                      <LogOut size={14} aria-hidden="true" />
                      <span className="hidden sm:inline">Sair</span>
                    </Button>
                  </div>
                </div>
              </header>
              <main className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
                <Dashboard client={client} onAccessDenied={denyAccess} />
              </main>
              <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-8 text-xs text-subtle sm:px-8">
                <Brand compact />
                <span>Dados anônimos e agregados. A sessão fecha com a aba ou depois de 30 minutos sem uso.</span>
              </footer>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
