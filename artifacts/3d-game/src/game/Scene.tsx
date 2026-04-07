import { useRef, useCallback, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { KeyboardControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { Controls } from './types';
import { Terrain } from './Terrain';
import { Structures } from './Structures';
import { Player } from './Player';
import { EnemyUnit } from './EnemyUnit';
import { ParticleSystem } from './Particles';
import { WaveManager } from './WaveManager';
import { EmberSystem, DustMotes } from './Embers';
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

function Moon() {
  return (
    <group position={[-80, 55, -120]}>
      <mesh>
        <sphereGeometry args={[8, 16, 12]} />
        <meshBasicMaterial color="#dde8ff" />
      </mesh>
      <mesh>
        <sphereGeometry args={[9.5, 16, 12]} />
        <meshBasicMaterial color="#aac8ff" transparent opacity={0.06} />
      </mesh>
      <mesh>
        <sphereGeometry args={[12, 16, 12]} />
        <meshBasicMaterial color="#8ab0ee" transparent opacity={0.03} />
      </mesh>
      <pointLight color="#c8d8ff" intensity={1.2} distance={400} decay={0.1} />
    </group>
  );
}

function DistantMountains() {
  const mountains = [
    { x: -120, z: -80, w: 60, h: 35 },
    { x: -60, z: -100, w: 45, h: 28 },
    { x: 20, z: -110, w: 70, h: 40 },
    { x: 90, z: -95, w: 55, h: 32 },
    { x: 140, z: -70, w: 50, h: 25 },
    { x: -140, z: 30, w: 55, h: 30 },
    { x: 130, z: 50, w: 60, h: 28 },
  ];
  return (
    <group>
      {mountains.map((m, i) => (
        <mesh key={i} position={[m.x, m.h / 2 - 5, m.z]} castShadow={false} receiveShadow={false}>
          <coneGeometry args={[m.w / 2, m.h, 6]} />
          <meshStandardMaterial color="#0a0a14" roughness={1} fog={true} />
        </mesh>
      ))}
    </group>
  );
}

function GodRay() {
  return (
    <mesh position={[-55, 25, -80]} rotation={[0.15, 0.5, -0.2]}>
      <cylinderGeometry args={[2, 8, 60, 6, 1, true]} />
      <meshBasicMaterial
        color="#8899cc"
        transparent
        opacity={0.025}
        side={THREE.BackSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
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

      <ambientLight intensity={0.18} color="#1a2a44" />
      <directionalLight
        position={[-80, 55, -120]}
        intensity={1.1}
        color="#c8d8ff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={130}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-bias={-0.0008}
      />
      <directionalLight position={[30, 15, 20]} intensity={0.15} color="#334466" />
      <hemisphereLight args={['#1a2a44', '#080810', 0.35]} />
      <fog attach="fog" args={['#06080f', 40, 90]} />

      <Moon />
      <DistantMountains />
      <GodRay />
      <Terrain />
      <Structures />
      <EmberSystem />
      <DustMotes />
      <Player onCameraTarget={handleCameraTarget} />
      {enemies.map((enemy) => (
        <EnemyUnit key={enemy.id} enemy={enemy} playerPosition={playerPosRef} />
      ))}
      <ParticleSystem />
    </>
  );
}

function MenuScene() {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.03;
    }
  });
  return (
    <>
      <ambientLight intensity={0.08} color="#110022" />
      <directionalLight position={[-10, 20, -5]} intensity={0.6} color="#ff4422" />
      <fog attach="fog" args={['#040008', 22, 65]} />
      <Stars radius={90} depth={60} count={7000} factor={4} fade speed={0.3} />
      <Moon />
      <group ref={groupRef} position={[0, -2, -10]}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh
            key={i}
            position={[Math.sin(i * 1.05) * 8, Math.cos(i * 0.75) * 2, Math.cos(i * 1.05) * 8]}
            rotation={[0.2 + i * 0.3, i * 0.7, 0.1 + i * 0.2]}
          >
            <cylinderGeometry args={[0.4, 0.52, 3.5 + i * 0.4, 8]} />
            <meshStandardMaterial color="#1a1a28" roughness={0.92} />
          </mesh>
        ))}
        {[0, 1, 2].map((i) => (
          <group key={`b${i}`} position={[Math.sin(i * 2.1) * 12, -1, Math.cos(i * 2.1) * 12]}>
            <pointLight color="#ff2200" intensity={2.5} distance={8} decay={2} />
            <mesh>
              <sphereGeometry args={[0.15, 6, 5]} />
              <meshBasicMaterial color="#ff6600" />
            </mesh>
          </group>
        ))}
      </group>
    </>
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
          camera={{ fov: 58, near: 0.1, far: 200, position: [0, 9, 14] }}
          gl={{
            antialias: true,
            alpha: false,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.35,
          }}
          style={{ background: '#030610' }}
        >
          <Suspense fallback={null}>
            <Stars radius={100} depth={70} count={5000} factor={4} fade speed={0.3} />
            {isPlaying ? <GameWorld /> : <MenuScene />}
          </Suspense>
        </Canvas>
      </KeyboardControls>
    </div>
  );
}
