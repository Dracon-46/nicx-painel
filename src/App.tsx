import type { Session } from '@supabase/supabase-js';
import { LogOut, ShieldAlert } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { LoginView } from './components/LoginView';
import { NicxCore } from './components/Nicx3D/NicxCore';
import { Brand, Busy, Button, Centered, EASE, ThemeToggle } from './components/ui';
import { checkIsAdmin, painelErrorMessage } from './lib/painel';
import { getClient, takeAuthErrorFromUrl } from './lib/supabase';

type Access = { kind: 'checking' } | { kind: 'admin' } | { kind: 'denied' } | { kind: 'error'; message: string };

const client = getClient();

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [access, setAccess] = useState<Access>({ kind: 'checking' });
  const [signingOut, setSigningOut] = useState(false);
  const [urlNotice] = useState(takeAuthErrorFromUrl);
  const reduce = useReducedMotion();

  // Sessão salva e mudanças de login.
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

  // O banco diz se esta conta pode ler os dados.
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setAccess({ kind: 'checking' });
    checkIsAdmin(client)
      .then((isAdmin) => {
        if (!cancelled) setAccess({ kind: isAdmin ? 'admin' : 'denied' });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAccess({ kind: 'error', message: error instanceof Error ? error.message : painelErrorMessage(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await client.auth.signOut();
    } finally {
      setSession(null);
      setSigningOut(false);
    }
  }, []);
  const denyAccess = useCallback(() => setAccess({ kind: 'denied' }), []);

  const screen =
    session === undefined
      ? 'abrindo'
      : !session
        ? 'login'
        : access.kind === 'checking'
          ? 'verificando'
          : access.kind === 'admin'
            ? 'painel'
            : 'negado';

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
          {screen === 'login' && <LoginView client={client} notice={urlNotice} />}
          {screen === 'verificando' && (
            <Centered>
              <Busy label="Verificando seu acesso..." />
            </Centered>
          )}
          {screen === 'negado' && (
            <Centered>
              <div className="card w-full max-w-md p-8 text-center" style={{ boxShadow: 'var(--shadow-float)' }}>
                <NicxCore className="mx-auto h-40 w-40" alert fallbackSize={120} />
                <ShieldAlert size={20} aria-hidden="true" className="mx-auto mb-3 mt-2 text-amber-ink" />
                <h1 className="font-display text-3xl text-ink">
                  {access.kind === 'denied' ? 'Acesso não liberado' : 'Não deu para verificar seu acesso'}
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {access.kind === 'error'
                    ? access.message
                    : 'Esta conta não é de administrador da Falkyria, então os dados ficam fechados.'}
                </p>
                {session?.user?.email && <p className="mt-2 font-mono text-xs text-subtle">{session.user.email}</p>}
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
                    {session?.user?.email && (
                      <span className="hidden max-w-[16rem] truncate font-mono text-[11px] text-subtle sm:block">
                        {session.user.email}
                      </span>
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
                <span>Dados anônimos e agregados. Nada de conversas ou dados pessoais.</span>
              </footer>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
