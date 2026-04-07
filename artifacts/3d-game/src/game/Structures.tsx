import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function Structures() {
  return (
    <group>
      <RitualCircle />
      <MainAltar />
      <GrandArchway x={0} z={-24} rotY={0} />
      <GrandArchway x={-24} z={0} rotY={Math.PI / 2} />
      <GrandArchway x={24} z={0} rotY={Math.PI / 2} />
      <Brazier x={-18} z={-18} />
      <Brazier x={18} z={-18} />
      <Brazier x={-18} z={18} />
      <Brazier x={18} z={18} />
      <WarriorStatue x={-8} z={-20} rotY={0.3} />
      <WarriorStatue x={8} z={-20} rotY={-0.3} />
      <WallSection x={-14} z={-24} rotY={0} len={10} height={4} crumbled={false} />
      <WallSection x={14} z={-24} rotY={0} len={10} height={4} crumbled={false} />
      <WallSection x={-26} z={-10} rotY={Math.PI / 2} len={12} height={3.5} crumbled={true} />
      <WallSection x={26} z={10} rotY={Math.PI / 2} len={8} height={3} crumbled={true} />
      <WallSection x={-26} z={14} rotY={Math.PI / 2} len={6} height={2.5} crumbled={true} />
      <Pillars />
      <FallenColumns />
      <TorchStands />
      <BoneScatter />
      <SkullPiles />
      <Barrels />
    </group>
  );
}

