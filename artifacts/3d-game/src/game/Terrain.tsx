import { useMemo } from 'react';
import * as THREE from 'three';

const SIZE = 130;
const SEG = 65;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function noise(x: number, z: number, seed: number): number {
  return (
    Math.sin(x * 0.28 + seed) * Math.cos(z * 0.26 + seed * 0.7) +
    Math.sin(x * 0.62 + seed * 1.3) * Math.cos(z * 0.6 + seed * 0.9) * 0.5 +
    Math.sin(x * 1.35 + seed * 0.4) * Math.cos(z * 1.28 + seed * 1.1) * 0.25
  );
}

export function Terrain() {
  const { geometry, material } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const positions = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(positions.count * 3);

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const dist = Math.sqrt(x * x + z * z);
      const blend = smoothstep(28, 42, dist);
      const rawH = noise(x * 0.11, z * 0.11, 1.3) * 6 + noise(x * 0.06, z * 0.06, 0.7) * 3.5;
      const h = Math.max(0, rawH) * blend;
      positions.setY(i, h);

      if (blend < 0.05) {
        colors[i * 3] = 0.10; colors[i * 3 + 1] = 0.12; colors[i * 3 + 2] = 0.09;
      } else {
        const t = Math.min(1, h / 5);
        colors[i * 3] = 0.11 + t * 0.09; colors[i * 3 + 1] = 0.15 + t * 0.1; colors[i * 3 + 2] = 0.09 + t * 0.04;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0.0 });
    return { geometry: geo, material: mat };
  }, []);

  return (
    <group>
      <mesh geometry={geometry} material={material} receiveShadow />
      <ArenaFloor />
      <StonePaving />
      <ArenaBorder />
      <CliffEdges />
      <RocksLayer />
      <TreesLayer />
    </group>
  );
}

