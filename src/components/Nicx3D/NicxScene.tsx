import { Environment, Lightformer, MeshDistortMaterial } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

/*
 * Nicx em 3D: gelatina ciano translúcida, dois olhinhos e o núcleo azul
 * flutuando dentro. Sem boca: a expressão vem dos olhos, do balanço da
 * gelatina e do núcleo. Carregado sob demanda (este módulo leva o three).
 */

export interface NicxSceneProps {
  /** 0..1: quanto o Nicx está sendo usado; acelera e acende o núcleo. */
  energy: number;
  /** Olhos fechados (digitando a senha) ou abertos. */
  eyesClosed: boolean;
  /** Algo deu errado: o núcleo fica âmbar. */
  alert: boolean;
  /** Muda a cada atualização dos dados: o Nicx dá um pulinho. */
  bounceKey: number;
  /** Movimento reduzido: um quadro parado, sem animação. */
  still: boolean;
  /** Fora de vista ou aba escondida: para de desenhar. */
  paused: boolean;
}

const CORE_BLUE = new THREE.Color("#2f6dff");
const CORE_AMBER = new THREE.Color('#eda100');

/** Textura de brilho radial, feita em canvas (nada baixado da rede). */
function useGlowTexture() {
  return useMemo(() => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
}

/** Cursor em coordenadas -1..1 da janela inteira (o Nicx olha para ele). */
function usePointer() {
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const move = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, []);
  return pointer;
}

const damp = THREE.MathUtils.damp;
/** Altura dos olhos no rosto; o núcleo flutua mais abaixo. */
const EYES_Y = 0.22;
const CORE_Y = -0.26;

/** Corpo de slime: domo em cima, base achatada e um pouco mais larga. */
function useSlimeGeometry() {
  return useMemo(() => {
    const geometry = new THREE.IcosahedronGeometry(1, 24);
    const position = geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);
      if (v.y < 0) {
        v.y *= 0.7;
        const widen = 1 + 0.14 * (-v.y / 0.7);
        v.x *= widen;
        v.z *= widen;
      }
      position.setXYZ(i, v.x, v.y, v.z);
    }
    geometry.computeVertexNormals();
    return geometry;
  }, []);
}

