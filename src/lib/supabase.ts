import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/*
 * Projeto Supabase da Falkyria. A chave é a pública (publishable), a mesma
 * que vai no app do Nicx: quem decide o que cada conta lê é o RLS do banco.
 */
export const SUPABASE_URL = 'https://xcazupxhoeoogcksymzg.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_udh4J44z3XxDaXlGTYbaIA_iT9NcTQD';

/** Endereço do painel, para onde o link de confirmação do e-mail volta. */
export const PAINEL_URL = new URL(import.meta.env.BASE_URL, window.location.origin).toString();

let client: SupabaseClient | null = null;

export function getClient(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      // A sessão vive só enquanto a aba estiver aberta: fechou, entra de novo.
      persistSession: true,
      storage: window.sessionStorage,
      autoRefreshToken: true,
      // O link de confirmação do e-mail volta com a sessão no endereço.
      detectSessionInUrl: true,
      storageKey: 'nicx-painel-auth',
    },
  });
  return client;
}

/**
 * Erro que o Supabase devolve no endereço quando o link do e-mail falha
 * (expirado, já usado). Lê e limpa o endereço.
 */
export function takeAuthErrorFromUrl(): string | null {
  const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  const params = new URLSearchParams(raw || window.location.search.slice(1));
  const description = params.get('error_description');
  if (!description) return null;
  window.history.replaceState(null, '', window.location.pathname);
  if (/expired|invalid/i.test(description)) {
    return 'O link do e-mail expirou ou já foi usado. Entre com sua senha ou crie a conta de novo.';
  }
  return `O link do e-mail não funcionou (${description}).`;
}