function ArenaFloor() {
  return (
    <>
      <mesh position={[0, 0.005, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[30, 64]} />
        <meshStandardMaterial color="#0e1210" roughness={0.97} metalness={0.0} />
      </mesh>
      <mesh position={[0, 0.007, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[24, 30, 64]} />
        <meshStandardMaterial color="#0c0f0d" roughness={0.97} metalness={0.0} />
      </mesh>
    </>
  );
}

const PAVING_TILES = (() => {
  const tiles: { x: number; z: number; w: number; d: number; rot: number }[] = [];
  for (let i = 0; i < 48; i++) {
    const angle = (i / 48) * Math.PI * 2;
    const r = 6 + Math.random() * 14;
    tiles.push({
      x: Math.sin(angle) * r + (Math.random() - 0.5) * 3,
      z: Math.cos(angle) * r + (Math.random() - 0.5) * 3,
      w: 1.2 + Math.random() * 1.4,
      d: 0.9 + Math.random() * 1.1,
      rot: Math.random() * Math.PI,
    });
  }
  return tiles;
})();

function StonePaving() {
  return (
    <group>
      {PAVING_TILES.map((t, i) => (
        <mesh key={i} position={[t.x, 0.012, t.z]} rotation={[-Math.PI / 2, 0, t.rot]} receiveShadow>
          <planeGeometry args={[t.w, t.d]} />
          <meshStandardMaterial
            color={i % 3 === 0 ? '#181d1a' : i % 3 === 1 ? '#141816' : '#111410'}
            roughness={0.95}
            metalness={0.02}
          />
        </mesh>
      ))}
      <mesh position={[0, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[5, 32]} />
        <meshStandardMaterial color="#0f1210" roughness={0.93} metalness={0.04} />
      </mesh>
    </group>
  );
}

function ArenaBorder() {
  return (
    <group>
      {Array.from({ length: 48 }).map((_, i) => {
        const angle = (i / 48) * Math.PI * 2;
        const x = Math.sin(angle) * 29.5;
        const z = Math.cos(angle) * 29.5;
        const w = 1.0 + (i % 3) * 0.2;
        const h = 0.35 + (i % 2) * 0.15;
        return (
          <mesh key={i} position={[x, h / 2, z]} rotation={[0, angle + Math.PI / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, h, 0.9]} />
            <meshStandardMaterial color={i % 4 === 0 ? '#303040' : '#282835'} roughness={0.95} />
          </mesh>
        );
      })}
    </group>
  );
}

function CliffEdges() {
  return (
    <group>
      {Array.from({ length: 24 }).map((_, i) => {
        const angle = (i / 24) * Math.PI * 2;
        const r = 34 + Math.random() * 3;
        const x = Math.sin(angle) * r;
        const z = Math.cos(angle) * r;
        const h = 1.5 + Math.random() * 3;
        return (
          <mesh key={i} position={[x, h / 2, z]} rotation={[0, angle + Math.random() * 0.5, 0]} castShadow receiveShadow>
            <boxGeometry args={[3.5 + Math.random() * 2, h, 2 + Math.random() * 2]} />
            <meshStandardMaterial color="#1e2020" roughness={0.97} metalness={0.03} />
          </mesh>
        );
      })}
    </group>
  );
}

const ROCKS = [
  { x: -36, z: -8, s: 2.4 }, { x: 38, z: 4, s: 1.7 }, { x: -9, z: 40, s: 2.9 },
  { x: 40, z: -30, s: 1.5 }, { x: -40, z: 16, s: 2.1 }, { x: 14, z: -42, s: 1.9 },
  { x: -46, z: -9, s: 1.4 }, { x: 46, z: 20, s: 2.0 }, { x: 9, z: 44, s: 1.6 },
  { x: -11, z: -44, s: 1.3 }, { x: 44, z: 38, s: 1.8 }, { x: -42, z: 36, s: 1.5 },
];

function RocksLayer() {
  return (
    <group>
      {ROCKS.map((r, i) => (
        <group key={i} position={[r.x, 0.3, r.z]} scale={r.s}>
          <mesh castShadow receiveShadow rotation={[0, i * 0.9, 0]}>
            <dodecahedronGeometry args={[0.9, 0]} />
            <meshStandardMaterial color="#3c3c4a" roughness={0.97} metalness={0.03} />
          </mesh>
          <mesh castShadow position={[0.7, -0.15, 0.5]} rotation={[0.2, i * 1.3, 0.1]} scale={0.65}>
            <dodecahedronGeometry args={[0.9, 0]} />
            <meshStandardMaterial color="#343448" roughness={0.97} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const TREES = [
  { x: -38, z: -38, s: 1.3 }, { x: 40, z: -34, s: 1.5 }, { x: -46, z: 14, s: 1.1 },
  { x: 42, z: 40, s: 1.4 }, { x: -16, z: 48, s: 1.2 }, { x: 48, z: -14, s: 1.1 },
  { x: -48, z: -44, s: 1.6 }, { x: 24, z: 50, s: 1.0 }, { x: -52, z: 28, s: 1.1 },
  { x: 52, z: 10, s: 1.3 }, { x: 8, z: -52, s: 1.5 }, { x: -8, z: 54, s: 1.0 },
  { x: 54, z: -40, s: 1.2 }, { x: -54, z: 40, s: 1.4 }, { x: 30, z: -54, s: 1.1 },
  { x: -32, z: 52, s: 1.2 }, { x: 58, z: -20, s: 0.9 }, { x: -58, z: 20, s: 1.0 },
];

function TreesLayer() {
  return (
    <group>
      {TREES.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]} scale={t.s}>
          <mesh position={[0, 2.2, 0]} castShadow>
            <cylinderGeometry args={[0.24, 0.42, 4.5, 7]} />
            <meshStandardMaterial color="#1a0c06" roughness={1} />
          </mesh>
          <mesh position={[0, 6.0, 0]} castShadow>
            <coneGeometry args={[2.6, 6, 7]} />
            <meshStandardMaterial color="#0b2210" roughness={0.96} />
          </mesh>
          <mesh position={[0, 9.2, 0]} castShadow>
            <coneGeometry args={[1.85, 4.5, 7]} />
            <meshStandardMaterial color="#0e2814" roughness={0.96} />
          </mesh>
          <mesh position={[0, 11.5, 0]} castShadow>
            <coneGeometry args={[1.1, 3.2, 6]} />
            <meshStandardMaterial color="#123018" roughness={0.96} />
          </mesh>
          <mesh position={[0, 13.2, 0]} castShadow>
            <coneGeometry args={[0.6, 2, 6]} />
            <meshStandardMaterial color="#163820" roughness={0.96} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
