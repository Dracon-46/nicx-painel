import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// O painel não abre dentro de outra página (proteção contra clickjacking;
// o GitHub Pages não deixa mandar o cabeçalho frame-ancestors).
if (window.self !== window.top) {
  document.body.textContent = 'O Painel Falkyria não pode ser aberto dentro de outra página.';
  throw new Error('Painel aberto dentro de um frame.');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Respeita "reduzir movimento" do sistema em todas as animações. */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);
