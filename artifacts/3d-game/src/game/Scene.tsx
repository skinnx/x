import { useRef, useCallback, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { KeyboardControls, Stars, Fog } from '@react-three/drei';
import * as THREE from 'three';
import { Controls } from './types';
import { Terrain } from './Terrain';
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
  { name: Controls.attack, keys: ['KeyF', 'Mouse0'] },
  { name: Controls.dodge, keys: ['ShiftLeft', 'ShiftRight'] },
  { name: Controls.block, keys: ['KeyQ'] },
];

function FollowCamera({ targetRef }: { targetRef: React.MutableRefObject<THREE.Vector3> }) {
  const { camera } = useThree();
  const smoothPos = useRef(new THREE.Vector3(0, 7, 10));

  useFrame((_, delta) => {
    const target = targetRef.current;
    const desired = new THREE.Vector3(
      target.x,
      target.y + 7,
      target.z + 10
    );
    smoothPos.current.lerp(desired, 5 * delta);
    camera.position.copy(smoothPos.current);
    camera.lookAt(target.x, target.y + 1.2, target.z);
  });

  return null;
}

function GameWorld() {
  const playerPosRef = useRef(new THREE.Vector3());
  const { enemies, gameState } = useGameStore();

  const handleCameraTarget = useCallback((pos: THREE.Vector3, _angle: number) => {
    playerPosRef.current.copy(pos);
  }, []);

  return (
    <>
      <FollowCamera targetRef={playerPosRef} />
      <WaveManager />
      <Terrain />
      <Player onCameraTarget={handleCameraTarget} />
      {enemies.map((enemy) => (
        <EnemyUnit
          key={enemy.id}
          enemy={enemy}
          playerPosition={playerPosRef}
        />
      ))}
      <ParticleSystem />
      <ambientLight intensity={0.25} color="#3355aa" />
      <directionalLight
        position={[-15, 25, -10]}
        intensity={1.6}
        color="#ffeedd"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={100}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
      />
      <pointLight position={[0, 10, 0]} color="#4466ff" intensity={0.3} distance={40} />
      <fog attach="fog" args={['#060a14', 30, 70]} />
    </>
  );
}

export function GameScene() {
  const { gameState } = useGameStore();
  const isPlaying = gameState.phase === 'playing';

  return (
    <div
      className="w-full h-full"
      onClick={() => {
        if (isPlaying) {
          const store = useGameStore.getState();
          if (!store.player.isAttacking) {
          }
        }
      }}
    >
      <KeyboardControls map={KEY_MAP}>
        <Canvas
          shadows
          camera={{ fov: 60, near: 0.1, far: 120, position: [0, 7, 10] }}
          gl={{ antialias: true, alpha: false }}
          style={{ background: '#030610' }}
        >
          <Suspense fallback={null}>
            <Stars radius={80} depth={50} count={3000} factor={3} fade speed={0.5} />
            {isPlaying && <GameWorld />}
            {!isPlaying && (
              <>
                <ambientLight intensity={0.1} />
                <Stars radius={80} depth={50} count={5000} factor={4} fade speed={1} />
              </>
            )}
          </Suspense>
        </Canvas>
      </KeyboardControls>
    </div>
  );
}
