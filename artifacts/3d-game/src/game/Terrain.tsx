import { useMemo } from 'react';
import * as THREE from 'three';

const SIZE = 80;
const SEG = 40;

function noise(x: number, z: number, seed: number): number {
  return Math.sin(x * 0.4 + seed) * Math.cos(z * 0.35 + seed * 0.7) * 0.5 +
    Math.sin(x * 0.9 + seed * 1.3) * Math.cos(z * 0.8 + seed * 0.9) * 0.25 +
    Math.sin(x * 1.8 + seed * 0.4) * Math.cos(z * 1.7 + seed * 1.1) * 0.12;
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
      const nx = x / SIZE;
      const nz = z / SIZE;
      const edge = Math.max(Math.abs(nx), Math.abs(nz)) * 2;
      let h = noise(x * 0.15, z * 0.15, 1.3) * 3.5 + noise(x * 0.08, z * 0.08, 0.7) * 1.5;
      h = h * (1 - Math.pow(Math.max(0, edge - 0.5), 2) * 2);
      h = Math.max(0, h);
      positions.setY(i, h);

      const t = Math.min(1, h / 3.5);
      const r = 0.12 + t * 0.1;
      const g = 0.18 + t * 0.12;
      const b = 0.10 + t * 0.05;
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.0,
    });

    return { geometry: geo, material: mat };
  }, []);

  return (
    <group>
      <mesh geometry={geometry} material={material} receiveShadow />
      <RocksLayer />
      <TreesLayer />
    </group>
  );
}

const ROCKS = [
  { x: -22, z: -8, s: 2.0 }, { x: 24, z: 4, s: 1.4 },
  { x: -6, z: 26, s: 2.5 }, { x: 28, z: -22, s: 1.2 },
  { x: -26, z: 12, s: 1.8 }, { x: 10, z: -28, s: 1.5 },
  { x: -32, z: -6, s: 1.1 }, { x: 32, z: 16, s: 1.6 },
  { x: 6, z: 30, s: 1.3 }, { x: -9, z: -30, s: 1.0 },
];

function RocksLayer() {
  return (
    <group>
      {ROCKS.map((r, i) => (
        <group key={i} position={[r.x, 0.2, r.z]} scale={r.s}>
          <mesh castShadow receiveShadow rotation={[0, i * 0.9, 0]}>
            <dodecahedronGeometry args={[0.7, 0]} />
            <meshStandardMaterial color="#5a5a68" roughness={0.95} metalness={0.05} />
          </mesh>
          <mesh castShadow position={[0.5, -0.1, 0.3]} rotation={[0.2, i * 1.3, 0.1]} scale={0.65}>
            <dodecahedronGeometry args={[0.7, 0]} />
            <meshStandardMaterial color="#4e4e5c" roughness={0.95} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const TREES = [
  { x: -20, z: -20, s: 1.1 }, { x: 22, z: -17, s: 1.3 },
  { x: -27, z: 9, s: 0.95 }, { x: 24, z: 24, s: 1.2 },
  { x: -11, z: 30, s: 1.05 }, { x: 30, z: -9, s: 1.0 },
  { x: -30, z: -27, s: 1.4 }, { x: 16, z: 32, s: 0.85 },
  { x: -34, z: 19, s: 1.0 }, { x: 34, z: 6, s: 1.15 },
  { x: 4, z: -35, s: 1.3 }, { x: -5, z: 35, s: 0.9 },
];

function TreesLayer() {
  return (
    <group>
      {TREES.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]} scale={t.s}>
          <mesh position={[0, 2.0, 0]} castShadow>
            <cylinderGeometry args={[0.22, 0.38, 4, 7]} />
            <meshStandardMaterial color="#2a1a0f" roughness={1} />
          </mesh>
          <mesh position={[0, 5.5, 0]} castShadow>
            <coneGeometry args={[2.2, 5, 7]} />
            <meshStandardMaterial color="#0f2e14" roughness={0.95} />
          </mesh>
          <mesh position={[0, 7.8, 0]} castShadow>
            <coneGeometry args={[1.5, 3.5, 7]} />
            <meshStandardMaterial color="#122e18" roughness={0.95} />
          </mesh>
          <mesh position={[0, 9.5, 0]} castShadow>
            <coneGeometry args={[0.9, 2.5, 6]} />
            <meshStandardMaterial color="#153620" roughness={0.95} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
