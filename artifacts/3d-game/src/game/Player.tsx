import { useRef, useCallback, MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import { Controls } from './types';
import { useGameStore } from './useGameStore';
import { v4 as uuidv4 } from 'uuid';

const MOVE_SPEED = 7.5;
const ROT_SPEED = 14;
const DODGE_SPEED = 19;
const DODGE_DURATION = 0.22;
const DODGE_COOLDOWN = 0.95;
const ATTACK_COOLDOWN = 0.48;
const HEAVY_COOLDOWN = 1.05;
const ATTACK_REACH = 3.4;
const HEAVY_REACH = 4.8;
const COMBO_WINDOW = 1.0;
const STAMINA_REGEN = 22;
const ATK_STA = 18;
const HEAVY_STA = 35;
const DODGE_STA = 22;
const BLOCK_STA_PS = 12;

interface BonesRefs {
  root: MutableRefObject<THREE.Group | null>;
  hip: MutableRefObject<THREE.Group | null>;
  spine: MutableRefObject<THREE.Group | null>;
  chest: MutableRefObject<THREE.Group | null>;
  head: MutableRefObject<THREE.Group | null>;
  shoulderR: MutableRefObject<THREE.Group | null>;
  upperArmR: MutableRefObject<THREE.Group | null>;
  foreArmR: MutableRefObject<THREE.Group | null>;
  shoulderL: MutableRefObject<THREE.Group | null>;
  upperArmL: MutableRefObject<THREE.Group | null>;
  foreArmL: MutableRefObject<THREE.Group | null>;
  thighR: MutableRefObject<THREE.Group | null>;
  shinR: MutableRefObject<THREE.Group | null>;
  thighL: MutableRefObject<THREE.Group | null>;
  shinL: MutableRefObject<THREE.Group | null>;
  cape: MutableRefObject<THREE.Group | null>;
  swordPivot: MutableRefObject<THREE.Group | null>;
}

function useBones(): BonesRefs {
  return {
    root: useRef<THREE.Group>(null),
    hip: useRef<THREE.Group>(null),
    spine: useRef<THREE.Group>(null),
    chest: useRef<THREE.Group>(null),
    head: useRef<THREE.Group>(null),
    shoulderR: useRef<THREE.Group>(null),
    upperArmR: useRef<THREE.Group>(null),
    foreArmR: useRef<THREE.Group>(null),
    shoulderL: useRef<THREE.Group>(null),
    upperArmL: useRef<THREE.Group>(null),
    foreArmL: useRef<THREE.Group>(null),
    thighR: useRef<THREE.Group>(null),
    shinR: useRef<THREE.Group>(null),
    thighL: useRef<THREE.Group>(null),
    shinL: useRef<THREE.Group>(null),
    cape: useRef<THREE.Group>(null),
    swordPivot: useRef<THREE.Group>(null),
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function lerpAngle(from: number, to: number, t: number) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * t;
}

type AnimState = 'idle' | 'walk' | 'run' | 'attack' | 'heavy' | 'dodge' | 'block' | 'stagger';

export function Player({ onCameraTarget }: { onCameraTarget: (pos: THREE.Vector3, angle: number) => void }) {
  const bones = useBones();
  const velRef = useRef(new THREE.Vector3());
  const rotRef = useRef(0);
  const animTimeRef = useRef(0);
  const animStateRef = useRef<AnimState>('idle');
  const atkPhaseRef = useRef(0);
  const dodgeTimerRef = useRef(0);
  const dodgeDirRef = useRef(new THREE.Vector3());
  const atkCDRef = useRef(0);
  const dodgeCDRef = useRef(0);
  const isAtkRef = useRef(false);
  const isHeavyRef = useRef(false);
  const isDodgingRef = useRef(false);
  const invFrameRef = useRef(0);
  const comboRef = useRef(0);
  const lastAtkRef = useRef(0);
  const trailOpRef = useRef(0);
  const swordGlowRef = useRef<THREE.PointLight>(null);
  const trailMeshRef = useRef<THREE.Mesh>(null);
  const [, getKeys] = useKeyboardControls<Controls>();

  const store = useGameStore;

  const addParticle = useCallback((pos: THREE.Vector3, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
      store.getState().addParticle({
        id: uuidv4(),
        position: { x: pos.x + (Math.random() - 0.5) * 0.5, y: pos.y + 1 + Math.random() * 0.5, z: pos.z + (Math.random() - 0.5) * 0.5 },
        velocity: { x: (Math.random() - 0.5) * 8, y: Math.random() * 6 + 2, z: (Math.random() - 0.5) * 8 },
        life: Math.random() * 0.4 + 0.2,
        maxLife: 0.6,
        color,
        size: Math.random() * 0.1 + 0.04,
      });
    }
  }, [store]);

  const doAttack = useCallback((heavy: boolean) => {
    const staCost = heavy ? HEAVY_STA : ATK_STA;
    if (!store.getState().consumeStamina(staCost)) return;
    if (!bones.root.current) return;

    const now = Date.now();
    const elapsed = (now - lastAtkRef.current) / 1000;
    comboRef.current = elapsed < COMBO_WINDOW ? Math.min(comboRef.current + 1, 4) : 1;
    lastAtkRef.current = now;

    isAtkRef.current = true;
    isHeavyRef.current = heavy;
    atkCDRef.current = heavy ? HEAVY_COOLDOWN : ATTACK_COOLDOWN;
    atkPhaseRef.current = 0;
    trailOpRef.current = 1;
    animStateRef.current = heavy ? 'heavy' : 'attack';

    store.getState().setPlayerAttacking(true, heavy, comboRef.current);

    const reach = heavy ? HEAVY_REACH : ATTACK_REACH;
    const arc = heavy ? Math.PI / 1.6 : Math.PI / 2.2;
    const pos = bones.root.current.position;
    const forward = new THREE.Vector3(-Math.sin(rotRef.current), 0, -Math.cos(rotRef.current));
    const { enemies } = store.getState();

    let hitAny = false;
    enemies.forEach((enemy) => {
      if (enemy.state === 'dead') return;
      const ep = new THREE.Vector3(enemy.position.x, 0, enemy.position.z);
      const diff = ep.clone().sub(pos);
      if (diff.length() > reach) return;
      diff.normalize();
      if (forward.dot(diff) < Math.cos(arc)) return;

      const base = heavy ? 48 : 22;
      const comboDmg = base + (comboRef.current - 1) * (heavy ? 22 : 13);
      const killed = store.getState().damageEnemy(enemy.id, comboDmg);
      addParticle(ep, '#cc2200', heavy ? 18 : 10);
      addParticle(ep, '#ff8800', 5);
      hitAny = true;
      if (killed) {
        store.getState().incrementKills();
        const enemyInfo = store.getState().enemies.find(e => e.id === enemy.id);
        store.getState().addScore((enemyInfo?.maxHealth || 100) * comboRef.current);
      }
    });

    if (hitAny) store.getState().triggerScreenShake(heavy ? 0.28 : 0.12);

    const dur = (heavy ? HEAVY_COOLDOWN : ATTACK_COOLDOWN) * 600;
    setTimeout(() => {
      isAtkRef.current = false;
      isHeavyRef.current = false;
      animStateRef.current = 'idle';
      store.getState().setPlayerAttacking(false);
    }, dur);
  }, [bones.root, store, addParticle]);

  function animateBones(dt: number, speed: number, anim: AnimState, t: number, isBlocking: boolean, dodge: boolean) {
    const s = Math.min(dt * 16, 1);

    const freq = anim === 'run' ? t * 8 : t * 5;
    const amp = anim === 'run' ? 1 : anim === 'walk' ? 0.7 : 0.05;
    const walkSwing = Math.sin(freq) * amp;
    const walkSwing2 = Math.cos(freq) * amp * 0.6;
    const isMoving = anim === 'walk' || anim === 'run';
    const isAtk = anim === 'attack' || anim === 'heavy';

    if (bones.hip.current) {
      const targetY = isMoving ? Math.abs(Math.sin(freq * 2)) * 0.08 : 0;
      const targetTilt = isBlocking ? -0.12 : isAtk ? 0.1 : 0;
      bones.hip.current.position.y = lerp(bones.hip.current.position.y, targetY, s);
      bones.hip.current.rotation.z = lerp(bones.hip.current.rotation.z, isMoving ? walkSwing2 * 0.15 : 0, s);
    }

    if (bones.spine.current) {
      const targetX = isBlocking ? -0.18 : anim === 'heavy' ? 0.15 : 0;
      bones.spine.current.rotation.x = lerp(bones.spine.current.rotation.x, targetX, s * 0.7);
    }

    if (bones.chest.current) {
      const targetY = isMoving ? -walkSwing2 * 0.12 : 0;
      const targetZ = isMoving ? walkSwing * 0.06 : 0;
      bones.chest.current.rotation.y = lerp(bones.chest.current.rotation.y, targetY, s * 0.8);
      bones.chest.current.rotation.z = lerp(bones.chest.current.rotation.z, targetZ, s * 0.8);
    }

    if (bones.head.current) {
      const idleTilt = Math.sin(t * 1.2) * 0.02;
      const atkTilt = isAtk ? -0.1 : 0;
      bones.head.current.rotation.x = lerp(bones.head.current.rotation.x, idleTilt + atkTilt, s * 0.5);
      bones.head.current.rotation.y = lerp(bones.head.current.rotation.y, 0, s * 0.5);
    }

    if (bones.thighR.current) {
      const target = isMoving ? walkSwing * 0.6 : 0;
      bones.thighR.current.rotation.x = lerp(bones.thighR.current.rotation.x, target, s);
    }
    if (bones.shinR.current) {
      const t2 = isMoving ? Math.max(0, -Math.sin(freq)) * 0.7 : 0;
      bones.shinR.current.rotation.x = lerp(bones.shinR.current.rotation.x, t2, s);
    }
    if (bones.thighL.current) {
      const target = isMoving ? -walkSwing * 0.6 : 0;
      bones.thighL.current.rotation.x = lerp(bones.thighL.current.rotation.x, target, s);
    }
    if (bones.shinL.current) {
      const t2 = isMoving ? Math.max(0, Math.sin(freq)) * 0.7 : 0;
      bones.shinL.current.rotation.x = lerp(bones.shinL.current.rotation.x, t2, s);
    }

    if (bones.upperArmL.current) {
      let txL = isBlocking ? -1.2 : isMoving ? -walkSwing * 0.5 : Math.sin(t * 1.1) * 0.02;
      let tzL = isBlocking ? -0.5 : -0.1;
      bones.upperArmL.current.rotation.x = lerp(bones.upperArmL.current.rotation.x, txL, s);
      bones.upperArmL.current.rotation.z = lerp(bones.upperArmL.current.rotation.z, tzL, s);
    }
    if (bones.foreArmL.current) {
      const target = isBlocking ? -0.9 : 0;
      bones.foreArmL.current.rotation.x = lerp(bones.foreArmL.current.rotation.x, target, s);
    }

    if (bones.swordPivot.current) {
      atkPhaseRef.current += dt * (isHeavyRef.current ? 5 : 7);
      let txR: number, tzR: number, tyR: number;
      if (isAtk) {
        const phase = atkPhaseRef.current;
        if (isHeavyRef.current) {
          txR = phase < 1 ? lerp(-0.8, -2.0, phase) : lerp(-2.0, 0.8, phase - 1);
          tzR = Math.sin(phase * Math.PI) * 0.4;
          tyR = 0;
        } else {
          const combo = comboRef.current;
          if (combo % 2 === 1) {
            txR = phase < 0.8 ? lerp(-0.5, -1.8, phase / 0.8) : lerp(-1.8, 0.2, (phase - 0.8) / 1.2);
            tzR = phase < 0.8 ? lerp(-0.3, 0.5, phase / 0.8) : lerp(0.5, -0.3, (phase - 0.8) / 1.2);
          } else {
            txR = phase < 0.8 ? lerp(-0.5, -1.5, phase / 0.8) : lerp(-1.5, 0.2, (phase - 0.8) / 1.2);
            tzR = phase < 0.8 ? lerp(-0.3, -0.7, phase / 0.8) : lerp(-0.7, -0.3, (phase - 0.8) / 1.2);
          }
          tyR = Math.sin(phase * Math.PI) * 0.2;
        }
      } else {
        txR = isMoving ? walkSwing * 0.5 : Math.sin(t * 0.9) * 0.025;
        tzR = 0.08;
        tyR = 0;
      }
      bones.swordPivot.current.rotation.x = lerp(bones.swordPivot.current.rotation.x, txR, s * 0.9);
      bones.swordPivot.current.rotation.z = lerp(bones.swordPivot.current.rotation.z, tzR, s * 0.9);
      bones.swordPivot.current.rotation.y = lerp(bones.swordPivot.current.rotation.y, tyR, s * 0.9);
    }

    if (dodge && bones.spine.current) {
      bones.spine.current.rotation.x = lerp(bones.spine.current.rotation.x, -0.35, s * 2);
    }

    if (bones.cape.current) {
      const swingX = isMoving ? (speed * 0.04 + Math.sin(t * 3) * 0.03) : Math.sin(t * 1.5) * 0.01;
      const swingZ = isMoving ? Math.sin(freq * 0.5) * 0.04 : 0;
      bones.cape.current.rotation.x = lerp(bones.cape.current.rotation.x, swingX, s * 0.4);
      bones.cape.current.rotation.z = lerp(bones.cape.current.rotation.z, swingZ, s * 0.3);
    }

    if (trailMeshRef.current) {
      trailOpRef.current = Math.max(0, trailOpRef.current - dt * 5.5);
      const mat = trailMeshRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = trailOpRef.current * 0.55;
    }
    if (swordGlowRef.current) {
      swordGlowRef.current.intensity = lerp(
        swordGlowRef.current.intensity,
        isAtk ? (isHeavyRef.current ? 6 : 3.5) : 0.6,
        s
      );
    }
  }

  useFrame((_, delta) => {
    if (!bones.root.current) return;
    const { gameState, player } = store.getState();
    if (gameState.phase !== 'playing' || !player.isAlive) return;

    const dt = Math.min(delta, 0.05);
    animTimeRef.current += dt;
    const t = animTimeRef.current;

    if (atkCDRef.current > 0) atkCDRef.current -= dt;
    if (dodgeCDRef.current > 0) dodgeCDRef.current -= dt;
    if (invFrameRef.current > 0) invFrameRef.current -= dt;

    store.getState().restoreStamina(STAMINA_REGEN * dt * (player.isBlocking ? 0.3 : 1));
    store.getState().tickEffects(dt);

    const keys = getKeys();
    const pos = bones.root.current.position;

    if (dodgeTimerRef.current > 0) {
      dodgeTimerRef.current -= dt;
      isDodgingRef.current = true;
      pos.addScaledVector(dodgeDirRef.current, DODGE_SPEED * dt);
      pos.y = 0;
      const dr = 28.5;
      const dd2 = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
      if (dd2 > dr) { const n = new THREE.Vector3(pos.x, 0, pos.z).normalize(); pos.x = n.x * dr; pos.z = n.z * dr; }
      animStateRef.current = 'dodge';
      animateBones(dt, DODGE_SPEED, 'dodge', t, false, true);
      onCameraTarget(pos, rotRef.current);
      return;
    } else if (isDodgingRef.current) {
      isDodgingRef.current = false;
      store.getState().setPlayerDodging(false);
      animStateRef.current = 'idle';
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
      velRef.current.lerp(new THREE.Vector3(), 10 * dt);
      if (!isAtkRef.current) animStateRef.current = 'block';
    } else if (isMoving) {
      moveDir.normalize();
      const { player: p } = store.getState();
      let targetAngle: number;
      if (p.lockedTargetId) {
        const locked = store.getState().enemies.find(e => e.id === p.lockedTargetId);
        if (locked && locked.state !== 'dead') {
          targetAngle = Math.atan2(-(locked.position.x - pos.x), -(locked.position.z - pos.z));
        } else {
          store.getState().setLockTarget(null);
          targetAngle = Math.atan2(-moveDir.x, -moveDir.z);
        }
      } else {
        targetAngle = Math.atan2(-moveDir.x, -moveDir.z);
      }
      rotRef.current = lerpAngle(rotRef.current, targetAngle, ROT_SPEED * dt);
      const spd = isAtkRef.current ? 0.3 : 1;
      velRef.current.lerp(moveDir.multiplyScalar(MOVE_SPEED * spd), 10 * dt);
      if (!isAtkRef.current) animStateRef.current = velRef.current.length() > 5 ? 'run' : 'walk';
    } else {
      velRef.current.lerp(new THREE.Vector3(), 12 * dt);
      if (!isAtkRef.current && !isBlocking) animStateRef.current = 'idle';
    }

    pos.addScaledVector(velRef.current, dt);
    pos.y = 0;
    const ar = 28.5;
    const fd = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
    if (fd > ar) { const n = new THREE.Vector3(pos.x, 0, pos.z).normalize(); pos.x = n.x * ar; pos.z = n.z * ar; }
    bones.root.current.rotation.y = rotRef.current;

    if (keys.jump && dodgeCDRef.current <= 0 && player.stamina >= DODGE_STA) {
      if (store.getState().consumeStamina(DODGE_STA)) {
        const dDir = isMoving
          ? velRef.current.clone().normalize()
          : new THREE.Vector3(-Math.sin(rotRef.current), 0, -Math.cos(rotRef.current));
        dodgeDirRef.current.copy(dDir);
        dodgeTimerRef.current = DODGE_DURATION;
        dodgeCDRef.current = DODGE_COOLDOWN;
        invFrameRef.current = DODGE_DURATION + 0.12;
        store.getState().setPlayerDodging(true);
      }
    }

    if (keys.heavy && atkCDRef.current <= 0 && !isAtkRef.current) {
      doAttack(true);
    } else if (keys.attack && atkCDRef.current <= 0 && !isAtkRef.current) {
      doAttack(false);
    }

    if (keys.lockOn) {
      const { player: p, enemies } = store.getState();
      if (p.lockedTargetId) {
        store.getState().setLockTarget(null);
      } else {
        const living = enemies.filter(e => e.state !== 'dead');
        if (living.length > 0) {
          const nearest = living.reduce((best, e) => {
            const d = (e.position.x - pos.x) ** 2 + (e.position.z - pos.z) ** 2;
            const bd = (best.position.x - pos.x) ** 2 + (best.position.z - pos.z) ** 2;
            return d < bd ? e : best;
          });
          store.getState().setLockTarget(nearest.id);
        }
      }
    }

    animateBones(dt, velRef.current.length(), animStateRef.current, t, isBlocking, false);

    const { enemies, player: cp } = store.getState();
    if (invFrameRef.current <= 0) {
      let dmg = 0;
      enemies.forEach(e => {
        if (e.state !== 'attacking') return;
        const d = Math.sqrt((pos.x - e.position.x) ** 2 + (pos.z - e.position.z) ** 2);
        const atkRange = e.type === 'boss' ? 3.5 : e.type === 'berserker' ? 3.0 : 2.5;
        if (d < atkRange) {
          const raw = e.type === 'scout' ? 5 : e.type === 'berserker' ? 18 : e.type === 'boss' ? 25 : 10;
          dmg += raw * dt * (cp.isBlocking ? 0.12 : 1);
        }
      });
      if (dmg > 0) {
        const newHp = cp.health - dmg;
        if (newHp <= 0) store.getState().setPlayerDead();
        else {
          store.getState().setPlayerHealth(newHp);
          if (!cp.isBlocking) {
            store.getState().triggerHitFlash(0.65);
            store.getState().triggerScreenShake(0.4);
          }
        }
      }
    }

    onCameraTarget(pos, rotRef.current);
  });

  const { player } = useGameStore();
  if (!player.isAlive) return null;

  return (
    <group ref={bones.root} position={[0, 0, 0]}>
      <group ref={bones.hip} position={[0, 0.92, 0]}>
        <group ref={bones.spine} position={[0, 0, 0]}>
          <group ref={bones.chest} position={[0, 0.52, 0]}>

            <mesh position={[0, 0.22, 0]} castShadow>
              <boxGeometry args={[0.72, 0.48, 0.36]} />
              <meshStandardMaterial color="#7a1515" roughness={0.4} metalness={0.6} />
            </mesh>
            <mesh position={[0, 0.22, 0]} castShadow>
              <boxGeometry args={[0.78, 0.10, 0.38]} />
              <meshStandardMaterial color="#5a0f0f" roughness={0.4} metalness={0.7} />
            </mesh>
            <mesh position={[0, 0.36, 0.0]} castShadow>
              <boxGeometry args={[0.55, 0.25, 0.08]} />
              <meshStandardMaterial color="#8a1a1a" roughness={0.45} metalness={0.55} />
            </mesh>
            <mesh position={[0, 0.0, 0]} castShadow>
              <boxGeometry args={[0.62, 0.42, 0.34]} />
              <meshStandardMaterial color="#1a0c06" roughness={0.55} metalness={0.4} />
            </mesh>

            <group ref={bones.shoulderR} position={[0.44, 0.28, 0]}>
              <mesh castShadow>
                <boxGeometry args={[0.22, 0.22, 0.22]} />
                <meshStandardMaterial color="#6a0e0e" roughness={0.4} metalness={0.65} />
              </mesh>
              <group ref={bones.upperArmR} position={[0.15, -0.1, 0]}>
                <mesh position={[0, -0.18, 0]} castShadow>
                  <capsuleGeometry args={[0.1, 0.32, 4, 6]} />
                  <meshStandardMaterial color="#5a1010" roughness={0.55} metalness={0.4} />
                </mesh>
                <group ref={bones.foreArmR} position={[0, -0.42, 0]}>
                  <mesh position={[0, -0.16, 0]} castShadow>
                    <capsuleGeometry args={[0.085, 0.28, 4, 6]} />
                    <meshStandardMaterial color="#4a0e0e" roughness={0.55} metalness={0.4} />
                  </mesh>
                  <group ref={bones.swordPivot} position={[0, -0.44, 0]}>
                    <mesh position={[0, -0.38, 0]} castShadow>
                      <boxGeometry args={[0.06, 0.9, 0.032]} />
                      <meshStandardMaterial color="#c8d0e0" roughness={0.1} metalness={0.97} envMapIntensity={2.5} />
                    </mesh>
                    <mesh position={[0, -0.05, 0]} castShadow>
                      <boxGeometry args={[0.26, 0.06, 0.06]} />
                      <meshStandardMaterial color="#c8a020" roughness={0.2} metalness={0.9} />
                    </mesh>
                    <mesh position={[0, 0.08, 0]} castShadow>
                      <cylinderGeometry args={[0.032, 0.04, 0.22, 6]} />
                      <meshStandardMaterial color="#8a6010" roughness={0.35} metalness={0.8} />
                    </mesh>
                    <mesh position={[0, -0.38, 0.016]} castShadow>
                      <planeGeometry args={[0.06, 0.9]} />
                      <meshStandardMaterial color="#e0e8ff" roughness={0.05} metalness={1} envMapIntensity={3} />
                    </mesh>
                    <mesh ref={trailMeshRef} position={[0, -0.4, 0]} rotation={[0, 0, 0]}>
                      <planeGeometry args={[0.7, 1.2]} />
                      <meshBasicMaterial
                        color={isHeavyRef.current ? '#bb44ff' : '#44aaff'}
                        transparent opacity={0}
                        side={THREE.DoubleSide}
                        blending={THREE.AdditiveBlending}
                        depthWrite={false}
                      />
                    </mesh>
                    <pointLight ref={swordGlowRef} color={isHeavyRef.current ? '#9922ff' : '#4488ff'} intensity={0.6} distance={3.5} decay={2} />
                  </group>
                </group>
              </group>
            </group>

            <group ref={bones.shoulderL} position={[-0.44, 0.28, 0]}>
              <mesh castShadow>
                <boxGeometry args={[0.22, 0.22, 0.22]} />
                <meshStandardMaterial color="#6a0e0e" roughness={0.4} metalness={0.65} />
              </mesh>
              <group ref={bones.upperArmL} position={[-0.15, -0.1, 0]}>
                <mesh position={[0, -0.18, 0]} castShadow>
                  <capsuleGeometry args={[0.1, 0.32, 4, 6]} />
                  <meshStandardMaterial color="#5a1010" roughness={0.55} metalness={0.4} />
                </mesh>
                <group ref={bones.foreArmL} position={[0, -0.42, 0]}>
                  <mesh position={[0, -0.16, 0]} castShadow>
                    <capsuleGeometry args={[0.085, 0.28, 4, 6]} />
                    <meshStandardMaterial color="#4a0e0e" roughness={0.55} metalness={0.4} />
                  </mesh>
                  {player.isBlocking && (
                    <mesh position={[-0.12, -0.3, -0.26]} rotation={[0.3, -0.4, 0.1]} castShadow>
                      <boxGeometry args={[0.55, 0.75, 0.07]} />
                      <meshStandardMaterial color="#252535" roughness={0.45} metalness={0.7} />
                    </mesh>
                  )}
                </group>
              </group>
            </group>

            <group ref={bones.head} position={[0, 0.5, 0]}>
              <mesh position={[0, 0.16, 0]} castShadow>
                <sphereGeometry args={[0.24, 10, 8]} />
                <meshStandardMaterial color="#c4905f" roughness={0.45} />
              </mesh>
              <mesh position={[0, 0.24, 0]} castShadow>
                <cylinderGeometry args={[0.2, 0.24, 0.12, 8]} />
                <meshStandardMaterial color="#1a1a2e" roughness={0.3} metalness={0.72} />
              </mesh>
              <mesh position={[0, 0.36, 0]} castShadow>
                <cylinderGeometry args={[0.16, 0.2, 0.08, 8]} />
                <meshStandardMaterial color="#1e1e38" roughness={0.28} metalness={0.72} />
              </mesh>
              <mesh position={[0, 0.30, -0.13]} castShadow>
                <boxGeometry args={[0.4, 0.3, 0.06]} />
                <meshStandardMaterial color="#111122" roughness={0.3} metalness={0.75} />
              </mesh>
              <mesh position={[0, 0.14, 0.2]}>
                <boxGeometry args={[0.14, 0.08, 0.04]} />
                <meshStandardMaterial color="#8a1414" roughness={0.35} metalness={0.6} emissive="#330000" emissiveIntensity={0.3} />
              </mesh>
            </group>

            <group ref={bones.cape} position={[0, 0.1, 0.2]}>
              <mesh castShadow>
                <planeGeometry args={[0.7, 1.0, 2, 5]} />
                <meshStandardMaterial color="#600000" roughness={0.92} side={THREE.DoubleSide} />
              </mesh>
            </group>
          </group>

          <mesh position={[0, 0.22, 0]} castShadow>
            <boxGeometry args={[0.6, 0.5, 0.32]} />
            <meshStandardMaterial color="#1a0c06" roughness={0.55} metalness={0.35} />
          </mesh>
          <mesh position={[0, 0.04, 0]} castShadow>
            <boxGeometry args={[0.66, 0.18, 0.34]} />
            <meshStandardMaterial color="#3a1806" roughness={0.5} metalness={0.45} />
          </mesh>
        </group>

        <group ref={bones.thighR} position={[0.2, -0.02, 0]}>
          <mesh position={[0, -0.24, 0]} castShadow>
            <capsuleGeometry args={[0.12, 0.38, 4, 6]} />
            <meshStandardMaterial color="#1a0c06" roughness={0.6} metalness={0.3} />
          </mesh>
          <mesh position={[0.01, -0.15, 0.01]} castShadow>
            <boxGeometry args={[0.22, 0.32, 0.2]} />
            <meshStandardMaterial color="#2a1408" roughness={0.55} metalness={0.4} />
          </mesh>
          <group ref={bones.shinR} position={[0, -0.5, 0]}>
            <mesh position={[0, -0.2, 0]} castShadow>
              <capsuleGeometry args={[0.09, 0.32, 4, 6]} />
              <meshStandardMaterial color="#1a0c06" roughness={0.6} metalness={0.3} />
            </mesh>
            <mesh position={[0, -0.28, 0.04]} castShadow>
              <boxGeometry args={[0.18, 0.36, 0.09]} />
              <meshStandardMaterial color="#3a1a0a" roughness={0.5} metalness={0.5} />
            </mesh>
            <mesh position={[0, -0.52, 0.02]} castShadow>
              <boxGeometry args={[0.2, 0.1, 0.3]} />
              <meshStandardMaterial color="#2e1808" roughness={0.55} metalness={0.4} />
            </mesh>
          </group>
        </group>

        <group ref={bones.thighL} position={[-0.2, -0.02, 0]}>
          <mesh position={[0, -0.24, 0]} castShadow>
            <capsuleGeometry args={[0.12, 0.38, 4, 6]} />
            <meshStandardMaterial color="#1a0c06" roughness={0.6} metalness={0.3} />
          </mesh>
          <mesh position={[-0.01, -0.15, 0.01]} castShadow>
            <boxGeometry args={[0.22, 0.32, 0.2]} />
            <meshStandardMaterial color="#2a1408" roughness={0.55} metalness={0.4} />
          </mesh>
          <group ref={bones.shinL} position={[0, -0.5, 0]}>
            <mesh position={[0, -0.2, 0]} castShadow>
              <capsuleGeometry args={[0.09, 0.32, 4, 6]} />
              <meshStandardMaterial color="#1a0c06" roughness={0.6} metalness={0.3} />
            </mesh>
            <mesh position={[0, -0.28, 0.04]} castShadow>
              <boxGeometry args={[0.18, 0.36, 0.09]} />
              <meshStandardMaterial color="#3a1a0a" roughness={0.5} metalness={0.5} />
            </mesh>
            <mesh position={[0, -0.52, 0.02]} castShadow>
              <boxGeometry args={[0.2, 0.1, 0.3]} />
              <meshStandardMaterial color="#2e1808" roughness={0.55} metalness={0.4} />
            </mesh>
          </group>
        </group>
      </group>

      {player.lockedTargetId && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.48, 0.56, 18]} />
          <meshBasicMaterial color="#ffcc00" transparent opacity={0.8} />
        </mesh>
      )}
      <pointLight color="#6688ff" intensity={0.4} distance={5} position={[0, 1.6, 0]} />
    </group>
  );
}
