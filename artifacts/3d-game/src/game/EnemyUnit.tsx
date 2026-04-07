import { useRef, MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Enemy, ENEMY_STATS } from './types';
import { useGameStore } from './useGameStore';

interface Props {
  enemy: Enemy;
  playerPosition: MutableRefObject<THREE.Vector3>;
}

export function EnemyUnit({ enemy, playerPosition }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const atkCDRef = useRef(enemy.attackCooldown);
  const wobbleRef = useRef(Math.random() * Math.PI * 2);
  const { updateEnemy, gameState } = useGameStore();
  const stats = ENEMY_STATS[enemy.type];

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    if (gameState.phase !== 'playing') return;

    const dt = Math.min(delta, 0.05);
    atkCDRef.current = Math.max(0, atkCDRef.current - dt);
    wobbleRef.current += dt * (enemy.type === 'berserker' ? 2 : 3.5);

    if (enemy.state === 'dead') {
      const scale = Math.max(0, groupRef.current.scale.y - dt * 1.8);
      groupRef.current.scale.set(1 + (1 - scale) * 0.3, scale, 1 + (1 - scale) * 0.3);
      updateEnemy(enemy.id, { deathTimer: enemy.deathTimer - dt });
      return;
    }

    if (enemy.state === 'staggered') {
      updateEnemy(enemy.id, { staggerTimer: Math.max(0, enemy.staggerTimer - dt), state: enemy.staggerTimer - dt <= 0 ? 'chasing' : 'staggered' });
      groupRef.current.position.set(enemy.position.x, 0, enemy.position.z);
      return;
    }

    const ePos = new THREE.Vector3(enemy.position.x, 0, enemy.position.z);
    const pPos = playerPosition.current.clone();
    pPos.y = 0;
    const diff = pPos.clone().sub(ePos);
    const dist = diff.length();

    let newState = enemy.state;
    let newPos = { ...enemy.position };
    let newRot = enemy.rotation;

    if (dist < stats.attackRange + 0.2) {
      newState = 'attacking';
      if (dist > 0.5) {
        diff.normalize();
        newPos.x += diff.x * stats.speed * 0.4 * dt;
        newPos.z += diff.z * stats.speed * 0.4 * dt;
        newRot = Math.atan2(diff.x, diff.z);
      }
    } else if (dist < stats.chaseRange) {
      newState = 'chasing';
      diff.normalize();
      newPos.x += diff.x * stats.speed * dt;
      newPos.z += diff.z * stats.speed * dt;
      newRot = Math.atan2(diff.x, diff.z);
      if (enemy.type === 'berserker') {
        newPos.x += Math.sin(wobbleRef.current * 0.5) * 0.5 * dt;
        newPos.z += Math.cos(wobbleRef.current * 0.3) * 0.5 * dt;
      }
    } else {
      newState = 'idle';
      const home = new THREE.Vector3(enemy.spawnPosition.x, 0, enemy.spawnPosition.z);
      const homeDiff = home.clone().sub(ePos);
      if (homeDiff.length() > 1.5) {
        homeDiff.normalize();
        newPos.x += homeDiff.x * stats.speed * 0.45 * dt;
        newPos.z += homeDiff.z * stats.speed * 0.45 * dt;
      }
    }

    groupRef.current.position.set(newPos.x, 0, newPos.z);
    groupRef.current.rotation.y = newRot;

    if (newState === 'chasing') {
      const bounce = Math.abs(Math.sin(wobbleRef.current * (enemy.type === 'scout' ? 6 : 4)));
      groupRef.current.position.y = bounce * 0.12;
    } else if (newState === 'attacking') {
      groupRef.current.position.y = Math.sin(wobbleRef.current * 5) * 0.04;
    }

    if (
      newState !== enemy.state ||
      Math.abs(newPos.x - enemy.position.x) > 0.005 ||
      Math.abs(newPos.z - enemy.position.z) > 0.005
    ) {
      updateEnemy(enemy.id, { position: newPos, state: newState, rotation: newRot });
    }
  });

  const isDead = enemy.state === 'dead';
  const healthPct = enemy.health / enemy.maxHealth;
  const isBoss = enemy.type === 'boss';

  return (
    <group ref={groupRef} position={[enemy.position.x, 0, enemy.position.z]}>
      {!isDead && (
        <>
          <EnemyBody type={enemy.type} state={enemy.state} wobble={wobbleRef} />
          {!isBoss && (
            <group position={[0, 2.6 * stats.size, 0]}>
              <mesh>
                <boxGeometry args={[1.1, 0.06, 0.01]} />
                <meshBasicMaterial color="#111111" />
              </mesh>
              <mesh
                position={[-(1 - healthPct) * 0.55, 0, 0.005]}
                scale={[healthPct, 1, 1]}
              >
                <boxGeometry args={[1.1, 0.06, 0.01]} />
                <meshBasicMaterial
                  color={healthPct > 0.6 ? '#22dd22' : healthPct > 0.3 ? '#ddcc22' : '#dd2222'}
                />
              </mesh>
            </group>
          )}
          {enemy.state === 'attacking' && !isBoss && (
            <pointLight color="#ff2200" intensity={1.5} distance={4} decay={2} />
          )}
          {isBoss && (
            <pointLight
              color="#8800cc"
              intensity={4}
              distance={12}
              decay={2}
              position={[0, 1.5, 0]}
            />
          )}
        </>
      )}
      {isDead && enemy.deathTimer > 0 && (
        <mesh position={[0, 0.2, 0]} rotation={[Math.PI / 2, 0, Math.random()]}>
          <planeGeometry args={[1.5 * stats.size, 0.8 * stats.size]} />
          <meshBasicMaterial color="#440000" transparent opacity={Math.min(1, enemy.deathTimer)} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

function EnemyBody({ type, state, wobble }: { type: Enemy['type']; state: Enemy['state']; wobble: React.MutableRefObject<number> }) {
  const stats = ENEMY_STATS[type];
  const s = stats.size;
  const isAtk = state === 'attacking';

  if (type === 'boss') {
    return (
      <group scale={s}>
        <mesh position={[0, 0.95, 0]} castShadow>
          <capsuleGeometry args={[0.45, 1.3, 4, 8]} />
          <meshStandardMaterial color="#0a0010" roughness={0.4} metalness={0.7} />
        </mesh>
        <mesh position={[0, 2.0, 0]} castShadow>
          <sphereGeometry args={[0.4, 8, 8]} />
          <meshStandardMaterial color="#1a0020" roughness={0.4} />
        </mesh>
        <mesh position={[0, 1.85, 0]} castShadow>
          <boxGeometry args={[1.2, 0.6, 0.52]} />
          <meshStandardMaterial color="#220044" roughness={0.35} metalness={0.8} />
        </mesh>
        <mesh position={[-0.7, 1.85, 0]} castShadow>
          <boxGeometry args={[0.2, 0.55, 0.52]} />
          <meshStandardMaterial color="#440088" roughness={0.35} metalness={0.7} />
        </mesh>
        <mesh position={[0.7, 1.85, 0]} castShadow>
          <boxGeometry args={[0.2, 0.55, 0.52]} />
          <meshStandardMaterial color="#440088" roughness={0.35} metalness={0.7} />
        </mesh>
        <mesh position={[0.62, 1.55, -0.2]} rotation={[isAtk ? -2.2 : -0.4, 0, 0.2]} castShadow>
          <boxGeometry args={[0.1, 1.5, 0.07]} />
          <meshStandardMaterial color="#cc88ff" roughness={0.1} metalness={1} emissive="#4400aa" emissiveIntensity={0.6} />
        </mesh>
        <mesh position={[0, 2.08, 0]} castShadow>
          <cylinderGeometry args={[0.32, 0.4, 0.2, 8]} />
          <meshStandardMaterial color="#0a0018" roughness={0.3} metalness={0.8} />
        </mesh>
        <mesh position={[0, 2.3, 0]} castShadow>
          <coneGeometry args={[0.38, 0.5, 5]} />
          <meshStandardMaterial color="#1a0035" roughness={0.3} metalness={0.8} />
        </mesh>
        <mesh position={[0, 2.18, 0]}>
          <torusGeometry args={[0.42, 0.04, 6, 12]} />
          <meshBasicMaterial color="#aa44ff" />
        </mesh>
      </group>
    );
  }

  if (type === 'berserker') {
    return (
      <group scale={s}>
        <mesh position={[0, 0.95, 0]} castShadow>
          <capsuleGeometry args={[0.4, 1.2, 4, 8]} />
          <meshStandardMaterial color="#1a0505" roughness={0.55} metalness={0.45} />
        </mesh>
        <mesh position={[0, 2.0, 0]} castShadow>
          <sphereGeometry args={[0.36, 8, 8]} />
          <meshStandardMaterial color="#200808" roughness={0.55} />
        </mesh>
        <mesh position={[0, 1.85, 0]} castShadow>
          <boxGeometry args={[1.05, 0.55, 0.5]} />
          <meshStandardMaterial color="#500c0c" roughness={0.5} metalness={0.5} />
        </mesh>
        <mesh position={[0.55, 1.55, -0.1]} rotation={[isAtk ? -2.0 : -0.3, 0, 0.15]} castShadow>
          <boxGeometry args={[0.09, 1.2, 0.06]} />
          <meshStandardMaterial color="#880000" roughness={0.3} metalness={0.8} />
        </mesh>
        <mesh position={[-0.45, 1.5, 0]} castShadow rotation={[0, 0, -0.1]}>
          <boxGeometry args={[0.5, 0.8, 0.06]} />
          <meshStandardMaterial color="#2a1a1a" roughness={0.5} metalness={0.6} />
        </mesh>
      </group>
    );
  }

  if (type === 'scout') {
    return (
      <group scale={s}>
        <mesh position={[0, 0.82, 0]} castShadow>
          <capsuleGeometry args={[0.28, 1.0, 4, 8]} />
          <meshStandardMaterial color="#280808" roughness={0.6} metalness={0.3} />
        </mesh>
        <mesh position={[0, 1.77, 0]} castShadow>
          <sphereGeometry args={[0.26, 8, 8]} />
          <meshStandardMaterial color="#1e0606" roughness={0.55} />
        </mesh>
        <mesh position={[0, 1.62, 0]} castShadow>
          <boxGeometry args={[0.75, 0.4, 0.38]} />
          <meshStandardMaterial color="#3a0808" roughness={0.5} metalness={0.4} />
        </mesh>
        <mesh position={[0.5, 1.45, -0.1]} rotation={[isAtk ? -1.8 : -0.3, 0, 0.1]} castShadow>
          <boxGeometry args={[0.05, 0.8, 0.04]} />
          <meshStandardMaterial color="#aaaacc" roughness={0.15} metalness={0.95} />
        </mesh>
      </group>
    );
  }

  return (
    <group scale={s}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.33, 1.1, 4, 8]} />
        <meshStandardMaterial color="#111118" roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh position={[0, 1.87, 0]} castShadow>
        <sphereGeometry args={[0.3, 8, 8]} />
        <meshStandardMaterial color="#1a1a22" roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.72, 0]} castShadow>
        <boxGeometry args={[0.9, 0.5, 0.45]} />
        <meshStandardMaterial color="#2a2a4a" roughness={0.4} metalness={0.65} />
      </mesh>
      <mesh position={[-0.5, 1.72, 0]} castShadow>
        <boxGeometry args={[0.65, 0.8, 0.08]} />
        <meshStandardMaterial color="#1a1a2a" roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh position={[0.52, 1.45, -0.1]} rotation={[isAtk ? -1.9 : -0.25, 0, 0.1]} castShadow>
        <boxGeometry args={[0.06, 0.95, 0.05]} />
        <meshStandardMaterial color="#9090a0" roughness={0.2} metalness={0.9} />
      </mesh>
    </group>
  );
}
