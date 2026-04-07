import { useRef, useCallback, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { KeyboardControls, Stars, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { Controls } from './types';
import { Terrain } from './Terrain';
import { Structures } from './Structures';
import { Player } from './Player';
import { EnemyUnit } from './EnemyUnit';
import { ParticleSystem } from './Particles';
import { WaveManager } from './WaveManager';
import { useGameStore } from './useGameStore';

const KEY_MAP = [
  { name: Controls.forward, keys: ['ArrowUp', 'KeyW'] },
  { name: Controls.back, keys: ['ArrowDown', 'KeyS'] },
  { name: Controls.left, keys: ['ArrowLeft', 'KeyA'] },
  { name: Controls.right, keys: ['ArrowRight', 'KeyD'] },
  { name: Controls.jump, keys: ['Space'] },
  { name: Controls.attack, keys: ['KeyF'] },
  { name: Controls.heavy, keys: ['KeyG'] },
  { name: Controls.block, keys: ['KeyQ'] },
  { name: Controls.lockOn, keys: ['Tab'] },
];

function FollowCamera({ targetRef }: { targetRef: React.MutableRefObject<THREE.Vector3> }) {
  const { camera } = useThree();
  const smoothPos = useRef(new THREE.Vector3(0, 9, 14));
  const shakeRef = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const target = targetRef.current;
    const { gameState } = useGameStore.getState();
    const shake = gameState.screenShake;

    const desired = new THREE.Vector3(target.x, target.y + 9, target.z + 14);
    smoothPos.current.lerp(desired, 5 * delta);

    shakeRef.current.set(
      (Math.random() - 0.5) * shake * 0.5,
      (Math.random() - 0.5) * shake * 0.3,
      0
    );

    camera.position.copy(smoothPos.current).add(shakeRef.current);
    camera.lookAt(target.x, target.y + 1.5, target.z);
  });

  return null;
}

function GameWorld() {
  const playerPosRef = useRef(new THREE.Vector3());
  const { enemies } = useGameStore();

  const handleCameraTarget = useCallback((pos: THREE.Vector3) => {
    playerPosRef.current.copy(pos);
  }, []);

  return (
    <>
      <FollowCamera targetRef={playerPosRef} />
      <WaveManager />

      <ambientLight intensity={0.2} color="#223355" />
      <directionalLight
        position={[-20, 35, -10]}
        intensity={1.4}
        color="#ffeedd"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={120}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-bias={-0.001}
      />
      <directionalLight position={[15, 20, 10]} intensity={0.3} color="#3355aa" />
      <hemisphereLight args={['#334466', '#111122', 0.4]} />
      <fog attach="fog" args={['#050a18', 35, 80]} />

      <Terrain />
      <Structures />
      <Player onCameraTarget={handleCameraTarget} />
      {enemies.map((enemy) => (
        <EnemyUnit key={enemy.id} enemy={enemy} playerPosition={playerPosRef} />
      ))}
      <ParticleSystem />
    </>
  );
}

function MenuScene() {
  return (
    <>
      <ambientLight intensity={0.1} color="#110022" />
      <directionalLight position={[-10, 20, -5]} intensity={0.5} color="#ff4422" />
      <fog attach="fog" args={['#050005', 20, 60]} />
      <Stars radius={80} depth={50} count={6000} factor={4} fade speed={0.5} />
      <FloatingRuins />
    </>
  );
}

function FloatingRuins() {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.04;
    }
  });
  return (
    <group ref={groupRef} position={[0, -2, -8]}>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh
          key={i}
          position={[Math.sin(i * 1.26) * 6, Math.cos(i * 0.9) * 1.5, Math.cos(i * 1.26) * 6]}
          rotation={[Math.random(), Math.random(), Math.random()]}
        >
          <cylinderGeometry args={[0.4, 0.5, 3 + i * 0.5, 8]} />
          <meshStandardMaterial color="#2a2a35" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

export function GameScene() {
  const { gameState } = useGameStore();
  const isPlaying = gameState.phase === 'playing';

  return (
    <div className="w-full h-full">
      <KeyboardControls map={KEY_MAP}>
        <Canvas
          shadows
          camera={{ fov: 58, near: 0.1, far: 130, position: [0, 9, 14] }}
          gl={{
            antialias: true,
            alpha: false,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.2,
          }}
          style={{ background: '#030610' }}
        >
          <Suspense fallback={null}>
            <Stars radius={90} depth={60} count={4000} factor={3.5} fade speed={0.4} />
            {isPlaying ? <GameWorld /> : <MenuScene />}
          </Suspense>
        </Canvas>
      </KeyboardControls>
    </div>
  );
}
