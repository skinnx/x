import { useRef, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import { Controls } from './types';
import { useGameStore } from './useGameStore';
import { v4 as uuidv4 } from 'uuid';

const MOVE_SPEED = 8;
const ROTATION_SPEED = 10;
const DODGE_SPEED = 16;
const DODGE_DURATION = 0.25;
const DODGE_COOLDOWN = 1.2;
const ATTACK_COOLDOWN = 0.55;
const ATTACK_REACH = 3.5;
const COMBO_WINDOW = 1.2;
const STAMINA_REGEN = 20;
const ATTACK_STAMINA_COST = 20;
const DODGE_STAMINA_COST = 25;
const ENEMY_DAMAGE_PS = 8;

export function Player({ onCameraTarget }: { onCameraTarget: (pos: THREE.Vector3, angle: number) => void }) {
  const meshRef = useRef<THREE.Group>(null);
  const swordRef = useRef<THREE.Group>(null);
  const velocityRef = useRef(new THREE.Vector3());
  const rotationRef = useRef(0);
  const dodgeTimerRef = useRef(0);
  const dodgeDirRef = useRef(new THREE.Vector3());
  const attackTimerRef = useRef(0);
  const dodgeCooldownRef = useRef(0);
  const isAttackingRef = useRef(false);
  const swordAngleRef = useRef(-Math.PI / 6);
  const isDodgingRef = useRef(false);
  const isDamagableRef = useRef(true);
  const comboRef = useRef(0);
  const lastAttackTimeRef = useRef(0);

  const [, getKeys] = useKeyboardControls<Controls>();
  const store = useGameStore;

  const spawnBloodParticles = useCallback((pos: THREE.Vector3, count = 8) => {
    for (let i = 0; i < count; i++) {
      store.getState().addParticle({
        id: uuidv4(),
        position: { x: pos.x, y: pos.y + 1, z: pos.z },
        velocity: {
          x: (Math.random() - 0.5) * 6,
          y: Math.random() * 4 + 2,
          z: (Math.random() - 0.5) * 6,
        },
        life: Math.random() * 0.4 + 0.3,
        maxLife: 0.7,
        color: i % 3 === 0 ? '#dd1111' : '#cc2200',
        size: Math.random() * 0.14 + 0.05,
      });
    }
  }, [store]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const { gameState, player } = store.getState();
    if (gameState.phase !== 'playing') return;
    if (!player.isAlive) return;

    const keys = getKeys();
    const dt = Math.min(delta, 0.05);

    if (attackTimerRef.current > 0) attackTimerRef.current -= dt;
    if (dodgeCooldownRef.current > 0) dodgeCooldownRef.current -= dt;

    store.getState().restoreStamina(STAMINA_REGEN * dt);

    const pos = meshRef.current.position;

    if (dodgeTimerRef.current > 0) {
      dodgeTimerRef.current -= dt;
      isDodgingRef.current = true;
      isDamagableRef.current = false;
      pos.addScaledVector(dodgeDirRef.current, DODGE_SPEED * dt);
      pos.y = 0;
      pos.x = Math.max(-36, Math.min(36, pos.x));
      pos.z = Math.max(-36, Math.min(36, pos.z));
      onCameraTarget(pos, rotationRef.current);
      return;
    } else {
      if (isDodgingRef.current) {
        isDodgingRef.current = false;
        store.getState().setPlayerDodging(false);
        setTimeout(() => { isDamagableRef.current = true; }, 100);
      }
    }

    const moveDir = new THREE.Vector3();
    if (keys.forward) moveDir.z -= 1;
    if (keys.back) moveDir.z += 1;
    if (keys.left) moveDir.x -= 1;
    if (keys.right) moveDir.x += 1;

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      const targetAngle = Math.atan2(-moveDir.x, -moveDir.z);
      let da = targetAngle - rotationRef.current;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      rotationRef.current += da * ROTATION_SPEED * dt;
      velocityRef.current.lerp(moveDir.multiplyScalar(MOVE_SPEED), 8 * dt);
    } else {
      velocityRef.current.lerp(new THREE.Vector3(), 10 * dt);
    }

    pos.addScaledVector(velocityRef.current, dt);
    pos.y = 0;
    pos.x = Math.max(-36, Math.min(36, pos.x));
    pos.z = Math.max(-36, Math.min(36, pos.z));
    meshRef.current.rotation.y = rotationRef.current;

    if (keys.jump && dodgeCooldownRef.current <= 0) {
      const { player: p } = store.getState();
      if (p.stamina >= DODGE_STAMINA_COST) {
        if (store.getState().consumeStamina(DODGE_STAMINA_COST)) {
          const ddir =
            moveDir.lengthSq() > 0
              ? moveDir.clone().normalize()
              : new THREE.Vector3(-Math.sin(rotationRef.current), 0, -Math.cos(rotationRef.current));
          dodgeDirRef.current.copy(ddir);
          dodgeTimerRef.current = DODGE_DURATION;
          dodgeCooldownRef.current = DODGE_COOLDOWN;
          store.getState().setPlayerDodging(true);
        }
      }
    }

    if (keys.attack && attackTimerRef.current <= 0 && !isAttackingRef.current) {
      const { player: p } = store.getState();
      if (p.stamina >= ATTACK_STAMINA_COST) {
        store.getState().consumeStamina(ATTACK_STAMINA_COST);
        const now = Date.now();
        const elapsed = (now - lastAttackTimeRef.current) / 1000;
        comboRef.current = elapsed < COMBO_WINDOW ? Math.min(comboRef.current + 1, 3) : 1;
        lastAttackTimeRef.current = now;
        
        isAttackingRef.current = true;
        attackTimerRef.current = ATTACK_COOLDOWN;
        store.getState().setPlayerAttacking(true, comboRef.current);

        const forward = new THREE.Vector3(-Math.sin(rotationRef.current), 0, -Math.cos(rotationRef.current));
        const { enemies } = store.getState();
        enemies.forEach((enemy) => {
          if (enemy.state === 'dead') return;
          const ePos = new THREE.Vector3(enemy.position.x, 0, enemy.position.z);
          const diff = ePos.clone().sub(pos);
          const dist = diff.length();
          if (dist > ATTACK_REACH) return;
          diff.normalize();
          const dot = forward.dot(diff);
          if (dot < Math.cos(Math.PI / 2.2)) return;
          
          const damage = 20 + (comboRef.current - 1) * 15;
          store.getState().damageEnemy(enemy.id, damage);
          spawnBloodParticles(ePos);

          const { enemies: updated } = store.getState();
          const dead = updated.find((e) => e.id === enemy.id && e.health <= 0);
          if (dead) {
            store.getState().incrementKills();
            store.getState().addScore(100 * comboRef.current);
          }
        });

        setTimeout(() => {
          isAttackingRef.current = false;
          store.getState().setPlayerAttacking(false);
        }, ATTACK_COOLDOWN * 600);
      }
    }

    if (swordRef.current) {
      const targetSwordAngle = isAttackingRef.current ? -Math.PI * 0.75 : -Math.PI / 6;
      swordAngleRef.current += (targetSwordAngle - swordAngleRef.current) * 18 * dt;
      swordRef.current.rotation.x = swordAngleRef.current;
    }

    const { enemies, player: currentPlayer } = store.getState();
    if (isDamagableRef.current) {
      let totalDamage = 0;
      enemies.forEach((enemy) => {
        if (enemy.state !== 'attacking') return;
        const dist = Math.sqrt(
          (pos.x - enemy.position.x) ** 2 + (pos.z - enemy.position.z) ** 2
        );
        if (dist < 2.2) totalDamage += ENEMY_DAMAGE_PS * dt;
      });
      if (totalDamage > 0) {
        const newHp = currentPlayer.health - totalDamage;
        if (newHp <= 0) store.getState().setPlayerDead();
        else store.getState().setPlayerHealth(newHp);
      }
    }

    onCameraTarget(pos, rotationRef.current);
  });

  const { player } = useGameStore();
  if (!player.isAlive) return null;

  return (
    <group ref={meshRef} position={[0, 0, 0]}>
      <mesh position={[0, 0.85, 0]} castShadow>
        <capsuleGeometry args={[0.33, 1.1, 4, 8]} />
        <meshStandardMaterial color="#1e1008" roughness={0.55} metalness={0.4} />
      </mesh>
      <mesh position={[0, 1.85, 0]} castShadow>
        <sphereGeometry args={[0.3, 8, 8]} />
        <meshStandardMaterial color="#c8956c" roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.65, 0]} castShadow>
        <boxGeometry args={[0.85, 0.45, 0.42]} />
        <meshStandardMaterial color="#8b1a1a" roughness={0.45} metalness={0.4} />
      </mesh>
      <mesh position={[-0.6, 1.38, 0]} castShadow rotation={[0, 0, -0.12]}>
        <capsuleGeometry args={[0.11, 0.52, 4, 6]} />
        <meshStandardMaterial color="#6a1010" roughness={0.6} metalness={0.3} />
      </mesh>
      <group ref={swordRef} position={[0.62, 1.5, -0.15]} rotation={[-Math.PI / 6, 0, 0.18]}>
        <mesh castShadow>
          <boxGeometry args={[0.07, 1.05, 0.04]} />
          <meshStandardMaterial color="#ccd0e0" roughness={0.15} metalness={0.92} />
        </mesh>
        <mesh position={[0, 0.57, 0]}>
          <boxGeometry args={[0.05, 0.28, 0.03]} />
          <meshStandardMaterial color="#d4a020" roughness={0.25} metalness={0.85} />
        </mesh>
        <mesh position={[0, -0.42, 0]}>
          <boxGeometry args={[0.22, 0.06, 0.08]} />
          <meshStandardMaterial color="#a08020" roughness={0.3} metalness={0.75} />
        </mesh>
        <pointLight color="#5577ff" intensity={isAttackingRef.current ? 3 : 0.6} distance={2.5} />
      </group>
      <mesh position={[0, 1.93, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.31, 0.14, 8]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.4} metalness={0.6} />
      </mesh>
      <pointLight color="#8899ff" intensity={0.4} distance={4} position={[0, 1.5, 0]} />
    </group>
  );
}
