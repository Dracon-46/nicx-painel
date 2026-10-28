import { useReducedMotion } from 'motion/react';
import { Component, lazy, Suspense, useRef, type ReactNode } from 'react';
import { supportsWebGL, useInView, usePageVisible } from '../../lib/hooks';
import type { MascotMood } from '../../lib/mascot';
import { NicxMascot } from '../Mascot/NicxMascot';

const NicxScene = lazy(() => import('./NicxScene'));

export interface NicxCoreProps {
  energy?: number;
  eyesClosed?: boolean;
  alert?: boolean;
  bounceKey?: number;
  className?: string;
  /** Tamanho do mascote 2D usado enquanto o 3D carrega ou sem WebGL. */
  fallbackSize?: number;
}

/** Se o WebGL falhar no meio do caminho, volta para o mascote 2D. */
class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * O Nicx do painel: em 3D quando o navegador tem WebGL, senão o mascote 2D.
 * Para de desenhar fora de vista e com a aba escondida.
 */
export function NicxCore({
  energy = 0.3,
  eyesClosed = false,
  alert = false,
  bounceKey = 0,
  className = '',
  fallbackSize = 180,
}: NicxCoreProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const inView = useInView(ref);
  const visible = usePageVisible();
  const mood: MascotMood = alert ? 'error' : eyesClosed ? 'happy' : 'idle';
  const fallback = (
    <div className="flex h-full w-full items-center justify-center">
      <NicxMascot size={fallbackSize} mood={mood} animated={!reduce} decorative />
    </div>
  );

  return (
    <div ref={ref} className={`relative ${className}`} aria-hidden="true">
      {supportsWebGL() ? (
        <SceneBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <NicxScene
              energy={energy}
              eyesClosed={eyesClosed}
              alert={alert}
              bounceKey={bounceKey}
              still={reduce}
              paused={!inView || !visible}
            />
          </Suspense>
        </SceneBoundary>
      ) : (
        fallback
      )}
    </div>
  );
}