function RitualCircle() {
  const glowRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.18 + Math.sin(state.clock.elapsedTime * 1.5) * 0.08;
    }
  });
  return (
    <group position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <ringGeometry args={[12, 12.3, 64]} />
        <meshBasicMaterial color="#aa0000" transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>
      <mesh>
        <ringGeometry args={[8, 8.15, 64]} />
        <meshBasicMaterial color="#880000" transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 10, Math.sin(a) * 10, 0]}>
            <circleGeometry args={[0.5, 8]} />
            <meshBasicMaterial color="#cc0000" transparent opacity={0.5} />
          </mesh>
        );
      })}
      <mesh ref={glowRef}>
        <circleGeometry args={[12.5, 64]} />
        <meshBasicMaterial color="#550000" transparent opacity={0.18} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function MainAltar() {
  const fireRef = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    if (fireRef.current) {
      fireRef.current.intensity = 4 + Math.sin(state.clock.elapsedTime * 7) * 1.2 + Math.cos(state.clock.elapsedTime * 11) * 0.6;
    }
  });
  return (
    <group position={[0, 0, -22]}>
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[7, 0.7, 4.5]} />
        <meshStandardMaterial color="#1a1a24" roughness={0.85} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.85, 0]} castShadow>
        <boxGeometry args={[5.5, 0.4, 3.2]} />
        <meshStandardMaterial color="#141420" roughness={0.8} metalness={0.2} />
      </mesh>
      <mesh position={[0, 1.1, 0]} castShadow>
        <boxGeometry args={[4.5, 0.18, 2.5]} />
        <meshStandardMaterial color="#0e0e18" roughness={0.75} metalness={0.25} />
      </mesh>
      {[-1.8, 0, 1.8].map((x, i) => (
        <group key={i} position={[x, 1.2, 0]}>
          <mesh position={[0, 0.4, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.07, 0.8, 6]} />
            <meshStandardMaterial color="#2a2a1a" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.82, 0]}>
            <sphereGeometry args={[0.09, 6, 6]} />
            <meshBasicMaterial color="#ffee88" />
          </mesh>
          <pointLight position={[0, 1, 0]} color="#ffaa22" intensity={0.8} distance={4} decay={2} />
        </group>
      ))}
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[1.5, 0.55, 1.0]} />
        <meshStandardMaterial color="#220000" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[1.2, 0.08, 0.8]} />
        <meshBasicMaterial color="#cc1100" transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <sphereGeometry args={[0.22, 8, 6]} />
        <meshBasicMaterial color="#ff6600" />
      </mesh>
      <pointLight ref={fireRef} position={[0, 2.5, 0]} color="#ff3300" intensity={4} distance={18} decay={2} />
      <pointLight position={[0, 1.8, 0]} color="#ff6600" intensity={2} distance={10} decay={2} />
      {[-2.6, 2.6].map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          <mesh position={[0, 0.6, 0]} castShadow>
            <boxGeometry args={[0.55, 1.2, 0.55]} />
            <meshStandardMaterial color="#1e1e28" roughness={0.9} metalness={0.1} />
          </mesh>
          <mesh position={[0, 1.2, 0]} castShadow>
            <boxGeometry args={[0.65, 0.12, 0.65]} />
            <meshStandardMaterial color="#2a2a34" roughness={0.85} />
          </mesh>
        </group>
      ))}
      {[-3.2, 3.2].map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          <mesh position={[0, 3, 0]} castShadow>
            <cylinderGeometry args={[0.45, 0.55, 6, 8]} />
            <meshStandardMaterial color="#2a2a35" roughness={0.95} metalness={0.05} />
          </mesh>
          <mesh position={[0, 0.25, 0]} castShadow>
            <cylinderGeometry args={[0.6, 0.65, 0.5, 8]} />
            <meshStandardMaterial color="#222230" roughness={0.9} />
          </mesh>
          <mesh position={[0, 6.25, 0]} castShadow>
            <boxGeometry args={[1.1, 0.35, 1.1]} />
            <meshStandardMaterial color="#1e1e28" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function GrandArchway({ x, z, rotY }: { x: number; z: number; rotY: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh position={[-3, 4, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.2, 8, 1.2]} />
        <meshStandardMaterial color="#3a3a46" roughness={0.92} metalness={0.08} />
      </mesh>
      <mesh position={[3, 4, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.2, 8, 1.2]} />
        <meshStandardMaterial color="#3a3a46" roughness={0.92} metalness={0.08} />
      </mesh>
      <mesh position={[-3, 0.3, 0]} castShadow>
        <boxGeometry args={[1.5, 0.6, 1.5]} />
        <meshStandardMaterial color="#2e2e38" roughness={0.9} />
      </mesh>
      <mesh position={[3, 0.3, 0]} castShadow>
        <boxGeometry args={[1.5, 0.6, 1.5]} />
        <meshStandardMaterial color="#2e2e38" roughness={0.9} />
      </mesh>
      <mesh position={[0, 8.2, 0]} castShadow>
        <boxGeometry args={[8.4, 0.9, 1.3]} />
        <meshStandardMaterial color="#323240" roughness={0.9} />
      </mesh>
      {Array.from({ length: 5 }).map((_, i) => {
        const ax = -2 + i * 1.0;
        const ay = 6.8 + Math.sqrt(Math.max(0, 4 - ax * ax * 0.25)) * 0.9;
        return (
          <mesh key={i} position={[ax, ay, 0]} castShadow>
            <boxGeometry args={[0.9, 0.85, 1.25]} />
            <meshStandardMaterial color="#35353f" roughness={0.92} />
          </mesh>
        );
      })}
      {[-3.5, 3.5].map((px, i) => (
        <group key={i} position={[px, 8.0, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.45, 1.1, 0.9]} />
            <meshStandardMaterial color="#28283a" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Brazier({ x, z }: { x: number; z: number }) {
  const fireRef = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    if (fireRef.current) {
      fireRef.current.intensity = 5 + Math.sin(state.clock.elapsedTime * 9 + x) * 1.5 + Math.cos(state.clock.elapsedTime * 13 + z) * 0.8;
    }
  });
  return (
    <group position={[x, 0, z]}>
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.sin(a) * 0.35, 1.1, Math.cos(a) * 0.35]} rotation={[0, 0, Math.sin(a) * 0.25]} castShadow>
            <cylinderGeometry args={[0.05, 0.06, 2.2, 5]} />
            <meshStandardMaterial color="#2a1a08" roughness={0.9} metalness={0.3} />
          </mesh>
        );
      })}
      <mesh position={[0, 2.2, 0]} castShadow>
        <cylinderGeometry args={[0.48, 0.35, 0.55, 8]} />
        <meshStandardMaterial color="#333340" roughness={0.75} metalness={0.35} />
      </mesh>
      <mesh position={[0, 2.52, 0]}>
        <cylinderGeometry args={[0.5, 0.48, 0.12, 8]} />
        <meshStandardMaterial color="#242430" roughness={0.75} metalness={0.4} />
      </mesh>
      <mesh position={[0, 2.68, 0]}>
        <sphereGeometry args={[0.32, 8, 6]} />
        <meshBasicMaterial color="#ff7700" />
      </mesh>
      <mesh position={[0, 2.9, 0]}>
        <sphereGeometry args={[0.22, 6, 5]} />
        <meshBasicMaterial color="#ffee22" />
      </mesh>
      <pointLight ref={fireRef} position={[0, 3.5, 0]} color="#ff8822" intensity={5} distance={16} decay={2} />
      <pointLight position={[0, 2.8, 0]} color="#ff5500" intensity={1.5} distance={6} decay={2} />
    </group>
  );
}

