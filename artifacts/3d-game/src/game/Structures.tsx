import { useMemo } from 'react';
import * as THREE from 'three';

const PILLAR_DATA = [
  { x: -12, z: -10, height: 7, broken: false },
  { x: -8, z: -10, height: 5, broken: true },
  { x: 12, z: -10, height: 7, broken: false },
  { x: 8, z: -10, height: 4, broken: true },
  { x: -15, z: 8, height: 6, broken: false },
  { x: 15, z: 8, height: 7, broken: false },
  { x: -12, z: 18, height: 5, broken: true },
  { x: 12, z: 18, height: 6, broken: false },
  { x: -20, z: -5, height: 8, broken: false },
  { x: 20, z: -5, height: 8, broken: false },
];

const TORCH_POSITIONS = [
  { x: -12, z: -10 },
  { x: 12, z: -10 },
  { x: -15, z: 8 },
  { x: 15, z: 8 },
  { x: -20, z: -5 },
  { x: 20, z: -5 },
];

const WALL_SEGMENTS = [
  { x: -10, z: -10, rx: 0, len: 8 },
  { x: 10, z: -10, rx: 0, len: 8 },
  { x: -18, z: 5, rx: 0.3, len: 10 },
];

const DEBRIS = [
  { x: -6, z: -12, rot: 0.4, s: 1.2 },
  { x: 10, z: -14, rot: 1.1, s: 0.8 },
  { x: -16, z: 3, rot: 0.7, s: 1.0 },
  { x: 18, z: 6, rot: 2.1, s: 0.9 },
  { x: -13, z: 20, rot: 0.3, s: 1.1 },
  { x: 13, z: 20, rot: 1.7, s: 0.7 },
];

export function Structures() {
  return (
    <group>
      {PILLAR_DATA.map((p, i) => (
        <Pillar key={i} {...p} />
      ))}
      {TORCH_POSITIONS.map((t, i) => (
        <Torch key={i} x={t.x} z={t.z} />
      ))}
      {WALL_SEGMENTS.map((w, i) => (
        <WallSegment key={i} {...w} />
      ))}
      {DEBRIS.map((d, i) => (
        <DebrisPiece key={i} {...d} />
      ))}
      <Altar />
    </group>
  );
}

function Pillar({ x, z, height, broken }: { x: number; z: number; height: number; broken: boolean }) {
  const stoneColor = '#6e6e7a';
  const darkStone = '#4a4a55';
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.45, 0.55, height, 8]} />
        <meshStandardMaterial color={stoneColor} roughness={0.95} metalness={0.05} />
      </mesh>
      {!broken && (
        <mesh position={[0, height + 0.2, 0]} castShadow>
          <boxGeometry args={[1.2, 0.4, 1.2]} />
          <meshStandardMaterial color={darkStone} roughness={0.9} />
        </mesh>
      )}
      {broken && (
        <mesh position={[0.3, height - 0.5, 0.2]} rotation={[0.3, 0.5, 0.4]} castShadow>
          <cylinderGeometry args={[0.42, 0.52, 1.5, 8]} />
          <meshStandardMaterial color={stoneColor} roughness={0.95} />
        </mesh>
      )}
      <mesh position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.65, 0.7, 0.5, 8]} />
        <meshStandardMaterial color={darkStone} roughness={0.9} />
      </mesh>
    </group>
  );
}

function Torch({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 5.5, z]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.6, 6]} />
        <meshStandardMaterial color="#3d2810" roughness={1} />
      </mesh>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.1, 0.08, 0.25, 6]} />
        <meshStandardMaterial color="#6a3010" roughness={0.8} />
      </mesh>
      <pointLight
        position={[0, 0.5, 0]}
        color="#ff8822"
        intensity={3.5}
        distance={9}
        decay={2}
      />
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.08, 6, 6]} />
        <meshBasicMaterial color="#ffdd44" />
      </mesh>
    </group>
  );
}

function WallSegment({ x, z, rx, len }: { x: number; z: number; rx: number; len: number }) {
  return (
    <group position={[x, 1.5, z]} rotation={[0, rx, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[len, 3, 0.8]} />
        <meshStandardMaterial color="#5a5a64" roughness={0.95} metalness={0.02} />
      </mesh>
      {Array.from({ length: Math.floor(len / 2) }).map((_, i) => (
        <mesh
          key={i}
          position={[-len / 2 + 1 + i * 2, 1.6, 0]}
          castShadow
        >
          <boxGeometry args={[0.7, 0.4, 0.85]} />
          <meshStandardMaterial color="#4a4a52" roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

function DebrisPiece({ x, z, rot, s }: { x: number; z: number; rot: number; s: number }) {
  return (
    <mesh position={[x, 0.15, z]} rotation={[0.1, rot, 0.2]} scale={s} castShadow receiveShadow>
      <boxGeometry args={[1.2, 0.35, 0.7]} />
      <meshStandardMaterial color="#5c5c65" roughness={0.95} />
    </mesh>
  );
}

function Altar() {
  return (
    <group position={[0, 0, -18]}>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[4, 1.0, 3]} />
        <meshStandardMaterial color="#2e2e3a" roughness={0.8} metalness={0.1} />
      </mesh>
      <mesh position={[0, 1.15, 0]} castShadow>
        <boxGeometry args={[3.2, 0.3, 2.2]} />
        <meshStandardMaterial color="#222230" roughness={0.7} metalness={0.15} />
      </mesh>
      <mesh position={[0, 1.32, 0]}>
        <planeGeometry args={[1.5, 1.0]} />
        <meshBasicMaterial color="#aa0000" transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>
      <pointLight position={[0, 2, 0]} color="#ff1100" intensity={3} distance={8} decay={2} />
      <pointLight position={[-2, 3, 0]} color="#ff0000" intensity={1} distance={5} />
      <pointLight position={[2, 3, 0]} color="#ff0000" intensity={1} distance={5} />
    </group>
  );
}
