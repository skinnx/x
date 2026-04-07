import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface Ember {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  brightness: number;
}

const EMBER_COUNT = 60;

export function EmberSystem() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const embers = useMemo<Ember[]>(() => {
    const BRAZIER_POSITIONS = [
      [-18, -18], [18, -18], [-18, 18], [18, 18],
      [0, -22],
    ];
    return Array.from({ length: EMBER_COUNT }, (_, i) => {
      const src = BRAZIER_POSITIONS[i % BRAZIER_POSITIONS.length];
      return {
        position: new THREE.Vector3(
          src[0] + (Math.random() - 0.5) * 1.5,
          2.5 + Math.random() * 0.5,
          src[1] + (Math.random() - 0.5) * 1.5
        ),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.8,
          0.8 + Math.random() * 1.2,
          (Math.random() - 0.5) * 0.8
        ),
        life: Math.random() * 3,
        maxLife: 2.5 + Math.random() * 2,
        size: 0.03 + Math.random() * 0.05,
        brightness: 0.5 + Math.random() * 0.5,
      };
    });
  }, []);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const dt = Math.min(delta, 0.05);

    embers.forEach((e, i) => {
      e.life -= dt;
      if (e.life <= 0) {
        const BRAZIER_POSITIONS = [
          [-18, -18], [18, -18], [-18, 18], [18, 18],
          [0, -22],
        ];
        const src = BRAZIER_POSITIONS[i % BRAZIER_POSITIONS.length];
        e.position.set(
          src[0] + (Math.random() - 0.5) * 1.5,
          2.5 + Math.random() * 0.5,
          src[1] + (Math.random() - 0.5) * 1.5
        );
        e.velocity.set(
          (Math.random() - 0.5) * 0.8,
          0.8 + Math.random() * 1.4,
          (Math.random() - 0.5) * 0.8
        );
        e.life = e.maxLife;
        e.size = 0.03 + Math.random() * 0.05;
      }

      e.velocity.x += (Math.random() - 0.5) * 0.3 * dt;
      e.velocity.z += (Math.random() - 0.5) * 0.3 * dt;
      e.velocity.y *= (1 - 0.1 * dt);
      e.position.addScaledVector(e.velocity, dt);

      const lifePct = e.life / e.maxLife;
      const scale = e.size * (lifePct < 0.15 ? lifePct / 0.15 : 1) * (lifePct < 0.3 ? 1 : Math.sqrt(lifePct));

      dummy.position.copy(e.position);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);

      const brightness = e.brightness * lifePct;
      const color = new THREE.Color(
        Math.min(1, brightness * 1.5),
        brightness * 0.5,
        0
      );
      meshRef.current!.setColorAt(i, color);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, EMBER_COUNT]} renderOrder={1}>
      <sphereGeometry args={[1, 4, 3]} />
      <meshBasicMaterial
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

export function DustMotes() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const motes = useMemo(() => Array.from({ length: 30 }, () => ({
    position: new THREE.Vector3(
      (Math.random() - 0.5) * 40,
      Math.random() * 4 + 0.5,
      (Math.random() - 0.5) * 40
    ),
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 0.15,
      (Math.random() - 0.5) * 0.05,
      (Math.random() - 0.5) * 0.15
    ),
    life: Math.random() * 6,
    maxLife: 4 + Math.random() * 4,
    size: 0.02 + Math.random() * 0.04,
  })), []);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const dt = Math.min(delta, 0.05);

    motes.forEach((m, i) => {
      m.life -= dt;
      if (m.life <= 0) {
        m.position.set((Math.random() - 0.5) * 40, Math.random() * 4 + 0.5, (Math.random() - 0.5) * 40);
        m.life = m.maxLife;
      }
      m.position.addScaledVector(m.velocity, dt);

      const lifePct = m.life / m.maxLife;
      const fadeIn = Math.min(1, lifePct * 8);
      const fadeOut = Math.min(1, (1 - lifePct) * 8);
      const alpha = Math.min(fadeIn, fadeOut);

      dummy.position.copy(m.position);
      dummy.scale.setScalar(m.size * alpha);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      meshRef.current!.setColorAt(i, new THREE.Color(0.7, 0.65, 0.5));
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, 30]}>
      <sphereGeometry args={[1, 3, 2]} />
      <meshBasicMaterial transparent opacity={0.15} blending={THREE.AdditiveBlending} depthWrite={false} />
    </instancedMesh>
  );
}