function Slime({ energy, eyesClosed, alert, bounceKey, still }: Omit<NicxSceneProps, 'paused'>) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const eyes = useRef<THREE.Group>(null);
  const eyeL = useRef<THREE.Group>(null);
  const eyeR = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const coreMat = useRef<THREE.MeshStandardMaterial>(null);
  const halo = useRef<THREE.Sprite>(null);
  const haloMat = useRef<THREE.SpriteMaterial>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const glow = useGlowTexture();
  const geometry = useSlimeGeometry();
  const pointer = usePointer();
  const invalidate = useThree((s) => s.invalidate);

  const bounceAt = useRef(-10);
  const clock = useRef(0);
  useEffect(() => {
    if (bounceKey > 0) bounceAt.current = clock.current;
  }, [bounceKey]);
  // Num quadro parado, redesenhe quando algo mudar.
  useEffect(() => {
    if (still) invalidate();
  }, [still, eyesClosed, alert, energy, invalidate]);

  const coreColor = useRef(new THREE.Color().copy(CORE_BLUE));

  useFrame((_, rawDelta) => {
    const delta = still ? 1 : Math.min(rawDelta, 0.05);
    const t = (clock.current += still ? 0 : delta);
    const e = THREE.MathUtils.clamp(energy, 0, 1);

    // Flutuar e respirar.
    const sinceBounce = t - bounceAt.current;
    const hop = sinceBounce >= 0 && sinceBounce < 0.7 ? Math.sin((sinceBounce / 0.7) * Math.PI) * 0.22 : 0;
    const float = still ? 0 : Math.sin(t * 1.3) * 0.045 + hop;
    const breath = still ? 0 : Math.sin(t * 2.1) * 0.018;
    if (root.current) {
      root.current.position.y = float;
      // Olha para o cursor; de olhos fechados, vira o rosto um pouco.
      const lookX = eyesClosed ? -0.16 : pointer.current.x * 0.42;
      const lookY = eyesClosed ? 0.1 : -pointer.current.y * 0.22;
      root.current.rotation.y = still ? 0 : damp(root.current.rotation.y, lookX, 4, delta);
      root.current.rotation.x = still ? 0 : damp(root.current.rotation.x, lookY, 4, delta);
    }
    if (body.current) {
      const squash = hop > 0 ? -hop * 0.35 : 0;
      body.current.scale.set(1.04 - breath - squash * 0.5, 1 + breath + squash, 1 - breath);
    }
    if (shadow.current) {
      const s = 1.05 - float * 1.6;
      shadow.current.scale.set(s, s, 1);
      (shadow.current.material as THREE.MeshBasicMaterial).opacity = 0.22 * s;
    }

    // Piscar a cada poucos segundos; fechados enquanto a senha é digitada.
    const blinkPhase = (t % 4.2) / 4.2;
    const blinking = !still && blinkPhase > 0.955;
    const open = eyesClosed ? 0.12 : blinking ? 0.1 : 1;
    for (const eye of [eyeL.current, eyeR.current]) {
      if (!eye) continue;
      eye.scale.y = still ? open : damp(eye.scale.y, open, eyesClosed ? 10 : 22, delta);
    }
    if (eyes.current && !still) {
      eyes.current.position.x = damp(eyes.current.position.x, eyesClosed ? 0 : pointer.current.x * 0.05, 6, delta);
      eyes.current.position.y = damp(eyes.current.position.y, EYES_Y + (eyesClosed ? -0.02 : pointer.current.y * 0.03), 6, delta);
    }

    // Núcleo: pulsa mais rápido e mais forte quanto mais uso.
    const speed = 0.9 + e * 2.4;
    const pulse = still ? 0.5 : (Math.sin(t * speed * Math.PI) + 1) / 2;
    coreColor.current.lerp(alert ? CORE_AMBER : CORE_BLUE, still ? 1 : 1 - Math.exp(-4 * delta));
    if (coreMat.current) {
      coreMat.current.emissive.copy(coreColor.current);
      coreMat.current.color.copy(coreColor.current);
      coreMat.current.emissiveIntensity = 0.8 + e * 0.5 + pulse * (0.3 + e * 0.35);
    }
    if (core.current) {
      core.current.position.y = CORE_Y + (still ? 0 : Math.sin(t * 0.9) * 0.05);
      core.current.position.x = still ? 0 : Math.sin(t * 0.7) * 0.03;
      const cs = 1 + pulse * 0.06 * (0.5 + e);
      core.current.scale.setScalar(cs);
    }
    if (halo.current && haloMat.current && core.current) {
      halo.current.position.copy(core.current.position);
      const hs = 0.62 + pulse * 0.22 * (0.4 + e);
      halo.current.scale.setScalar(hs);
      haloMat.current.color.copy(coreColor.current);
      haloMat.current.opacity = 0.3 + pulse * 0.22 + e * 0.12;
    }
  });

  return (
    <group>
      {/* Sombra no chão: gradiente radial barato, sem passe de sombra. */}
      <mesh ref={shadow} position={[0, -0.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2, 2]} />
        <meshBasicMaterial map={glow} color="#0b2a31" transparent opacity={0.22} depthWrite={false} />
      </mesh>

      <group ref={root}>
        {/* Núcleo azul, visto através da gelatina. */}
        <mesh ref={core} position={[0, CORE_Y, 0]} renderOrder={1}>
          <sphereGeometry args={[0.2, 32, 32]} />
          <meshStandardMaterial ref={coreMat} color="#3f8cff" emissive="#3f8cff" emissiveIntensity={1.6} roughness={0.35} />
        </mesh>

        {/* Corpo: gelatina translúcida (mistura alfa, sem passe de transmissão). */}
        <mesh ref={body} geometry={geometry} renderOrder={2}>
          <MeshDistortMaterial
            distort={0.09}
            speed={still ? 0 : 1.3}
            color="#5fe4f4"
            emissive="#0fb0cc"
            emissiveIntensity={0.28}
            roughness={0.14}
            metalness={0}
            clearcoat={1}
            clearcoatRoughness={0.12}
            sheen={0.55}
            sheenColor="#e6feff"
            sheenRoughness={0.35}
            transparent
            opacity={0.84}
            depthWrite={false}
            envMapIntensity={1.2}
          />
        </mesh>

        {/* Brilho do núcleo por cima, na cor de verdade (azul ou âmbar). */}
        <sprite ref={halo} renderOrder={4}>
          <spriteMaterial
            ref={haloMat}
            map={glow}
            color="#3f8cff"
            transparent
            opacity={0.6}
            depthWrite={false}
            depthTest={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>

        {/* Olhos: elipses escuras com um ponto de luz, por cima do corpo. */}
        <group ref={eyes} position={[0, EYES_Y, 0]}>
          {[-1, 1].map((side) => (
            <group key={side} ref={side < 0 ? eyeL : eyeR} position={[side * 0.26, 0, 0.965]}>
              <mesh scale={[0.78, 1, 0.42]} renderOrder={3}>
                <sphereGeometry args={[0.1, 24, 16]} />
                <meshStandardMaterial color="#0b2a31" roughness={0.25} metalness={0.1} />
              </mesh>
              <mesh position={[0.026, 0.034, 0.045]} renderOrder={3}>
                <sphereGeometry args={[0.021, 12, 8]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}

/**
 * Desenha a ~30 quadros por segundo: para uma gelatina flutuando não muda
 * nada, e gasta metade da placa de vídeo e da bateria.
 */
function FrameCap({ fps }: { fps: number }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const id = window.setInterval(() => invalidate(), 1000 / fps);
    return () => window.clearInterval(id);
  }, [fps, invalidate]);
  return null;
}

export default function NicxScene(props: NicxSceneProps) {
  const { still, paused } = props;
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0.12, 4.3], fov: 32 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'default' }}
      frameloop={paused ? 'never' : 'demand'}
      style={{ background: 'transparent' }}
      aria-hidden="true"
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 4, 5]} intensity={1.3} />
      <pointLight position={[-2.6, -1.2, 2]} intensity={5} color="#46e3f5" />
      {/* Reflexos de estúdio montados na hora (sem baixar mapas da rede). */}
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[-0.6, 4, 2.6]} scale={[3, 1, 1]} />
        <Lightformer form="circle" intensity={1.6} color="#86ecf7" position={[-4, 0.6, 2]} scale={2.4} />
        <Lightformer form="circle" intensity={0.9} color="#1c5cab" position={[3.5, -1.5, -2]} scale={3} />
        <Lightformer form="circle" intensity={2.4} color="#eda100" position={[3.2, 2.6, 2.2]} scale={0.5} />
      </Environment>
      {!still && !paused && <FrameCap fps={30} />}
      <Slime {...props} />
    </Canvas>
  );
}
