import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Enemy } from './types';
import { useGameStore } from './useGameStore';

const CHASE_SPEED = 3.5;
const ATTACK_RANGE = 2.5;
const CHASE_RANGE = 20;
const ATTACK_COOLDOWN = 1.5;

interface EnemyUnitProps {
  enemy: Enemy;
  playerPosition: React.MutableRefObject<THREE.Vector3>;
}

export function EnemyUnit({ enemy, playerPosition }: EnemyUnitProps) {
  const meshRef = useRef<THREE.Group>(null);
  const attackCooldownRef = useRef(enemy.attackCooldown);
  const wobbleRef = useRef(0);
  const fadeRef = useRef(1);
  const { updateEnemy, gameState } = useGameStore();

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    if (gameState.phase !== 'playing') return;
    if (enemy.state === 'dead') {
      fadeRef.current = Math.max(0, fadeRef.current - delta * 2);
      meshRef.current.scale.y = Math.max(0, meshRef.current.scale.y - delta * 1.5);
      return;
    }

    attackCooldownRef.current = Math.max(0, attackCooldownRef.current - delta);
    wobbleRef.current += delta * 3;

    const ePos = new THREE.Vector3(enemy.position.x, 0, enemy.position.z);
    const pPos = playerPosition.current.clone();
    pPos.y = 0;
    const diff = pPos.clone().sub(ePos);
    const dist = diff.length();

    let newState = enemy.state;
    let newPos = { ...enemy.position };
    let newRot = enemy.rotation;

    if (dist < ATTACK_RANGE) {
      newState = 'attacking';
      if (attackCooldownRef.current <= 0) {
        attackCooldownRef.current = ATTACK_COOLDOWN;
      }
    } else if (dist < CHASE_RANGE) {
      newState = 'chasing';
      if (dist > 0.1) {
        const dir = diff.normalize();
        newPos.x += dir.x * CHASE_SPEED * delta;
        newPos.z += dir.z * CHASE_SPEED * delta;
        newRot = Math.atan2(dir.x, dir.z);
      }
    } else {
      newState = 'idle';
      const home = new THREE.Vector3(enemy.spawnPosition.x, 0, enemy.spawnPosition.z);
      const toDiff = home.sub(ePos);
      if (toDiff.length() > 1) {
        const dir = toDiff.normalize();
        newPos.x += dir.x * CHASE_SPEED * 0.5 * delta;
        newPos.z += dir.z * CHASE_SPEED * 0.5 * delta;
      }
    }

    meshRef.current.position.set(newPos.x, 0, newPos.z);
    meshRef.current.rotation.y = newRot;
    
    if (newState === 'attacking') {
      meshRef.current.position.y = Math.sin(wobbleRef.current * 4) * 0.05;
    } else if (newState === 'chasing') {
      meshRef.current.position.y = Math.abs(Math.sin(wobbleRef.current * 5)) * 0.12;
    }

    if (
      newState !== enemy.state ||
      Math.abs(newPos.x - enemy.position.x) > 0.01 ||
      Math.abs(newPos.z - enemy.position.z) > 0.01
    ) {
      updateEnemy(enemy.id, {
        position: newPos,
        state: newState,
        rotation: newRot,
        attackCooldown: attackCooldownRef.current,
      });
    }
  });

  const healthPct = enemy.health / enemy.maxHealth;
  const isDead = enemy.state === 'dead';

  return (
    <group ref={meshRef} position={[enemy.position.x, 0, enemy.position.z]}>
      {!isDead && (
        <>
          <mesh position={[0, 0.9, 0]} castShadow>
            <capsuleGeometry args={[0.35, 1.0, 4, 8]} />
            <meshStandardMaterial color="#1a0a0a" roughness={0.7} metalness={0.4} />
          </mesh>
          <mesh position={[0, 1.85, 0]} castShadow>
            <sphereGeometry args={[0.3, 8, 8]} />
            <meshStandardMaterial color="#2a1a1a" roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.7, 0]} castShadow>
            <boxGeometry args={[0.9, 0.48, 0.42]} />
            <meshStandardMaterial color="#3a0000" roughness={0.4} metalness={0.5} />
          </mesh>
          <mesh position={[0.55, 1.45, 0.1]} castShadow rotation={[0, 0, 0.2]}>
            <capsuleGeometry args={[0.08, 0.65, 4, 6]} />
            <meshStandardMaterial color="#8a2222" roughness={0.6} />
          </mesh>
          <mesh position={[0.55, 0.9, 0.1]} castShadow rotation={[0.3, 0, 0.1]}>
            <boxGeometry args={[0.06, 0.9, 0.04]} />
            <meshStandardMaterial color="#a0a0b0" roughness={0.2} metalness={0.9} />
          </mesh>
          <group position={[0, 2.3, 0]}>
            <mesh>
              <boxGeometry args={[1.0, 0.05, 0.005]} />
              <meshBasicMaterial color="#222222" />
            </mesh>
            <mesh position={[(-1 + healthPct) * 0.5, 0, 0.001]} scale={[healthPct, 1, 1]}>
              <boxGeometry args={[1.0, 0.05, 0.005]} />
              <meshBasicMaterial color={healthPct > 0.5 ? '#22aa22' : healthPct > 0.25 ? '#aaaa22' : '#aa2222'} />
            </mesh>
          </group>
          <pointLight color="#ff2200" intensity={enemy.state === 'attacking' ? 1.5 : 0} distance={3} />
        </>
      )}
    </group>
  );
}
