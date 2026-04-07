import { useRef, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import { Controls } from './types';
import { useGameStore } from './useGameStore';
import { v4 as uuidv4 } from 'uuid';

const MOVE_SPEED = 7.5;
const ROT_SPEED = 12;
const DODGE_SPEED = 18;
const DODGE_DURATION = 0.22;
const DODGE_COOLDOWN = 1.0;
const ATTACK_COOLDOWN = 0.52;
const HEAVY_COOLDOWN = 1.1;
const ATTACK_REACH = 3.4;
const HEAVY_REACH = 4.5;
const COMBO_WINDOW = 1.0;
const STAMINA_REGEN = 22;
const ATK_STA = 18;
const HEAVY_STA = 35;
const DODGE_STA = 22;
const BLOCK_STA_PS = 12;

export function Player({ onCameraTarget }: { onCameraTarget: (pos: THREE.Vector3, angle: number) => void }) {
  const meshRef = useRef<THREE.Group>(null);
  const swordGroupRef = useRef<THREE.Group>(null);
  const capeRef = useRef<THREE.Mesh>(null);
  const velRef = useRef(new THREE.Vector3());
  const rotRef = useRef(0);
  const dodgeTimerRef = useRef(0);
  const dodgeDirRef = useRef(new THREE.Vector3());
  const atkTimerRef = useRef(0);
  const dodgeCDRef = useRef(0);
  const isAtkRef = useRef(false);
  const isHeavyRef = useRef(false);
  const swordAngleRef = useRef(-Math.PI / 6);
  const isDodgingRef = useRef(false);
  const invFrameRef = useRef(0);
  const comboRef = useRef(0);
  const lastAtkRef = useRef(0);
  const wobbleRef = useRef(0);
  const swordTrailRef = useRef<THREE.Mesh>(null);
  const trailOpacityRef = useRef(0);

  const [, getKeys] = useKeyboardControls<Controls>();
  const store = useGameStore;

  const spawnHitParticles = useCallback((pos: THREE.Vector3, color: string, count = 10) => {
    for (let i = 0; i < count; i++) {
      store.getState().addParticle({
        id: uuidv4(),
        position: { x: pos.x + (Math.random() - 0.5) * 0.5, y: pos.y + 1 + Math.random() * 0.5, z: pos.z + (Math.random() - 0.5) * 0.5 },
        velocity: { x: (Math.random() - 0.5) * 7, y: Math.random() * 5 + 2, z: (Math.random() - 0.5) * 7 },
        life: Math.random() * 0.4 + 0.25,
        maxLife: 0.65,
        color,
        size: Math.random() * 0.12 + 0.04,
      });
    }
  }, [store]);

  const spawnSparks = useCallback((pos: THREE.Vector3) => {
    for (let i = 0; i < 6; i++) {
      store.getState().addParticle({
        id: uuidv4(),
        position: { x: pos.x, y: pos.y + 1, z: pos.z },
        velocity: { x: (Math.random() - 0.5) * 5, y: Math.random() * 3 + 1, z: (Math.random() - 0.5) * 5 },
        life: 0.2,
        maxLife: 0.2,
        color: i % 2 === 0 ? '#ffee44' : '#ffffff',
        size: 0.06,
      });
    }
  }, [store]);

  const doAttack = useCallback((heavy: boolean) => {
    const staCost = heavy ? HEAVY_STA : ATK_STA;
    if (!store.getState().consumeStamina(staCost)) return;
    if (!meshRef.current) return;

    const now = Date.now();
    const elapsed = (now - lastAtkRef.current) / 1000;
    comboRef.current = elapsed < COMBO_WINDOW ? Math.min(comboRef.current + 1, 4) : 1;
    lastAtkRef.current = now;

    isAtkRef.current = true;
    isHeavyRef.current = heavy;
    atkTimerRef.current = heavy ? HEAVY_COOLDOWN : ATTACK_COOLDOWN;
    trailOpacityRef.current = 1;

    store.getState().setPlayerAttacking(true, heavy, comboRef.current);

    const reach = heavy ? HEAVY_REACH : ATTACK_REACH;
    const arc = heavy ? Math.PI / 1.8 : Math.PI / 2.4;
    const pos = meshRef.current.position;
    const forward = new THREE.Vector3(-Math.sin(rotRef.current), 0, -Math.cos(rotRef.current));

    const { enemies } = store.getState();
    let hitAny = false;
    enemies.forEach((enemy) => {
      if (enemy.state === 'dead') return;
      const ePos = new THREE.Vector3(enemy.position.x, 0, enemy.position.z);
      const diff = ePos.clone().sub(pos);
      if (diff.length() > reach) return;
      diff.normalize();
      if (forward.dot(diff) < Math.cos(arc)) return;

      const baseDmg = heavy ? 45 : 20;
      const comboDmg = baseDmg + (comboRef.current - 1) * (heavy ? 20 : 12);
      const killed = store.getState().damageEnemy(enemy.id, comboDmg);
      spawnHitParticles(ePos, '#cc2200', heavy ? 15 : 10);
      spawnSparks(ePos);
      hitAny = true;

      if (killed) {
        store.getState().incrementKills();
        store.getState().addScore(
          (store.getState().enemies.find(e => e.id === enemy.id)?.maxHealth || 100) * comboRef.current
        );
      }
    });

    if (hitAny) store.getState().triggerScreenShake(heavy ? 0.25 : 0.1);

    setTimeout(() => {
      isAtkRef.current = false;
      isHeavyRef.current = false;
      store.getState().setPlayerAttacking(false);
    }, (heavy ? HEAVY_COOLDOWN : ATTACK_COOLDOWN) * 550);
  }, [store, spawnHitParticles, spawnSparks]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const { gameState, player } = store.getState();
    if (gameState.phase !== 'playing' || !player.isAlive) return;

    const dt = Math.min(delta, 0.05);
    const keys = getKeys();

    if (atkTimerRef.current > 0) atkTimerRef.current -= dt;
    if (dodgeCDRef.current > 0) dodgeCDRef.current -= dt;
    if (invFrameRef.current > 0) invFrameRef.current -= dt;

    store.getState().restoreStamina(STAMINA_REGEN * dt * (player.isBlocking ? 0.3 : 1));
    store.getState().tickEffects(dt);
    wobbleRef.current += dt * 5;

    const pos = meshRef.current.position;

    if (dodgeTimerRef.current > 0) {
      dodgeTimerRef.current -= dt;
      isDodgingRef.current = true;
      pos.addScaledVector(dodgeDirRef.current, DODGE_SPEED * dt);
      pos.y = 0;
      const dodgeRadius = 28.5;
      const dd = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
      if (dd > dodgeRadius) {
        const n = new THREE.Vector3(pos.x, 0, pos.z).normalize();
        pos.x = n.x * dodgeRadius;
        pos.z = n.z * dodgeRadius;
      }
      onCameraTarget(pos, rotRef.current);
      return;
    } else if (isDodgingRef.current) {
      isDodgingRef.current = false;
      store.getState().setPlayerDodging(false);
    }

    const moveDir = new THREE.Vector3();
    if (keys.forward) moveDir.z -= 1;
    if (keys.back) moveDir.z += 1;
    if (keys.left) moveDir.x -= 1;
    if (keys.right) moveDir.x += 1;

    const isMoving = moveDir.lengthSq() > 0;
    const isBlocking = keys.block && !isAtkRef.current;
    if (isBlocking !== player.isBlocking) store.getState().setPlayerBlocking(isBlocking);

    if (isBlocking) {
      store.getState().consumeStamina(BLOCK_STA_PS * dt);
      velRef.current.lerp(new THREE.Vector3(), 8 * dt);
    } else if (isMoving) {
      moveDir.normalize();
      const { player: p } = store.getState();
      let targetAngle: number;
      if (p.lockedTargetId) {
        const locked = store.getState().enemies.find(e => e.id === p.lockedTargetId);
        if (locked && locked.state !== 'dead') {
          targetAngle = Math.atan2(
            -(locked.position.x - pos.x),
            -(locked.position.z - pos.z)
          );
        } else {
          store.getState().setLockTarget(null);
          targetAngle = Math.atan2(-moveDir.x, -moveDir.z);
        }
      } else {
        targetAngle = Math.atan2(-moveDir.x, -moveDir.z);
      }
      let da = targetAngle - rotRef.current;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      rotRef.current += da * ROT_SPEED * dt;
      velRef.current.lerp(moveDir.multiplyScalar(MOVE_SPEED * (isAtkRef.current ? 0.4 : 1)), 9 * dt);
    } else {
      velRef.current.lerp(new THREE.Vector3(), 10 * dt);
    }

    pos.addScaledVector(velRef.current, dt);
    pos.y = 0;
    const arenaRadius = 28.5;
    const flatDist = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
    if (flatDist > arenaRadius) {
      const norm = new THREE.Vector3(pos.x, 0, pos.z).normalize();
      pos.x = norm.x * arenaRadius;
      pos.z = norm.z * arenaRadius;
    }
    meshRef.current.rotation.y = rotRef.current;

    if (capeRef.current) {
      const speed = velRef.current.length();
      capeRef.current.rotation.x = -speed * 0.06 + Math.sin(wobbleRef.current * 0.8) * 0.02;
      capeRef.current.rotation.z = Math.sin(wobbleRef.current * 1.2) * 0.015;
    }

    if (keys.jump && dodgeCDRef.current <= 0 && player.stamina >= DODGE_STA) {
      if (store.getState().consumeStamina(DODGE_STA)) {
        const dDir = isMoving
          ? velRef.current.clone().normalize()
          : new THREE.Vector3(-Math.sin(rotRef.current), 0, -Math.cos(rotRef.current));
        dodgeDirRef.current.copy(dDir);
        dodgeTimerRef.current = DODGE_DURATION;
        dodgeCDRef.current = DODGE_COOLDOWN;
        invFrameRef.current = DODGE_DURATION + 0.1;
        store.getState().setPlayerDodging(true);
      }
    }

    if (keys.heavy && atkTimerRef.current <= 0 && !isAtkRef.current) {
      doAttack(true);
    } else if (keys.attack && atkTimerRef.current <= 0 && !isAtkRef.current) {
      doAttack(false);
    }

    if (keys.lockOn) {
      const { player: p, enemies } = store.getState();
      const living = enemies.filter(e => e.state !== 'dead');
      if (p.lockedTargetId) {
        store.getState().setLockTarget(null);
      } else if (living.length > 0) {
        const nearest = living.reduce((best, e) => {
          const d = Math.sqrt((e.position.x - pos.x) ** 2 + (e.position.z - pos.z) ** 2);
          const bd = Math.sqrt((best.position.x - pos.x) ** 2 + (best.position.z - pos.z) ** 2);
          return d < bd ? e : best;
        });
        store.getState().setLockTarget(nearest.id);
      }
    }

    if (swordGroupRef.current) {
      const ta = isAtkRef.current ? (isHeavyRef.current ? -Math.PI * 0.9 : -Math.PI * 0.75) : -Math.PI / 6;
      swordAngleRef.current += (ta - swordAngleRef.current) * 20 * dt;
      swordGroupRef.current.rotation.x = swordAngleRef.current;
    }

    if (swordTrailRef.current) {
      trailOpacityRef.current = Math.max(0, trailOpacityRef.current - dt * 6);
      const mat = swordTrailRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = trailOpacityRef.current * 0.5;
    }

    const { enemies, player: cp } = store.getState();
    if (invFrameRef.current <= 0) {
      let dmg = 0;
      enemies.forEach((e) => {
        if (e.state !== 'attacking') return;
        const dist = Math.sqrt((pos.x - e.position.x) ** 2 + (pos.z - e.position.z) ** 2);
        if (dist < 2.5) {
          const raw = e.type === 'scout' ? 5 : e.type === 'berserker' ? 18 : e.type === 'boss' ? 25 : 10;
          dmg += raw * dt * (cp.isBlocking ? 0.15 : 1);
        }
      });
      if (dmg > 0) {
        const newHp = cp.health - dmg;
        if (newHp <= 0) store.getState().setPlayerDead();
        else {
          store.getState().setPlayerHealth(newHp);
          if (!cp.isBlocking) {
            store.getState().triggerHitFlash(0.6);
            store.getState().triggerScreenShake(0.35);
          }
        }
      }
    }

    onCameraTarget(pos, rotRef.current);
  });

  const { player } = useGameStore();
  if (!player.isAlive) return null;

  const isBlock = player.isBlocking;
  const isAtk = player.isAttacking;

  return (
    <group ref={meshRef} position={[0, 0, 0]}>
      <mesh position={[0, 0.88, 0]} castShadow>
        <capsuleGeometry args={[0.3, 1.1, 4, 8]} />
        <meshStandardMaterial color="#1a0c06" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[0, 1.65, 0]} castShadow>
        <boxGeometry args={[0.8, 0.42, 0.38]} />
        <meshStandardMaterial color="#7a1515" roughness={0.45} metalness={0.55} />
      </mesh>
      <mesh position={[0.42, 1.65, 0]} castShadow>
        <boxGeometry args={[0.12, 0.38, 0.42]} />
        <meshStandardMaterial color="#5a0f0f" roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh position={[-0.42, 1.65, 0]} castShadow>
        <boxGeometry args={[0.12, 0.38, 0.42]} />
        <meshStandardMaterial color="#5a0f0f" roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh position={[0, 1.88, 0]} castShadow>
        <sphereGeometry args={[0.28, 8, 8]} />
        <meshStandardMaterial color="#c8956c" roughness={0.45} />
      </mesh>
      <mesh position={[0, 1.97, 0]} castShadow>
        <cylinderGeometry args={[0.23, 0.29, 0.13, 8]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh position={[0, 2.06, 0]}>
        <cylinderGeometry args={[0.18, 0.23, 0.08, 8]} />
        <meshStandardMaterial color="#2a2a44" roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh position={[0.6, 1.88, 0]} castShadow rotation={[0, 0, 0.1]}>
        <boxGeometry args={[0.18, 0.18, 0.18]} />
        <meshStandardMaterial color="#6a0000" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[-0.6, 1.88, 0]} castShadow rotation={[0, 0, -0.1]}>
        <boxGeometry args={[0.18, 0.18, 0.18]} />
        <meshStandardMaterial color="#6a0000" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[-0.55, 1.38, 0]} castShadow rotation={[0, 0, -0.1]}>
        <capsuleGeometry args={[0.1, 0.5, 4, 6]} />
        <meshStandardMaterial color="#5a1010" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[-0.55, 0.75, 0.05]} castShadow rotation={[isBlock ? 0.5 : 0, 0, -0.2]}>
        <capsuleGeometry args={[0.1, 0.38, 4, 6]} />
        <meshStandardMaterial color="#5a1010" roughness={0.6} metalness={0.3} />
      </mesh>
      {isBlock && (
        <mesh position={[-0.8, 1.1, -0.35]} rotation={[0.3, -0.5, 0.1]} castShadow>
          <boxGeometry args={[0.6, 0.85, 0.08]} />
          <meshStandardMaterial color="#2a2a3a" roughness={0.5} metalness={0.6} />
        </mesh>
      )}
      <mesh ref={capeRef} position={[0, 1.55, 0.22]} castShadow>
        <planeGeometry args={[0.65, 1.1, 2, 4]} />
        <meshStandardMaterial color="#550000" roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      <group ref={swordGroupRef} position={[0.58, 1.5, -0.12]} rotation={[-Math.PI / 6, 0, 0.15]}>
        <mesh castShadow>
          <boxGeometry args={[0.06, 1.1, 0.035]} />
          <meshStandardMaterial color="#c8d0e0" roughness={0.12} metalness={0.95} envMapIntensity={2} />
        </mesh>
        <mesh position={[0, 0.62, 0]}>
          <boxGeometry args={[0.045, 0.32, 0.03]} />
          <meshStandardMaterial color="#d4a020" roughness={0.2} metalness={0.9} />
        </mesh>
        <mesh position={[0, -0.44, 0]}>
          <boxGeometry args={[0.28, 0.07, 0.07]} />
          <meshStandardMaterial color="#b08820" roughness={0.25} metalness={0.85} />
        </mesh>
        <mesh ref={swordTrailRef} position={[0, 0.3, 0]} rotation={[0, 0, Math.PI / 4]}>
          <planeGeometry args={[0.6, 1.5]} />
          <meshBasicMaterial
            color={isHeavyRef.current ? '#aa44ff' : '#4488ff'}
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <pointLight
          color={isHeavyRef.current ? '#9922ff' : '#4466ff'}
          intensity={isAtk ? (isHeavyRef.current ? 5 : 3) : 0.7}
          distance={3}
          decay={2}
        />
      </group>
      {player.lockedTargetId && (
        <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.58, 16]} />
          <meshBasicMaterial color="#ffcc00" transparent opacity={0.8} />
        </mesh>
      )}
      <pointLight color="#6688ff" intensity={0.5} distance={5} position={[0, 1.5, 0]} />
    </group>
  );
}