function WarriorStatue({ x, z, rotY }: { x: number; z: number; rotY: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.8, 1.0]} />
        <meshStandardMaterial color="#252530" roughness={0.9} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.95, 0]} castShadow>
        <boxGeometry args={[0.8, 0.3, 0.8]} />
        <meshStandardMaterial color="#1e1e28" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.8, 0]} castShadow>
        <capsuleGeometry args={[0.28, 1.0, 4, 7]} />
        <meshStandardMaterial color="#2a2a38" roughness={0.88} metalness={0.15} />
      </mesh>
      <mesh position={[0, 2.6, 0]} castShadow>
        <boxGeometry args={[0.75, 0.48, 0.36]} />
        <meshStandardMaterial color="#222232" roughness={0.85} metalness={0.2} />
      </mesh>
      <mesh position={[0, 2.9, 0]} castShadow>
        <sphereGeometry args={[0.24, 8, 8]} />
        <meshStandardMaterial color="#282834" roughness={0.85} />
      </mesh>
      <mesh position={[0, 3.05, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.24, 0.12, 8]} />
        <meshStandardMaterial color="#181824" roughness={0.8} metalness={0.3} />
      </mesh>
      <mesh position={[0.44, 2.62, 0]} rotation={[-0.4, 0, 0.15]} castShadow>
        <capsuleGeometry args={[0.1, 0.52, 4, 6]} />
        <meshStandardMaterial color="#222232" roughness={0.88} metalness={0.15} />
      </mesh>
      <mesh position={[-0.38, 2.62, 0.12]} rotation={[-1.2, 0, -0.2]} castShadow>
        <capsuleGeometry args={[0.1, 0.52, 4, 6]} />
        <meshStandardMaterial color="#222232" roughness={0.88} metalness={0.15} />
      </mesh>
      <mesh position={[0.52, 2.35, -0.3]} rotation={[-Math.PI / 3, 0, 0.1]} castShadow>
        <boxGeometry args={[0.05, 1.4, 0.03]} />
        <meshStandardMaterial color="#6a7080" roughness={0.35} metalness={0.75} />
      </mesh>
      <mesh position={[0.52, 2.15, -0.12]} castShadow>
        <boxGeometry args={[0.28, 0.06, 0.05]} />
        <meshStandardMaterial color="#8a7020" roughness={0.3} metalness={0.8} />
      </mesh>
      <pointLight position={[0, 2, 0]} color="#4455aa" intensity={0.4} distance={5} decay={2} />
    </group>
  );
}

function WallSection({ x, z, rotY, len, height, crumbled }: {
  x: number; z: number; rotY: number; len: number; height: number; crumbled: boolean;
}) {
  const merlons = Math.floor(len / 2.5);
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[len, height, 1.0]} />
        <meshStandardMaterial color="#38383f" roughness={0.94} metalness={0.06} />
      </mesh>
      {Array.from({ length: merlons }).map((_, i) => (
        <mesh
          key={i}
          position={[-len / 2 + 1.5 + i * 2.5, height + 0.35, 0]}
          castShadow
        >
          <boxGeometry args={[1.1, 0.7, 1.05]} />
          <meshStandardMaterial color="#303038" roughness={0.94} />
        </mesh>
      ))}
      {crumbled && (
        <>
          <mesh position={[len * 0.3, height * 0.4, 0.2]} rotation={[0.2, 0.3, 0.4]} castShadow>
            <boxGeometry args={[len * 0.35, height * 0.45, 0.9]} />
            <meshStandardMaterial color="#303038" roughness={0.95} />
          </mesh>
          <mesh position={[len * 0.4, 0.2, 0.4]} rotation={[0.1, 0.6, 0.1]} castShadow>
            <boxGeometry args={[1.5, 0.4, 0.9]} />
            <meshStandardMaterial color="#2e2e36" roughness={0.96} />
          </mesh>
        </>
      )}
    </group>
  );
}

