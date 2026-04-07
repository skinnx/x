import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from './useGameStore';

export function ParticleSystem() {
  const { particles, updateParticles } = useGameStore();

  useFrame((_, delta) => {
    updateParticles(delta);
  });

  return (
    <>
      {particles.map((p) => {
        const opacity = p.life / p.maxLife;
        return (
          <mesh
            key={p.id}
            position={[p.position.x, p.position.y, p.position.z]}
          >
            <sphereGeometry args={[p.size, 4, 4]} />
            <meshBasicMaterial
              color={p.color}
              transparent
              opacity={opacity}
            />
          </mesh>
        );
      })}
    </>
  );
}
