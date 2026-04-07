import { useRef, useCallback, MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import { Controls, SkillId, ENEMY_STATS } from './types';
import { useGameStore } from './useGameStore';
import { v4 as uuidv4 } from 'uuid';

const MOVE_SPEED = 7.5;
const ROT_SPEED = 14;
const DODGE_SPEED = 20;
const DODGE_DURATION = 0.22;
const DODGE_COOLDOWN = 0.95;
const ATTACK_COOLDOWN = 0.46;
const HEAVY_COOLDOWN = 1.0;
const ATTACK_REACH = 3.4;
const HEAVY_REACH = 4.8;
const COMBO_WINDOW = 1.0;
const ENERGY_REGEN = 12;
const ATK_STA = 16;
const HEAVY_STA = 30;
const DODGE_STA = 20;
const BLOCK_STA_PS = 10;
const CRIT_CHANCE = 0.16;

interface BonesRefs {
  root: MutableRefObject<THREE.Group | null>;
  hip: MutableRefObject<THREE.Group | null>;
  spine: MutableRefObject<THREE.Group | null>;
  chest: MutableRefObject<THREE.Group | null>;
  head: MutableRefObject<THREE.Group | null>;
  upperArmR: MutableRefObject<THREE.Group | null>;
  foreArmR: MutableRefObject<THREE.Group | null>;
  upperArmL: MutableRefObject<THREE.Group | null>;
  foreArmL: MutableRefObject<THREE.Group | null>;
  thighR: MutableRefObject<THREE.Group | null>;
  shinR: MutableRefObject<THREE.Group | null>;
  thighL: MutableRefObject<THREE.Group | null>;
  shinL: MutableRefObject<THREE.Group | null>;
  cape: MutableRefObject<THREE.Group | null>;
  swordPivot: MutableRefObject<THREE.Group | null>;
  auraRing: MutableRefObject<THREE.Mesh | null>;
  whirlRing: MutableRefObject<THREE.Mesh | null>;
}

function useBones(): BonesRefs {
  return {
    root: useRef<THREE.Group>(null),
    hip: useRef<THREE.Group>(null),
    spine: useRef<THREE.Group>(null),
    chest: useRef<THREE.Group>(null),
    head: useRef<THREE.Group>(null),
    upperArmR: useRef<THREE.Group>(null),
    foreArmR: useRef<THREE.Group>(null),
    upperArmL: useRef<THREE.Group>(null),
    foreArmL: useRef<THREE.Group>(null),
    thighR: useRef<THREE.Group>(null),
    shinR: useRef<THREE.Group>(null),
    thighL: useRef<THREE.Group>(null),
    shinL: useRef<THREE.Group>(null),
    cape: useRef<THREE.Group>(null),
    swordPivot: useRef<THREE.Group>(null),
    auraRing: useRef<THREE.Mesh>(null),
    whirlRing: useRef<THREE.Mesh>(null),
  };
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function lerpAngle(from: number, to: number, t: number) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * t;
}

type AnimState = 'idle' | 'walk' | 'run' | 'attack' | 'heavy' | 'dodge' | 'block' | 'whirlwind';

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
  const phantomDashRef = useRef(0);
  const phantomDirRef = useRef(new THREE.Vector3());
  const prevKeysRef = useRef<Partial<Record<Controls, boolean>>>({});
  const [, getKeys] = useKeyboardControls<Controls>();
  const store = useGameStore;

  const addParticle = useCallback((pos: THREE.Vector3, color: string, count: number, speed = 7) => {
    for (let i = 0; i < count; i++) {
      store.getState().addParticle({
        id: uuidv4(),
        position: { x: pos.x + (Math.random() - 0.5) * 0.6, y: pos.y + 1 + Math.random() * 0.6, z: pos.z + (Math.random() - 0.5) * 0.6 },
        velocity: { x: (Math.random() - 0.5) * speed, y: Math.random() * speed * 0.7 + 2, z: (Math.random() - 0.5) * speed },
        life: Math.random() * 0.4 + 0.2, maxLife: 0.65, color, size: Math.random() * 0.12 + 0.05,
      });
    }
  }, [store]);

  const rollCrit = () => Math.random() < CRIT_CHANCE;

  const doAttack = useCallback((heavy: boolean) => {
    const staCost = heavy ? HEAVY_STA : ATK_STA;
    if (!store.getState().consumeStamina(staCost)) return;
    if (!bones.root.current) return;
    const now = Date.now();
    comboRef.current = ((now - lastAtkRef.current) / 1000 < COMBO_WINDOW) ? Math.min(comboRef.current + 1, 5) : 1;
    lastAtkRef.current = now;
    isAtkRef.current = true;
    isHeavyRef.current = heavy;
    atkCDRef.current = heavy ? HEAVY_COOLDOWN : ATTACK_COOLDOWN;
    atkPhaseRef.current = 0;
    trailOpRef.current = 1;
    animStateRef.current = heavy ? 'heavy' : 'attack';
    store.getState().setPlayerAttacking(true, heavy, comboRef.current);

    const { player } = store.getState();
    const reach = heavy ? HEAVY_REACH : ATTACK_REACH;
    const arc = heavy ? Math.PI / 1.5 : Math.PI / 2.1;
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
      const base = heavy ? 50 : 22;
      const comboDmg = base + (comboRef.current - 1) * (heavy ? 22 : 14);
      const isCrit = rollCrit();
      const finalDmg = Math.round(comboDmg * player.damageMultiplier * (isCrit ? 2.0 : 1.0));
      const killed = store.getState().damageEnemy(enemy.id, finalDmg, isCrit);
      addParticle(ep, isCrit ? '#ffaa00' : '#cc2200', isCrit ? 18 : 10);
      hitAny = true;
      if (killed) {
        store.getState().incrementKills();
        store.getState().addScore(enemy.maxHealth * comboRef.current * (isCrit ? 2 : 1));
        store.getState().addXP(ENEMY_STATS[enemy.type].xpValue);
      }
    });

    if (hitAny) {
      store.getState().triggerScreenShake(heavy ? 0.28 : 0.1);
      store.getState().restoreEnergy(heavy ? 18 : 8);
    }
    setTimeout(() => {
      isAtkRef.current = false;
      isHeavyRef.current = false;
      animStateRef.current = 'idle';
      store.getState().setPlayerAttacking(false);
    }, (heavy ? HEAVY_COOLDOWN : ATTACK_COOLDOWN) * 600);
  }, [bones.root, store, addParticle]);

  const doSkill = useCallback((id: SkillId) => {
    const { player } = store.getState();
    if (!bones.root.current) return;
    const pos = bones.root.current.position;
    const forward = new THREE.Vector3(-Math.sin(rotRef.current), 0, -Math.cos(rotRef.current));
    if (!store.getState().useSkill(id)) return;

    if (id === 'whirlwind') {
      animStateRef.current = 'whirlwind';
      addParticle(pos, '#ff4422', 25, 10);
      addParticle(pos, '#ff8800', 15, 8);
      const { enemies } = store.getState();
      enemies.forEach((enemy) => {
        if (enemy.state === 'dead') return;
        const ep = new THREE.Vector3(enemy.position.x, 0, enemy.position.z);
        if (ep.distanceTo(pos) > 4.8) return;
        const isCrit = rollCrit();
        const dmg = Math.round(65 * player.damageMultiplier * (isCrit ? 2 : 1));
        const killed = store.getState().damageEnemy(enemy.id, dmg, isCrit);
        addParticle(ep, '#ff6600', 12, 9);
        if (killed) { store.getState().incrementKills(); store.getState().addScore(enemy.maxHealth * 2); store.getState().addXP(ENEMY_STATS[enemy.type].xpValue); }
      });
      store.getState().triggerScreenShake(0.35);
    }
    if (id === 'phantomStrike') {
      phantomDirRef.current.copy(forward);
      phantomDashRef.current = 0.4;
      addParticle(pos, '#4488ff', 20, 12);
      addParticle(pos, '#88ccff', 10, 8);
    }
    if (id === 'bloodRage') {
      addParticle(pos, '#cc0000', 30, 8);
      addParticle(pos, '#ff4400', 20, 6);
      store.getState().triggerScreenShake(0.2);
      store.getState().triggerHitFlash(0.15);
    }
    if (id === 'execute') {
      const { enemies } = store.getState();
      let executed = 0;
      enemies.forEach((enemy) => {
        if (enemy.state === 'dead') return;
        const ep = new THREE.Vector3(enemy.position.x, 0, enemy.position.z);
        if (ep.distanceTo(pos) > 5.0) return;
        const threshold = enemy.health / enemy.maxHealth;
        const dmg = threshold < 0.3 ? enemy.health + 1 : Math.round(90 * player.damageMultiplier);
        const isCrit = threshold < 0.3;
        const killed = store.getState().damageEnemy(enemy.id, dmg, isCrit);
        addParticle(ep, '#aa44ff', 18, 10);
        addParticle(ep, '#8800cc', 10, 8);
        executed++;
        if (killed) { store.getState().incrementKills(); store.getState().addScore(enemy.maxHealth * (isCrit ? 3 : 1)); store.getState().addXP(ENEMY_STATS[enemy.type].xpValue * (isCrit ? 2 : 1)); }
      });
      if (executed > 0) store.getState().triggerScreenShake(0.4);
    }
  }, [bones.root, store, addParticle]);

  function animateBones(dt: number, speed: number, anim: AnimState, t: number, isBlocking: boolean, isRaging: boolean) {
    const s = Math.min(dt * 15, 1);
    const isWW = anim === 'whirlwind';
    const freq = anim === 'run' ? t * 9 : t * 5.5;
    const amp = anim === 'run' ? 1.1 : anim === 'walk' ? 0.75 : isWW ? 0 : 0.05;
    const walkSwing = Math.sin(freq) * amp;
    const isMoving = anim === 'walk' || anim === 'run';
    const isAtk = anim === 'attack' || anim === 'heavy';

    if (isWW && bones.root.current) bones.root.current.rotation.y += dt * 12;

    if (bones.hip.current) {
      bones.hip.current.position.y = lerp(bones.hip.current.position.y, isMoving ? Math.abs(Math.sin(freq * 2)) * 0.09 : Math.sin(t * 1.8) * 0.012, s);
    }
    if (bones.spine.current) {
      bones.spine.current.rotation.x = lerp(bones.spine.current.rotation.x, isBlocking ? -0.22 : isAtk ? 0.14 : 0, s * 0.55);
    }
    if (bones.chest.current) {
      bones.chest.current.rotation.y = lerp(bones.chest.current.rotation.y, isMoving ? -Math.cos(freq) * 0.1 : 0, s * 0.8);
    }
    if (bones.head.current) {
      bones.head.current.rotation.x = lerp(bones.head.current.rotation.x, isAtk ? -0.12 : Math.sin(t * 1.1) * 0.025, s * 0.5);
    }

    if (bones.thighR.current) bones.thighR.current.rotation.x = lerp(bones.thighR.current.rotation.x, isMoving ? walkSwing * 0.65 : 0, s);
    if (bones.shinR.current) bones.shinR.current.rotation.x = lerp(bones.shinR.current.rotation.x, isMoving ? Math.max(0, -Math.sin(freq)) * 0.72 : 0, s);
    if (bones.thighL.current) bones.thighL.current.rotation.x = lerp(bones.thighL.current.rotation.x, isMoving ? -walkSwing * 0.65 : 0, s);
    if (bones.shinL.current) bones.shinL.current.rotation.x = lerp(bones.shinL.current.rotation.x, isMoving ? Math.max(0, Math.sin(freq)) * 0.72 : 0, s);

    if (bones.upperArmL.current) {
      bones.upperArmL.current.rotation.x = lerp(bones.upperArmL.current.rotation.x, isBlocking ? -1.3 : isMoving ? -walkSwing * 0.5 : Math.sin(t * 0.9) * 0.02, s);
      bones.upperArmL.current.rotation.z = lerp(bones.upperArmL.current.rotation.z, isBlocking ? -0.55 : -0.12, s);
    }
    if (bones.foreArmL.current) {
      bones.foreArmL.current.rotation.x = lerp(bones.foreArmL.current.rotation.x, isBlocking ? -0.95 : 0, s);
    }

    if (bones.swordPivot.current) {
      atkPhaseRef.current += dt * (isHeavyRef.current ? 5 : 7.5);
      let txR = 0, tzR = 0, tyR = 0;
      if (isAtk || isWW) {
        const ph = isWW ? t * 8 : atkPhaseRef.current;
        if (isWW) {
          txR = -0.6; tzR = Math.sin(ph) * 0.8; tyR = Math.cos(ph) * 0.4;
        } else if (isHeavyRef.current) {
          txR = ph < 1 ? lerp(-0.9, -2.2, ph) : lerp(-2.2, 0.9, ph - 1);
          tzR = Math.sin(ph * Math.PI) * 0.45; tyR = 0;
        } else {
          txR = ph < 0.8 ? lerp(-0.5, -1.9, ph / 0.8) : lerp(-1.9, 0.25, (ph - 0.8) / 1.2);
          tzR = comboRef.current % 2 === 1
            ? (ph < 0.8 ? lerp(-0.3, 0.6, ph / 0.8) : lerp(0.6, -0.3, (ph - 0.8) / 1.2))
            : (ph < 0.8 ? lerp(-0.3, -0.8, ph / 0.8) : lerp(-0.8, -0.3, (ph - 0.8) / 1.2));
          tyR = Math.sin(ph * Math.PI) * 0.25;
        }
      } else {
        txR = isMoving ? walkSwing * 0.52 : Math.sin(t * 0.95) * 0.025;
        tzR = 0.08; tyR = 0;
      }
      bones.swordPivot.current.rotation.x = lerp(bones.swordPivot.current.rotation.x, txR, s * 0.88);
      bones.swordPivot.current.rotation.z = lerp(bones.swordPivot.current.rotation.z, tzR, s * 0.88);
      bones.swordPivot.current.rotation.y = lerp(bones.swordPivot.current.rotation.y, tyR, s * 0.88);
    }

    if (bones.cape.current) {
      bones.cape.current.rotation.x = lerp(bones.cape.current.rotation.x, isMoving ? speed * 0.048 + Math.sin(t * 3.2) * 0.032 : Math.sin(t * 1.6) * 0.012, s * 0.3);
      bones.cape.current.rotation.z = lerp(bones.cape.current.rotation.z, isMoving ? Math.sin(freq * 0.5) * 0.045 : 0, s * 0.3);
    }

    if (trailMeshRef.current) {
      trailOpRef.current = Math.max(0, trailOpRef.current - dt * 5.5);
      (trailMeshRef.current.material as THREE.MeshBasicMaterial).opacity = trailOpRef.current * 0.55;
    }
    if (swordGlowRef.current) {
      const target = isAtk || isWW ? (isHeavyRef.current ? 7 : 4) : (isRaging ? 2 : 0.7);
      swordGlowRef.current.intensity = lerp(swordGlowRef.current.intensity, target, s);
    }
    if (bones.auraRing.current) {
      const { player } = store.getState();
      const mat = bones.auraRing.current.material as THREE.MeshBasicMaterial;
      mat.opacity = lerp(mat.opacity, isRaging ? 0.65 : player.isPhantomStriking ? 0.45 : 0, s * 2);
      bones.auraRing.current.rotation.y = t * (isRaging ? 3 : 5);
      mat.color.setHex(isRaging ? 0xcc0000 : 0x4488ff);
    }
    if (bones.whirlRing.current) {
      const mat = bones.whirlRing.current.material as THREE.MeshBasicMaterial;
      mat.opacity = lerp(mat.opacity, isWW ? 0.8 : 0, s * 3);
      bones.whirlRing.current.rotation.y = t * 15;
      if (isWW) bones.whirlRing.current.scale.setScalar(lerp(bones.whirlRing.current.scale.x, 5, s * 2));
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

    store.getState().restoreStamina(22 * dt * (player.isBlocking ? 0.3 : 1));
    store.getState().restoreEnergy(ENERGY_REGEN * dt * (player.isRaging ? 0.5 : 1));
    if (player.isRaging) store.getState().setPlayerHealth(player.health + 4 * dt);
    store.getState().tickEffects(dt);
    store.getState().tickSkills(dt);
    store.getState().tickDamageNumbers(dt);

    const keys = getKeys();
    const pos = bones.root.current.position;

    if (phantomDashRef.current > 0) {
      phantomDashRef.current -= dt;
      pos.addScaledVector(phantomDirRef.current, 24 * dt);
      const { enemies } = store.getState();
      enemies.forEach((enemy) => {
        if (enemy.state === 'dead') return;
        const ep = new THREE.Vector3(enemy.position.x, 0, enemy.position.z);
        if (ep.distanceTo(pos) < 2.5) {
          const isCrit = rollCrit();
          const dmg = Math.round(90 * player.damageMultiplier * (isCrit ? 2 : 1));
          const killed = store.getState().damageEnemy(enemy.id, dmg, isCrit);
          addParticle(ep, '#4488ff', 10, 9);
          if (killed) { store.getState().incrementKills(); store.getState().addScore(enemy.maxHealth * 2); store.getState().addXP(ENEMY_STATS[enemy.type].xpValue); }
        }
      });
      const r = 28.5, d = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
      if (d > r) { const n = new THREE.Vector3(pos.x, 0, pos.z).normalize(); pos.x = n.x * r; pos.z = n.z * r; }
      onCameraTarget(pos, rotRef.current);
      animateBones(dt, 20, 'run', t, false, player.isRaging);
      return;
    }

    if (dodgeTimerRef.current > 0) {
      dodgeTimerRef.current -= dt;
      isDodgingRef.current = true;
      pos.addScaledVector(dodgeDirRef.current, DODGE_SPEED * dt);
      pos.y = 0;
      const r = 28.5, d = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
      if (d > r) { const n = new THREE.Vector3(pos.x, 0, pos.z).normalize(); pos.x = n.x * r; pos.z = n.z * r; }
      animStateRef.current = 'dodge';
      animateBones(dt, DODGE_SPEED, 'dodge', t, false, player.isRaging);
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
        if (locked && locked.state !== 'dead') targetAngle = Math.atan2(-(locked.position.x - pos.x), -(locked.position.z - pos.z));
        else { store.getState().setLockTarget(null); targetAngle = Math.atan2(-moveDir.x, -moveDir.z); }
      } else targetAngle = Math.atan2(-moveDir.x, -moveDir.z);
      rotRef.current = lerpAngle(rotRef.current, targetAngle, ROT_SPEED * dt);
      velRef.current.lerp(moveDir.multiplyScalar(MOVE_SPEED * (isAtkRef.current ? 0.3 : 1)), 10 * dt);
      if (!isAtkRef.current) animStateRef.current = velRef.current.length() > 5 ? 'run' : 'walk';
    } else {
      velRef.current.lerp(new THREE.Vector3(), 12 * dt);
      if (!isAtkRef.current && !isBlocking && animStateRef.current !== 'whirlwind') animStateRef.current = 'idle';
    }

    if (!player.isWhirlwinding) {
      pos.addScaledVector(velRef.current, dt);
      pos.y = 0;
      const r = 28.5, d = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
      if (d > r) { const n = new THREE.Vector3(pos.x, 0, pos.z).normalize(); pos.x = n.x * r; pos.z = n.z * r; }
      bones.root.current.rotation.y = rotRef.current;
    }

    if (keys.jump && dodgeCDRef.current <= 0 && player.stamina >= DODGE_STA) {
      if (store.getState().consumeStamina(DODGE_STA)) {
        const dd = isMoving ? velRef.current.clone().normalize() : new THREE.Vector3(-Math.sin(rotRef.current), 0, -Math.cos(rotRef.current));
        dodgeDirRef.current.copy(dd);
        dodgeTimerRef.current = DODGE_DURATION;
        dodgeCDRef.current = DODGE_COOLDOWN;
        invFrameRef.current = DODGE_DURATION + 0.12;
        store.getState().setPlayerDodging(true);
      }
    }

    if (keys.heavy && atkCDRef.current <= 0 && !isAtkRef.current) doAttack(true);
    else if (keys.attack && atkCDRef.current <= 0 && !isAtkRef.current) doAttack(false);

    if (keys.lockOn && !prevKeysRef.current.lockOn) {
      const { player: p, enemies } = store.getState();
      if (p.lockedTargetId) store.getState().setLockTarget(null);
      else {
        const living = enemies.filter(e => e.state !== 'dead');
        if (living.length > 0) {
          const nearest = living.reduce((best, e) => {
            const da = (e.position.x - pos.x) ** 2 + (e.position.z - pos.z) ** 2;
            const db = (best.position.x - pos.x) ** 2 + (best.position.z - pos.z) ** 2;
            return da < db ? e : best;
          });
          store.getState().setLockTarget(nearest.id);
        }
      }
    }

    const SKILL_KEYS: [Controls, SkillId][] = [
      [Controls.skill1, 'whirlwind'],
      [Controls.skill2, 'phantomStrike'],
      [Controls.skill3, 'bloodRage'],
      [Controls.skill4, 'execute'],
    ];
    SKILL_KEYS.forEach(([ctrl, id]) => {
      if (keys[ctrl] && !prevKeysRef.current[ctrl]) doSkill(id);
    });

    prevKeysRef.current = { ...keys };
    animateBones(dt, velRef.current.length(), animStateRef.current, t, isBlocking, player.isRaging);

    const { enemies, player: cp } = store.getState();
    if (invFrameRef.current <= 0 && !cp.isWhirlwinding) {
      let dmg = 0;
      enemies.forEach(e => {
        if (e.state !== 'attacking') return;
        const d = Math.sqrt((pos.x - e.position.x) ** 2 + (pos.z - e.position.z) ** 2);
        const range = e.type === 'boss' ? 3.5 : e.type === 'berserker' ? 3.0 : 2.5;
        if (d < range) {
          const raw = e.type === 'scout' ? 5 : e.type === 'berserker' ? 18 : e.type === 'boss' ? 25 : 10;
          dmg += raw * dt * (cp.isBlocking ? 0.1 : 1);
        }
      });
      if (dmg > 0) {
        const newHp = cp.health - dmg;
        if (newHp <= 0) store.getState().setPlayerDead();
        else {
          store.getState().setPlayerHealth(newHp);
          if (!cp.isBlocking) { store.getState().triggerHitFlash(0.7); store.getState().triggerScreenShake(0.42); }
        }
      }
    }
    onCameraTarget(pos, rotRef.current);
  });

  const { player } = useGameStore();
  if (!player.isAlive) return null;

  const isRaging = player.isRaging;
  const isBlocking = player.isBlocking;
  const isWW = player.isWhirlwinding;
  const isPhantom = player.isPhantomStriking;

  const re = isRaging ? '#770000' : isPhantom ? '#002255' : '#000000';
  const ri = isRaging ? 0.7 : isPhantom ? 0.45 : 0;
  const goldRe = isRaging ? '#442200' : '#000000';
  const goldRi = isRaging ? 0.5 : 0;
  const eyeColor = isRaging ? '#ff2200' : '#4499ff';
  const bladePulse = isRaging ? '#ff2200' : isPhantom ? '#4499ff' : '#224488';

  return (
    <group ref={bones.root}>
      <group ref={bones.hip} position={[0, 0.96, 0]}>
        <group ref={bones.spine}>
          {/* === PELVIS / LOWER TORSO === */}
          <mesh position={[0, 0.04, 0]} castShadow>
            <boxGeometry args={[0.72, 0.38, 0.38]} />
            <meshStandardMaterial color="#1a0a06" roughness={0.65} metalness={0.3} />
          </mesh>
          {/* Fauld - articulated waist plates */}
          {[-0.22, 0, 0.22].map((xo, i) => (
            <mesh key={i} position={[xo, -0.05, 0.19]} castShadow>
              <boxGeometry args={[0.2, 0.24, 0.06]} />
              <meshStandardMaterial color="#6a0e0e" roughness={0.32} metalness={0.72} emissive={re} emissiveIntensity={ri * 0.5} />
            </mesh>
          ))}
          {/* Tassets - hanging hip armor L/R */}
          {[-1, 1].map((side) => (
            <group key={side} position={[side * 0.33, -0.04, 0]}>
              <mesh position={[0, -0.1, 0]} castShadow>
                <boxGeometry args={[0.22, 0.2, 0.1]} />
                <meshStandardMaterial color="#6a0e0e" roughness={0.32} metalness={0.72} emissive={re} emissiveIntensity={ri * 0.5} />
              </mesh>
              <mesh position={[0, -0.3, 0]} castShadow>
                <boxGeometry args={[0.19, 0.2, 0.09]} />
                <meshStandardMaterial color="#5a0c0c" roughness={0.35} metalness={0.7} emissive={re} emissiveIntensity={ri * 0.4} />
              </mesh>
            </group>
          ))}

          <group ref={bones.chest} position={[0, 0.26, 0]}>
            {/* === MAIN TORSO === */}
            {/* Spine/back plate */}
            <mesh position={[0, 0.28, -0.04]} castShadow>
              <boxGeometry args={[0.78, 0.56, 0.3]} />
              <meshStandardMaterial color="#1e0c08" roughness={0.68} metalness={0.28} />
            </mesh>
            {/* Breastplate - main piece */}
            <mesh position={[0, 0.28, 0.09]} castShadow>
              <boxGeometry args={[0.82, 0.54, 0.22]} />
              <meshStandardMaterial color="#860d0d" roughness={0.25} metalness={0.82} emissive={re} emissiveIntensity={ri} />
            </mesh>
            {/* Breastplate raised center ridge */}
            <mesh position={[0, 0.28, 0.2]} castShadow>
              <boxGeometry args={[0.18, 0.52, 0.04]} />
              <meshStandardMaterial color="#a01212" roughness={0.2} metalness={0.85} emissive={re} emissiveIntensity={ri * 1.2} />
            </mesh>
            {/* Gold border trim around breastplate */}
            {[[-0.44, 0.28], [0.44, 0.28]].map(([x, y], i) => (
              <mesh key={i} position={[x, y, 0.16]} castShadow>
                <boxGeometry args={[0.06, 0.52, 0.03]} />
                <meshStandardMaterial color="#b88820" roughness={0.18} metalness={0.9} emissive={goldRe} emissiveIntensity={goldRi} />
              </mesh>
            ))}
            <mesh position={[0, 0.04, 0.17]} castShadow>
              <boxGeometry args={[0.9, 0.06, 0.03]} />
              <meshStandardMaterial color="#b88820" roughness={0.18} metalness={0.9} emissive={goldRe} emissiveIntensity={goldRi} />
            </mesh>
            <mesh position={[0, 0.52, 0.17]} castShadow>
              <boxGeometry args={[0.9, 0.06, 0.03]} />
              <meshStandardMaterial color="#b88820" roughness={0.18} metalness={0.9} emissive={goldRe} emissiveIntensity={goldRi} />
            </mesh>
            {/* Rune emblem center */}
            <mesh position={[0, 0.28, 0.215]}>
              <planeGeometry args={[0.15, 0.22]} />
              <meshBasicMaterial color={eyeColor} transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
            {/* Gorget - neck protection */}
            <mesh position={[0, 0.58, 0.06]} castShadow>
              <cylinderGeometry args={[0.18, 0.26, 0.16, 10]} />
              <meshStandardMaterial color="#750c0c" roughness={0.28} metalness={0.8} emissive={re} emissiveIntensity={ri * 0.6} />
            </mesh>
            {/* Gorget gold ring */}
            <mesh position={[0, 0.66, 0.06]}>
              <torusGeometry args={[0.185, 0.018, 6, 16]} />
              <meshStandardMaterial color="#b88820" roughness={0.18} metalness={0.9} />
            </mesh>

            {/* === HEAD === */}
            <group ref={bones.head} position={[0, 0.7, 0]}>
              {/* Skull base */}
              <mesh position={[0, 0.18, 0.02]} castShadow>
                <sphereGeometry args={[0.23, 10, 8]} />
                <meshStandardMaterial color="#c4925f" roughness={0.5} />
              </mesh>
              {/* Helmet - base band */}
              <mesh position={[0, 0.18, 0.02]} castShadow>
                <cylinderGeometry args={[0.225, 0.235, 0.22, 12]} />
                <meshStandardMaterial color="#1c1c2c" roughness={0.25} metalness={0.82} emissive={re} emissiveIntensity={ri * 0.5} />
              </mesh>
              {/* Helmet dome */}
              <mesh position={[0, 0.31, 0.02]} castShadow>
                <sphereGeometry args={[0.225, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
                <meshStandardMaterial color="#181826" roughness={0.22} metalness={0.85} />
              </mesh>
              {/* Helmet crest spine */}
              <mesh position={[0, 0.52, 0.02]} rotation={[0.1, 0, 0]} castShadow>
                <boxGeometry args={[0.06, 0.14, 0.26]} />
                <meshStandardMaterial color="#1a1a28" roughness={0.22} metalness={0.82} />
              </mesh>
              {/* Plume feathers */}
              {[-0.015, 0, 0.015].map((xo, fi) => (
                <mesh key={fi} position={[xo, 0.64, 0.02 + fi * 0.012]} castShadow>
                  <boxGeometry args={[0.04, 0.28, 0.06]} />
                  <meshStandardMaterial color={fi === 1 ? '#cc0000' : '#880000'} roughness={0.92} />
                </mesh>
              ))}
              {/* Visor - horizontal slit */}
              <mesh position={[0, 0.21, 0.225]} castShadow>
                <boxGeometry args={[0.26, 0.055, 0.04]} />
                <meshStandardMaterial color="#0a0a14" roughness={0.5} metalness={0.6} />
              </mesh>
              {/* Visor - vertical slit (T-shape) */}
              <mesh position={[0, 0.16, 0.226]} castShadow>
                <boxGeometry args={[0.055, 0.11, 0.038]} />
                <meshStandardMaterial color="#0a0a14" roughness={0.5} metalness={0.6} />
              </mesh>
              {/* Eye glow through visor */}
              <mesh position={[0, 0.21, 0.228]}>
                <planeGeometry args={[0.22, 0.038]} />
                <meshBasicMaterial color={eyeColor} transparent opacity={0.95} />
              </mesh>
              {/* Cheek guards */}
              {[-1, 1].map((side) => (
                <group key={side} position={[side * 0.18, 0.13, 0.16]}>
                  <mesh castShadow>
                    <boxGeometry args={[0.08, 0.25, 0.11]} />
                    <meshStandardMaterial color="#181826" roughness={0.25} metalness={0.82} />
                  </mesh>
                </group>
              ))}
              {/* Helmet gold rim */}
              <mesh position={[0, 0.08, 0.02]}>
                <torusGeometry args={[0.225, 0.016, 5, 16]} />
                <meshStandardMaterial color="#b88820" roughness={0.18} metalness={0.9} emissive={goldRe} emissiveIntensity={goldRi} />
              </mesh>
            </group>

            {/* === PAULDRONS (SHOULDERS) === */}
            {[-1, 1].map((side) => (
              <group key={side} position={[side * 0.5, 0.28, 0]}>
                {/* Main shoulder piece */}
                <mesh position={[side * 0.06, 0, 0]} castShadow>
                  <boxGeometry args={[0.28, 0.28, 0.28]} />
                  <meshStandardMaterial color="#860d0d" roughness={0.26} metalness={0.82} emissive={re} emissiveIntensity={ri * 0.8} />
                </mesh>
                {/* Pauldron upper plate */}
                <mesh position={[side * 0.1, 0.14, -0.01]} rotation={[0, 0, side * -0.25]} castShadow>
                  <boxGeometry args={[0.32, 0.1, 0.3]} />
                  <meshStandardMaterial color="#9a1010" roughness={0.24} metalness={0.84} emissive={re} emissiveIntensity={ri} />
                </mesh>
                {/* Pauldron lower plate */}
                <mesh position={[side * 0.07, -0.14, 0.01]} rotation={[0.15, 0, side * -0.12]} castShadow>
                  <boxGeometry args={[0.26, 0.1, 0.27]} />
                  <meshStandardMaterial color="#750d0d" roughness={0.28} metalness={0.8} />
                </mesh>
                {/* Gold trim on pauldron */}
                <mesh position={[side * 0.1, 0.19, -0.01]} castShadow>
                  <boxGeometry args={[0.33, 0.04, 0.31]} />
                  <meshStandardMaterial color="#b88820" roughness={0.18} metalness={0.9} emissive={goldRe} emissiveIntensity={goldRi} />
                </mesh>
              </group>
            ))}

            {/* === RIGHT ARM (SWORD) === */}
            <group position={[0.52, 0.1, 0]}>
              <group ref={bones.upperArmR} position={[0.14, -0.1, 0]}>
                {/* Rerebrace (upper arm plate) */}
                <mesh position={[0, -0.18, 0]} castShadow>
                  <capsuleGeometry args={[0.1, 0.32, 4, 6]} />
                  <meshStandardMaterial color="#6a0e0e" roughness={0.52} metalness={0.45} />
                </mesh>
                <mesh position={[0, -0.18, 0.1]} castShadow>
                  <boxGeometry args={[0.2, 0.32, 0.06]} />
                  <meshStandardMaterial color="#860d0d" roughness={0.28} metalness={0.8} emissive={re} emissiveIntensity={ri * 0.5} />
                </mesh>
                {/* Couter (elbow) */}
                <mesh position={[0, -0.4, 0.04]} castShadow>
                  <sphereGeometry args={[0.1, 7, 6]} />
                  <meshStandardMaterial color="#750c0c" roughness={0.3} metalness={0.78} />
                </mesh>

                <group ref={bones.foreArmR} position={[0, -0.5, 0]}>
                  {/* Vambrace */}
                  <mesh position={[0, -0.15, 0]} castShadow>
                    <capsuleGeometry args={[0.09, 0.26, 4, 6]} />
                    <meshStandardMaterial color="#5a0c0c" roughness={0.55} metalness={0.42} />
                  </mesh>
                  <mesh position={[0, -0.15, 0.09]} castShadow>
                    <boxGeometry args={[0.19, 0.28, 0.05]} />
                    <meshStandardMaterial color="#860d0d" roughness={0.28} metalness={0.8} />
                  </mesh>
                  {/* Gauntlet */}
                  <mesh position={[0, -0.37, 0.02]} castShadow>
                    <boxGeometry args={[0.23, 0.2, 0.22]} />
                    <meshStandardMaterial color="#750c0c" roughness={0.28} metalness={0.82} emissive={re} emissiveIntensity={ri * 0.8} />
                  </mesh>
                  {/* Gold trim on gauntlet */}
                  <mesh position={[0, -0.27, 0.02]}>
                    <boxGeometry args={[0.24, 0.04, 0.23]} />
                    <meshStandardMaterial color="#b88820" roughness={0.18} metalness={0.9} emissive={goldRe} emissiveIntensity={goldRi} />
                  </mesh>
                  {/* Fingers (simplified) */}
                  {[-0.07, 0, 0.07].map((xo, fi) => (
                    <mesh key={fi} position={[xo, -0.5, 0.04]} castShadow>
                      <boxGeometry args={[0.055, 0.1, 0.07]} />
                      <meshStandardMaterial color="#6a0e0e" roughness={0.35} metalness={0.75} />
                    </mesh>
                  ))}

                  {/* SWORD */}
                  <group ref={bones.swordPivot} position={[0, -0.58, 0]}>
                    {/* Main blade */}
                    <mesh position={[0, -0.6, 0]} castShadow>
                      <boxGeometry args={[0.058, 1.22, 0.03]} />
                      <meshStandardMaterial color="#d0daea" roughness={0.06} metalness={1.0} envMapIntensity={4} />
                    </mesh>
                    {/* Blade taper tip */}
                    <mesh position={[0, -1.26, 0]} rotation={[0, 0, Math.PI]} castShadow>
                      <coneGeometry args={[0.032, 0.14, 4]} />
                      <meshStandardMaterial color="#d0daea" roughness={0.06} metalness={1.0} />
                    </mesh>
                    {/* Fuller groove */}
                    <mesh position={[0, -0.6, 0]}>
                      <boxGeometry args={[0.016, 1.05, 0.005]} />
                      <meshStandardMaterial color="#e8eeff" roughness={0.04} metalness={1} envMapIntensity={5} />
                    </mesh>
                    {/* Rune glow on blade */}
                    <mesh position={[0.03, -0.5, 0.016]}>
                      <planeGeometry args={[0.035, 0.48]} />
                      <meshBasicMaterial color={bladePulse} transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} />
                    </mesh>
                    {/* Crossguard */}
                    <mesh position={[0, -0.05, 0]} castShadow>
                      <boxGeometry args={[0.46, 0.07, 0.07]} />
                      <meshStandardMaterial color="#c09228" roughness={0.15} metalness={0.95} />
                    </mesh>
                    {/* Crossguard quillons detail */}
                    {[-1, 1].map((side) => (
                      <mesh key={side} position={[side * 0.22, -0.05, 0]} castShadow>
                        <sphereGeometry args={[0.048, 6, 5]} />
                        <meshStandardMaterial color="#d4a030" roughness={0.12} metalness={0.96} />
                      </mesh>
                    ))}
                    {/* Grip (wire wrapped) */}
                    {[0.06, 0.03, 0, -0.03, -0.06, -0.09].map((yo, i) => (
                      <mesh key={i} position={[0, yo, 0]} castShadow>
                        <torusGeometry args={[0.034, 0.012, 5, 12]} />
                        <meshStandardMaterial color={i % 2 === 0 ? '#3a1a08' : '#2a1006'} roughness={0.8} />
                      </mesh>
                    ))}
                    {/* Pommel */}
                    <mesh position={[0, 0.15, 0]} castShadow>
                      <cylinderGeometry args={[0.062, 0.048, 0.06, 8]} />
                      <meshStandardMaterial color="#c09228" roughness={0.15} metalness={0.95} />
                    </mesh>
                    <mesh position={[0, 0.2, 0]} castShadow>
                      <sphereGeometry args={[0.078, 8, 6]} />
                      <meshStandardMaterial color="#b88820" roughness={0.14} metalness={0.96} emissive={goldRe} emissiveIntensity={goldRi} />
                    </mesh>
                    {/* Sword trail */}
                    <mesh ref={trailMeshRef} position={[0, -0.6, 0]}>
                      <planeGeometry args={[0.85, 1.4]} />
                      <meshBasicMaterial color={isHeavyRef.current ? '#cc44ff' : '#44aaff'} transparent opacity={0} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
                    </mesh>
                    <pointLight ref={swordGlowRef} color={isRaging ? '#ff4400' : isHeavyRef.current ? '#cc44ff' : '#4488ff'} intensity={0.7} distance={3.5} decay={2} />
                  </group>
                </group>
              </group>
            </group>

            {/* === LEFT ARM === */}
            <group position={[-0.52, 0.1, 0]}>
              <group ref={bones.upperArmL} position={[-0.14, -0.1, 0]}>
                <mesh position={[0, -0.18, 0]} castShadow>
                  <capsuleGeometry args={[0.1, 0.32, 4, 6]} />
                  <meshStandardMaterial color="#6a0e0e" roughness={0.52} metalness={0.45} />
                </mesh>
                <mesh position={[0, -0.18, 0.1]} castShadow>
                  <boxGeometry args={[0.2, 0.32, 0.06]} />
                  <meshStandardMaterial color="#860d0d" roughness={0.28} metalness={0.8} />
                </mesh>
                <mesh position={[0, -0.4, 0.04]} castShadow>
                  <sphereGeometry args={[0.1, 7, 6]} />
                  <meshStandardMaterial color="#750c0c" roughness={0.3} metalness={0.78} />
                </mesh>
                <group ref={bones.foreArmL} position={[0, -0.5, 0]}>
                  <mesh position={[0, -0.15, 0]} castShadow>
                    <capsuleGeometry args={[0.09, 0.26, 4, 6]} />
                    <meshStandardMaterial color="#5a0c0c" roughness={0.55} metalness={0.42} />
                  </mesh>
                  <mesh position={[0, -0.15, 0.09]} castShadow>
                    <boxGeometry args={[0.19, 0.28, 0.05]} />
                    <meshStandardMaterial color="#860d0d" roughness={0.28} metalness={0.8} />
                  </mesh>
                  <mesh position={[0, -0.37, 0.02]} castShadow>
                    <boxGeometry args={[0.23, 0.2, 0.22]} />
                    <meshStandardMaterial color="#750c0c" roughness={0.28} metalness={0.82} />
                  </mesh>
                  {/* Shield when blocking */}
                  {isBlocking && (
                    <group position={[-0.12, -0.35, -0.32]} rotation={[0.25, -0.42, 0.08]}>
                      <mesh castShadow>
                        <boxGeometry args={[0.6, 0.82, 0.072]} />
                        <meshStandardMaterial color="#22223a" roughness={0.38} metalness={0.75} />
                      </mesh>
                      <mesh position={[0, 0, 0.04]}>
                        <boxGeometry args={[0.42, 0.6, 0.02]} />
                        <meshStandardMaterial color="#861010" roughness={0.28} metalness={0.8} emissive={re} emissiveIntensity={ri * 0.6} />
                      </mesh>
                      {/* Cross on shield */}
                      <mesh position={[0, 0, 0.055]}>
                        <boxGeometry args={[0.06, 0.52, 0.01]} />
                        <meshStandardMaterial color="#c09228" roughness={0.18} metalness={0.9} />
                      </mesh>
                      <mesh position={[0, 0, 0.055]}>
                        <boxGeometry args={[0.36, 0.06, 0.01]} />
                        <meshStandardMaterial color="#c09228" roughness={0.18} metalness={0.9} />
                      </mesh>
                    </group>
                  )}
                </group>
              </group>
            </group>

            {/* === CAPE === */}
            <group ref={bones.cape} position={[0, 0.08, -0.2]}>
              <mesh castShadow>
                <planeGeometry args={[0.84, 1.1, 2, 8]} />
                <meshStandardMaterial color="#780000" roughness={0.92} side={THREE.DoubleSide} />
              </mesh>
              <mesh position={[0, -0.55, 0.02]} castShadow>
                <planeGeometry args={[0.62, 0.55, 1, 4]} />
                <meshStandardMaterial color="#600000" roughness={0.94} side={THREE.DoubleSide} />
              </mesh>
            </group>
          </group>

          {/* === LEGS === */}
          {[1, -1].map((side) => (
            <group key={side} ref={side === 1 ? bones.thighR : bones.thighL} position={[side * 0.22, -0.04, 0]}>
              {/* Cuisse - upper leg */}
              <mesh position={[0, -0.22, 0]} castShadow>
                <capsuleGeometry args={[0.115, 0.38, 4, 7]} />
                <meshStandardMaterial color="#1e0c06" roughness={0.65} metalness={0.28} />
              </mesh>
              {/* Cuisse plate front */}
              <mesh position={[side * 0.01, -0.18, 0.08]} castShadow>
                <boxGeometry args={[0.22, 0.36, 0.07]} />
                <meshStandardMaterial color="#750c0c" roughness={0.3} metalness={0.78} emissive={re} emissiveIntensity={ri * 0.4} />
              </mesh>

              <group ref={side === 1 ? bones.shinR : bones.shinL} position={[0, -0.52, 0]}>
                {/* Greave */}
                <mesh position={[0, -0.2, 0]} castShadow>
                  <capsuleGeometry args={[0.095, 0.34, 4, 6]} />
                  <meshStandardMaterial color="#1e0c06" roughness={0.65} metalness={0.28} />
                </mesh>
                {/* Knee guard (genouillere) */}
                <mesh position={[0, 0.03, 0.095]} castShadow>
                  <sphereGeometry args={[0.115, 7, 6]} />
                  <meshStandardMaterial color="#860d0d" roughness={0.28} metalness={0.8} emissive={re} emissiveIntensity={ri * 0.5} />
                </mesh>
                {/* Shin plate front */}
                <mesh position={[0, -0.22, 0.09]} castShadow>
                  <boxGeometry args={[0.18, 0.4, 0.06]} />
                  <meshStandardMaterial color="#750c0c" roughness={0.3} metalness={0.78} />
                </mesh>
                {/* Sabaton - foot armor */}
                <mesh position={[0, -0.52, 0.04]} castShadow>
                  <boxGeometry args={[0.21, 0.1, 0.32]} />
                  <meshStandardMaterial color="#6a0e0e" roughness={0.32} metalness={0.75} />
                </mesh>
                {/* Sabaton toe point */}
                <mesh position={[0, -0.52, 0.22]} rotation={[0.3, 0, 0]} castShadow>
                  <boxGeometry args={[0.14, 0.08, 0.12]} />
                  <meshStandardMaterial color="#860d0d" roughness={0.28} metalness={0.8} />
                </mesh>
              </group>
            </group>
          ))}
        </group>
      </group>

      {/* SKILL VISUAL EFFECTS */}
      <mesh ref={bones.auraRing} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.3, 32]} />
        <meshBasicMaterial color={isRaging ? '#cc0000' : '#4488ff'} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={bones.whirlRing} position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 1.1, 32]} />
        <meshBasicMaterial color="#ff6622" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {isRaging && <pointLight color="#ff1500" intensity={3.5} distance={9} decay={2} position={[0, 1.6, 0]} />}
      {isPhantom && <pointLight color="#4488ff" intensity={2.5} distance={7} decay={2} position={[0, 1.6, 0]} />}
      {isWW && <pointLight color="#ff7722" intensity={4.5} distance={8} decay={2} position={[0, 0.6, 0]} />}

      {player.lockedTargetId && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.62, 24]} />
          <meshBasicMaterial color="#ffcc00" transparent opacity={0.88} />
        </mesh>
      )}
      <pointLight color="#6688ff" intensity={0.35} distance={5} position={[0, 1.8, 0]} />
    </group>
  );
}
