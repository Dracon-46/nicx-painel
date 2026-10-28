import { animate, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type RefObject } from 'react';

/** Largura de um elemento, acompanhando redimensionamentos. */
export function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/**
 * Número que sobe do valor anterior até o novo. Com movimento reduzido,
 * mostra o valor final direto.
 */
export function useCountUp(target: number, duration = 0.9): number {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? target : 0);
  const from = useRef(reduce ? target : 0);
  useEffect(() => {
    if (reduce) {
      from.current = target;
      setValue(target);
      return;
    }
    const controls = animate(from.current, target, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        from.current = v;
        setValue(v);
      },
    });
    return () => controls.stop();
  }, [target, duration, reduce]);
  return value;
}

/** Se o elemento está na tela (para pausar o 3D quando sai de vista). */
export function useInView<T extends Element>(ref: RefObject<T | null>, margin = '120px'): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      rootMargin: margin,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, margin]);
  return inView;
}

/** Se a aba está visível. */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}

/**
 * Brilho que segue o cursor dentro de um cartão (variáveis --mx/--my).
 * Só em dispositivos com mouse.
 */
export function useSpotlight<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia('(hover: hover)').matches) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    el.addEventListener('pointermove', move);
    return () => el.removeEventListener('pointermove', move);
  }, []);
  return ref;
}

let webgl: boolean | null = null;

/** Renderizadores que desenham na CPU: o 3D travaria a página inteira. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;

/**
 * Se vale a pena mostrar o Nicx em 3D: precisa de WebGL com placa de vídeo
 * de verdade. Em WebGL por software (acesso remoto, máquina virtual, driver
 * bloqueado) o painel usa o mascote 2D. `localStorage['nicx-painel-3d']`
 * com "sempre" ou "nunca" força a escolha.
 */
export function supportsWebGL(): boolean {
  if (webgl !== null) return webgl;
  try {
    const forced = localStorage.getItem('nicx-painel-3d');
    if (forced === 'sempre' || forced === 'nunca') return (webgl = forced === 'sempre');
  } catch {
    // Sem localStorage, decide pelo navegador.
  }
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) {
      webgl = false;
    } else {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
      webgl = !SOFTWARE_RENDERER.test(renderer);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    webgl = false;
  }
  return webgl;
}
