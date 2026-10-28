/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Publicado no GitHub Pages: https://dracon-46.github.io/nicx-painel/ */
export default defineConfig({
  base: '/nicx-painel/',
  plugins: [react(), tailwindcss()],
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
