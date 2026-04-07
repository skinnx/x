import { useMemo } from 'react';
import * as THREE from 'three';

const SIZE = 120;
const SEG = 60;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function noise(x: number, z: number, seed: number): number {
  return (
    Math.sin(x * 0.3 + seed) * Math.cos(z * 0.28 + seed * 0.7) +
    Math.sin(x * 0.7 + seed * 1.3) * Math.cos(z * 0.65 + seed * 0.9) * 0.5 +
    Math.sin(x * 1.4 + seed * 0.4) * Math.cos(z * 1.3 + seed * 1.1) * 0.25
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

      const distFromCenter = Math.sqrt(x * x + z * z);
      const flatRadius = 30;
      const hillStart = 38;
      const hillBlend = smoothstep(flatRadius, hillStart, distFromCenter);

      const rawH = noise(x * 0.12, z * 0.12, 1.3) * 5 + noise(x * 0.07, z * 0.07, 0.7) * 3;
      const h = Math.max(0, rawH) * hillBlend;

      positions.setY(i, h);

      const t = Math.min(1, h / 4.5);
      const isFlat = hillBlend < 0.05;
      if (isFlat) {
        colors[i * 3] = 0.10;
        colors[i * 3 + 1] = 0.13;
        colors[i * 3 + 2] = 0.09;
      } else {
        colors[i * 3] = 0.12 + t * 0.08;
        colors[i * 3 + 1] = 0.16 + t * 0.1;
        colors[i * 3 + 2] = 0.10 + t * 0.04;
      }
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.0,
    });

    return { geometry: geo, material: mat };
  }, []);

  return (
    <group>
      <mesh geometry={geometry} material={material} receiveShadow />
      <ArenaFloor />
      <ArenaBorder />
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
        <meshStandardMaterial color="#151b12" roughness={0.98} metalness={0.0} />
      </mesh>
      <mesh position={[0, 0.008, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[28, 30, 64]} />
        <meshStandardMaterial color="#1a2216" roughness={0.96} metalness={0.0} />
      </mesh>
    </>
  );
}

function ArenaBorder() {
  const segments = 32;
  const radius = 30;
  return (
    <group>
      {Array.from({ length: segments }).map((_, i) => {
        const angle = (i / segments) * Math.PI * 2;
        const x = Math.sin(angle) * radius;
        const z = Math.cos(angle) * radius;
        const showStone = i % 2 === 0;
        return showStone ? (
          <mesh key={i} position={[x, 0.2, z]} castShadow receiveShadow>
            <boxGeometry args={[1.0, 0.4, 1.0]} />
            <meshStandardMaterial color="#3a3a42" roughness={0.95} />
          </mesh>
        ) : null;
      })}
    </group>
  );
}

const ROCKS = [
  { x: -34, z: -8, s: 2.2 }, { x: 36, z: 4, s: 1.6 },
  { x: -8, z: 38, s: 2.8 }, { x: 38, z: -28, s: 1.4 },
  { x: -38, z: 14, s: 2.0 }, { x: 12, z: -40, s: 1.8 },
  { x: -44, z: -8, s: 1.3 }, { x: 44, z: 18, s: 1.9 },
  { x: 8, z: 42, s: 1.5 }, { x: -10, z: -42, s: 1.2 },
  { x: 42, z: 36, s: 1.7 }, { x: -40, z: 34, s: 1.4 },
];

function RocksLayer() {
  return (
    <group>
      {ROCKS.map((r, i) => (
        <group key={i} position={[r.x, 0.3, r.z]} scale={r.s}>
          <mesh castShadow receiveShadow rotation={[0, i * 0.9, 0]}>
            <dodecahedronGeometry args={[0.8, 0]} />
            <meshStandardMaterial color="#5a5a68" roughness={0.96} metalness={0.04} />
          </mesh>
          <mesh castShadow position={[0.6, -0.1, 0.4]} rotation={[0.2, i * 1.3, 0.1]} scale={0.6}>
            <dodecahedronGeometry args={[0.8, 0]} />
            <meshStandardMaterial color="#4a4a58" roughness={0.96} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const TREES = [
  { x: -36, z: -36, s: 1.2 }, { x: 38, z: -32, s: 1.4 },
  { x: -44, z: 12, s: 1.0 }, { x: 40, z: 38, s: 1.3 },
  { x: -14, z: 46, s: 1.1 }, { x: 46, z: -12, s: 1.1 },
  { x: -46, z: -42, s: 1.5 }, { x: 22, z: 48, s: 0.9 },
  { x: -50, z: 26, s: 1.1 }, { x: 50, z: 8, s: 1.2 },
  { x: 6, z: -50, s: 1.4 }, { x: -6, z: 52, s: 1.0 },
  { x: 52, z: -38, s: 1.1 }, { x: -52, z: 38, s: 1.3 },
  { x: 28, z: -52, s: 0.95 }, { x: -30, z: 50, s: 1.05 },
];

function TreesLayer() {
  return (
    <group>
      {TREES.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]} scale={t.s}>
          <mesh position={[0, 2.0, 0]} castShadow>
            <cylinderGeometry args={[0.22, 0.4, 4, 7]} />
            <meshStandardMaterial color="#1f1008" roughness={1} />
          </mesh>
          <mesh position={[0, 5.5, 0]} castShadow>
            <coneGeometry args={[2.4, 5.5, 7]} />
            <meshStandardMaterial color="#0d2812" roughness={0.95} />
          </mesh>
          <mesh position={[0, 8.2, 0]} castShadow>
            <coneGeometry args={[1.7, 4, 7]} />
            <meshStandardMaterial color="#102e16" roughness={0.95} />
          </mesh>
          <mesh position={[0, 10.2, 0]} castShadow>
            <coneGeometry args={[1.0, 3, 6]} />
            <meshStandardMaterial color="#143620" roughness={0.95} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
