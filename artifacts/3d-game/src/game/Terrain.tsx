import { useMemo, useRef } from 'react';
import * as THREE from 'three';

const TERRAIN_SIZE = 80;
const TERRAIN_SEGMENTS = 30;

function generateHeightMap(size: number): Float32Array {
  const verts = (size + 1) * (size + 1);
  const heights = new Float32Array(verts);
  const freqs = [0.05, 0.12, 0.25];
  const amps = [3.5, 1.5, 0.6];
  const seeds = [1.3, 0.7, 2.1];
  for (let i = 0; i <= size; i++) {
    for (let j = 0; j <= size; j++) {
      let h = 0;
      for (let f = 0; f < freqs.length; f++) {
        const nx = (i / size) * seeds[f] * 10;
        const nz = (j / size) * seeds[f] * 10;
        h += amps[f] * (Math.sin(nx * freqs[f] * 20) * Math.cos(nz * freqs[f] * 20));
      }
      const cx = (i / size - 0.5) * 2;
      const cz = (j / size - 0.5) * 2;
      const d = Math.sqrt(cx * cx + cz * cz);
      h -= d * 2;
      heights[i * (size + 1) + j] = Math.max(0, h);
    }
  }
  return heights;
}

export function Terrain() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(
      TERRAIN_SIZE,
      TERRAIN_SIZE,
      TERRAIN_SEGMENTS,
      TERRAIN_SEGMENTS
    );
    geo.rotateX(-Math.PI / 2);
    
    const heights = generateHeightMap(TERRAIN_SEGMENTS);
    const positions = geo.attributes.position;
    
    for (let i = 0; i < positions.count; i++) {
      const xi = Math.floor(i / (TERRAIN_SEGMENTS + 1));
      const zi = i % (TERRAIN_SEGMENTS + 1);
      const h = heights[xi * (TERRAIN_SEGMENTS + 1) + zi] || 0;
      positions.setY(i, h);
    }
    
    geo.computeVertexNormals();
    return geo;
  }, []);

  const groundMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x2d4a1e),
      roughness: 0.9,
      metalness: 0.0,
    });
    return mat;
  }, []);

  return (
    <group>
      <mesh
        ref={meshRef}
        geometry={geometry}
        material={groundMaterial}
        receiveShadow
      />
      <Rocks />
      <Trees />
    </group>
  );
}

const ROCK_POSITIONS = [
  { x: -15, z: -12, s: 1.5 },
  { x: 18, z: 5, s: 1.1 },
  { x: -8, z: 22, s: 2.0 },
  { x: 25, z: -20, s: 0.9 },
  { x: -22, z: 10, s: 1.7 },
  { x: 10, z: -25, s: 1.2 },
  { x: -30, z: -5, s: 1.0 },
  { x: 30, z: 15, s: 1.4 },
];

function Rocks() {
  return (
    <group>
      {ROCK_POSITIONS.map((r, i) => (
        <mesh
          key={i}
          position={[r.x, 0.3, r.z]}
          scale={[r.s, r.s * 0.7, r.s]}
          castShadow
          receiveShadow
        >
          <dodecahedronGeometry args={[0.8, 0]} />
          <meshStandardMaterial color={0x5a5a6a} roughness={0.9} metalness={0.1} />
        </mesh>
      ))}
    </group>
  );
}

const TREE_POSITIONS = [
  { x: -18, z: -18, s: 1.0 },
  { x: 20, z: -15, s: 1.3 },
  { x: -25, z: 8, s: 0.9 },
  { x: 22, z: 22, s: 1.1 },
  { x: -10, z: 28, s: 1.2 },
  { x: 28, z: -8, s: 1.0 },
  { x: -28, z: -25, s: 1.4 },
  { x: 15, z: 30, s: 0.8 },
  { x: -32, z: 18, s: 1.0 },
  { x: 32, z: 5, s: 1.2 },
];

function Trees() {
  return (
    <group>
      {TREE_POSITIONS.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]} scale={t.s}>
          <mesh position={[0, 1.5, 0]} castShadow>
            <cylinderGeometry args={[0.25, 0.4, 3, 6]} />
            <meshStandardMaterial color={0x3d2b1f} roughness={1} />
          </mesh>
          <mesh position={[0, 4.5, 0]} castShadow>
            <coneGeometry args={[1.8, 4, 7]} />
            <meshStandardMaterial color={0x1a4a2a} roughness={0.9} />
          </mesh>
          <mesh position={[0, 6.5, 0]} castShadow>
            <coneGeometry args={[1.2, 3, 7]} />
            <meshStandardMaterial color={0x1e5530} roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
