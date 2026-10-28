# Painel Falkyria

Painel de uso do **Nicx**, a inteligência artificial da Falkyria. Mostra dados
anônimos e agregados, enviados só por instalações que deram consentimento.
Acesso restrito a administradores da Falkyria.

No ar em <https://dracon-46.github.io/nicx-painel/>.

## Desenvolvimento

```bash
npm install
npm run dev        # http://localhost:5173/nicx-painel/
npm test           # testes (Vitest)
npm run build      # checagem de tipos + build em dist/
npm run deploy     # build + publica no branch gh-pages
```

Feito com React, TypeScript, Vite, Tailwind, Motion e React Three Fiber
(o Nicx em 3D, carregado sob demanda; sem WebGL com placa de vídeo, o painel
usa o mascote 2D).

© Falkyria. Todos os direitos reservados.
