/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const SUPABASE = 'xcazupxhoeoogcksymzg.supabase.co';

/**
 * Política de segurança de conteúdo (CSP) no build: só scripts do próprio
 * site (o script inline do tema entra pelo hash), conexões só com o Supabase
 * da Falkyria, nada de plugins, formulários para fora ou <base> trocado.
 * O GitHub Pages não deixa mandar cabeçalhos, então vai como <meta>.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'painel-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
          .filter((m) => m[1].trim())
          .map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
        const policy = [
          "default-src 'self'",
          `script-src 'self' ${hashes.join(' ')}`,
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self'",
          `connect-src 'self' https://${SUPABASE} wss://${SUPABASE}`,
          "worker-src 'self' blob:",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; ');
        return [
          { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' },
          { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head-prepend' },
        ];
      },
    },
  };
}

/** Publicado no GitHub Pages: https://dracon-46.github.io/nicx-painel/ */
export default defineConfig({
  base: '/nicx-painel/',
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  build: {
    target: 'es2022',
    cssMinify: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // A cena 3D (three) não entra aqui: o import sob demanda já a separa,
          // e um grupo manual puxaria junto dependências do resto do painel.
          groups: [
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
  },
});