const PILLAR_CONFIG = [
  { x: -12, z: -10, h: 7.5, broken: false },
  { x: -7.5, z: -10, h: 4.5, broken: true },
  { x: 12, z: -10, h: 7.5, broken: false },
  { x: 7.5, z: -10, h: 3.5, broken: true },
  { x: -20, z: -5, h: 9, broken: false },
  { x: 20, z: -5, h: 9, broken: false },
  { x: -20, z: 10, h: 7, broken: false },
  { x: 20, z: 10, h: 7, broken: false },
  { x: -12, z: 20, h: 5.5, broken: true },
  { x: 12, z: 20, h: 6.5, broken: false },
];

function Pillars() {
  return (
    <group>
      {PILLAR_CONFIG.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <mesh position={[0, p.h / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.44, 0.55, p.h, 10]} />
            <meshStandardMaterial color="#404050" roughness={0.95} metalness={0.05} />
          </mesh>
          {!p.broken && (
            <mesh position={[0, p.h + 0.25, 0]} castShadow>
              <boxGeometry args={[1.3, 0.45, 1.3]} />
              <meshStandardMaterial color="#35353f" roughness={0.93} />
            </mesh>
          )}
          {p.broken && (
            <mesh position={[0.3, p.h - 0.7, 0.2]} rotation={[0.35, 0.5, 0.5]} castShadow>
              <cylinderGeometry args={[0.42, 0.52, 2.0, 8]} />
              <meshStandardMaterial color="#404050" roughness={0.95} />
            </mesh>
          )}
          <mesh position={[0, 0.28, 0]} castShadow>
            <cylinderGeometry args={[0.68, 0.72, 0.55, 10]} />
            <meshStandardMaterial color="#35353f" roughness={0.92} />
          </mesh>
          <mesh position={[0, p.h / 2, 0]}>
            <cylinderGeometry args={[0.46, 0.46, p.h * 0.92, 10, 1, true]} />
            <meshStandardMaterial color="#484858" roughness={0.9} side={THREE.BackSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const FALLEN = [
  { x: -6, z: -13, rot: 0.4, len: 4 },
  { x: 9, z: -15, rot: 1.1, len: 3.5 },
  { x: -16, z: 4, rot: 0.7, len: 5 },
  { x: 18, z: 7, rot: 2.1, len: 3 },
  { x: -13, z: 22, rot: 0.3, len: 4.5 },
  { x: 13, z: 21, rot: 1.7, len: 3.2 },
  { x: -22, z: -14, rot: 0.9, len: 2.8 },
  { x: 22, z: -16, rot: 2.5, len: 3.5 },
];

function FallenColumns() {
  return (
    <group>
      {FALLEN.map((f, i) => (
        <mesh key={i} position={[f.x, 0.24, f.z]} rotation={[Math.PI / 2, f.rot, 0.15]} castShadow receiveShadow>
          <cylinderGeometry args={[0.4, 0.48, f.len, 8]} />
          <meshStandardMaterial color="#3c3c4a" roughness={0.96} metalness={0.04} />
        </mesh>
      ))}
    </group>
  );
}

const TORCH_DATA = [
  { x: -12, z: -10, h: 7.5 },
  { x: 12, z: -10, h: 7.5 },
  { x: -20, z: -5, h: 9 },
  { x: 20, z: -5, h: 9 },
  { x: -20, z: 10, h: 7 },
  { x: 20, z: 10, h: 7 },
];

function TorchStands() {
  return (
    <group>
      {TORCH_DATA.map((t, i) => (
        <FlickeringTorch key={i} x={t.x} z={t.z} y={t.h + 0.2} index={i} />
      ))}
    </group>
  );
}

function FlickeringTorch({ x, z, y, index }: { x: number; z: number; y: number; index: number }) {
  const lightRef = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    if (lightRef.current) {
      const t = state.clock.elapsedTime;
      lightRef.current.intensity = 3.5 + Math.sin(t * 8 + index * 1.7) * 1.0 + Math.cos(t * 13.3 + index) * 0.4;
    }
  });
  return (
    <group position={[x, y, z]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.055, 0.055, 0.7, 6]} />
        <meshStandardMaterial color="#3d2810" roughness={1} />
      </mesh>
      <mesh position={[0, 0.38, 0]}>
        <cylinderGeometry args={[0.11, 0.09, 0.3, 7]} />
        <meshStandardMaterial color="#6a3010" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.55, 0]}>
        <sphereGeometry args={[0.09, 6, 5]} />
        <meshBasicMaterial color="#ffee44" />
      </mesh>
      <mesh position={[0, 0.68, 0]}>
        <sphereGeometry args={[0.05, 5, 5]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <pointLight ref={lightRef} position={[0, 0.6, 0]} color="#ff8822" intensity={3.5} distance={11} decay={2} />
    </group>
  );
}

const BONES = [
  { x: -3, z: -19, r: 0.5 }, { x: 2, z: -21, r: 1.2 },
  { x: -8, z: -22, r: 2.1 }, { x: 5, z: -18, r: 0.8 },
  { x: -15, z: -14, r: 0.3 }, { x: 16, z: -12, r: 1.9 },
  { x: -22, z: 2, r: 0.7 }, { x: 22, z: -2, r: 1.4 },
];

function BoneScatter() {
  return (
    <group>
      {BONES.map((b, i) => (
        <group key={i}>
          <mesh position={[b.x, 0.05, b.z]} rotation={[Math.PI / 2, b.r, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.06, 0.7, 5]} />
            <meshStandardMaterial color="#bfb8a0" roughness={0.9} />
          </mesh>
          <mesh position={[b.x + 0.3, 0.05, b.z + 0.2]} rotation={[Math.PI / 2, b.r + 1, 0.2]} castShadow>
            <cylinderGeometry args={[0.03, 0.05, 0.5, 5]} />
            <meshStandardMaterial color="#b8b098" roughness={0.9} />
          </mesh>
          {i % 3 === 0 && (
            <mesh position={[b.x - 0.1, 0.12, b.z - 0.1]} rotation={[0, b.r, 0]}>
              <sphereGeometry args={[0.12, 6, 5]} />
              <meshStandardMaterial color="#b5ae98" roughness={0.9} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

function SkullPiles() {
  const positions = [
    { x: -2.5, z: -19.5 }, { x: 2.5, z: -19.5 },
    { x: -3.5, z: -22 }, { x: 3.5, z: -22 },
  ];
  return (
    <group>
      {positions.map((p, i) => (
        <group key={i} position={[p.x, 0.18, p.z]}>
          <mesh castShadow rotation={[0, i * 1.2, 0]}>
            <sphereGeometry args={[0.16, 7, 6]} />
            <meshStandardMaterial color="#b0a890" roughness={0.88} />
          </mesh>
          <mesh position={[0, -0.09, 0.08]} castShadow>
            <boxGeometry args={[0.16, 0.1, 0.14]} />
            <meshStandardMaterial color="#b0a890" roughness={0.88} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const BARREL_DATA = [
  { x: -24, z: 4 }, { x: -24, z: 6 }, { x: 23, z: -14 }, { x: 24, z: -12 },
];

function Barrels() {
  return (
    <group>
      {BARREL_DATA.map((b, i) => (
        <mesh key={i} position={[b.x, 0.45, b.z]} rotation={[i % 2 === 0 ? 0 : Math.PI / 2, i * 0.5, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.35, 0.35, 0.9, 8]} />
          <meshStandardMaterial color="#3a2810" roughness={0.9} metalness={0.05} />
        </mesh>
      ))}
    </group>
  );
}
