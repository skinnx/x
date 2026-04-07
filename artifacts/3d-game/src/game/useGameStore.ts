import { create } from 'zustand';
import { Enemy, PlayerState, GameState, Particle, Skill, SkillId, DamageNumber, INITIAL_SKILLS, XP_PER_LEVEL } from './types';
import { v4 as uuidv4 } from 'uuid';

interface GameStore {
  player: PlayerState;
  enemies: Enemy[];
  gameState: GameState;
  particles: Particle[];
  damageNumbers: DamageNumber[];

  setPlayerHealth: (health: number) => void;
  setPlayerStamina: (stamina: number) => void;
  setPlayerAttacking: (attacking: boolean, heavy?: boolean, combo?: number) => void;
  setPlayerDodging: (dodging: boolean) => void;
  setPlayerBlocking: (blocking: boolean) => void;
  setPlayerDead: () => void;
  consumeStamina: (amount: number) => boolean;
  restoreStamina: (amount: number) => void;
  consumeEnergy: (amount: number) => boolean;
  restoreEnergy: (amount: number) => void;
  setLockTarget: (id: string | null) => void;
  addXP: (amount: number) => void;

  useSkill: (id: SkillId) => boolean;
  tickSkills: (delta: number) => void;
  setSkillActive: (id: SkillId, active: boolean) => void;

  setEnemies: (enemies: Enemy[]) => void;
  updateEnemy: (id: string, updates: Partial<Enemy>) => void;
  damageEnemy: (id: string, damage: number, isCrit?: boolean) => boolean;
  removeDeadEnemies: () => void;

  setGamePhase: (phase: GameState['phase']) => void;
  incrementKills: () => void;
  addScore: (points: number) => void;
  nextWave: () => void;
  resetGame: () => void;
  announceWave: (msg: string) => void;
  triggerScreenShake: (intensity: number) => void;
  triggerHitFlash: (intensity: number) => void;
  tickEffects: (delta: number) => void;

  addParticle: (particle: Particle) => void;
  updateParticles: (delta: number) => void;

  addDamageNumber: (x: number, y: number, z: number, value: number, isCrit?: boolean, isHeal?: boolean, isSkill?: boolean) => void;
  tickDamageNumbers: (delta: number) => void;
}

function buildInitialPlayer(): PlayerState {
  return {
    health: 100, maxHealth: 100,
    stamina: 100, maxStamina: 100,
    energy: 100, maxEnergy: 100,
    level: 1, xp: 0, xpToNext: XP_PER_LEVEL[1],
    damageMultiplier: 1.0,
    isAttacking: false, isHeavyAttacking: false,
    attackCooldown: 0, combo: 0, lastAttackTime: 0,
    isDodging: false, dodgeCooldown: 0, isBlocking: false,
    kills: 0, isAlive: true, lockedTargetId: null,
    skills: { ...INITIAL_SKILLS },
    isRaging: false, rageTimer: 0,
    isWhirlwinding: false, whirlwindTimer: 0,
    isPhantomStriking: false,
  };
}

const initialGameState: GameState = {
  phase: 'menu', wave: 1, score: 0, elapsedTime: 0,
  waveAnnounce: '', waveAnnounceTimer: 0, screenShake: 0, hitFlash: 0,
};

export const useGameStore = create<GameStore>((set, get) => ({
  player: buildInitialPlayer(),
  enemies: [],
  gameState: { ...initialGameState },
  particles: [],
  damageNumbers: [],

  setPlayerHealth: (health) =>
    set((s) => ({ player: { ...s.player, health: Math.max(0, Math.min(health, s.player.maxHealth)) } })),

  setPlayerStamina: (stamina) =>
    set((s) => ({ player: { ...s.player, stamina: Math.max(0, Math.min(stamina, s.player.maxStamina)) } })),

  setPlayerAttacking: (attacking, heavy = false, combo) =>
    set((s) => ({
      player: { ...s.player, isAttacking: attacking, isHeavyAttacking: heavy,
        combo: combo !== undefined ? combo : s.player.combo,
        lastAttackTime: attacking ? Date.now() : s.player.lastAttackTime },
    })),

  setPlayerDodging: (dodging) => set((s) => ({ player: { ...s.player, isDodging: dodging } })),
  setPlayerBlocking: (blocking) => set((s) => ({ player: { ...s.player, isBlocking: blocking } })),

  setPlayerDead: () => set((s) => ({
    player: { ...s.player, isAlive: false, health: 0 },
    gameState: { ...s.gameState, phase: 'gameover' },
  })),

  consumeStamina: (amount) => {
    const { player } = get();
    if (player.stamina < amount) return false;
    set((s) => ({ player: { ...s.player, stamina: s.player.stamina - amount } }));
    return true;
  },

  restoreStamina: (amount) =>
    set((s) => ({ player: { ...s.player, stamina: Math.min(s.player.maxStamina, s.player.stamina + amount) } })),

  consumeEnergy: (amount) => {
    const { player } = get();
    if (player.energy < amount) return false;
    set((s) => ({ player: { ...s.player, energy: s.player.energy - amount } }));
    return true;
  },

  restoreEnergy: (amount) =>
    set((s) => ({ player: { ...s.player, energy: Math.min(s.player.maxEnergy, s.player.energy + amount) } })),

  setLockTarget: (id) => set((s) => ({ player: { ...s.player, lockedTargetId: id } })),

  addXP: (amount) => {
    const { player } = get();
    let xp = player.xp + amount;
    let level = player.level;
    let xpToNext = player.xpToNext;
    let maxHealth = player.maxHealth;
    let maxStamina = player.maxStamina;
    let maxEnergy = player.maxEnergy;
    let dmgMult = player.damageMultiplier;
    let didLevelUp = false;

    while (level < 10 && xp >= xpToNext) {
      xp -= xpToNext;
      level++;
      xpToNext = XP_PER_LEVEL[Math.min(level, 10)];
      maxHealth = 100 + (level - 1) * 15;
      maxStamina = 100 + (level - 1) * 10;
      maxEnergy = 100 + (level - 1) * 15;
      dmgMult = 1.0 + (level - 1) * 0.08;
      didLevelUp = true;
    }

    set((s) => ({
      player: {
        ...s.player, xp, level, xpToNext, maxHealth, maxStamina, maxEnergy,
        damageMultiplier: dmgMult,
        health: didLevelUp ? Math.min(s.player.health + 30, maxHealth) : s.player.health,
        energy: didLevelUp ? maxEnergy : s.player.energy,
      },
      gameState: didLevelUp
        ? { ...s.gameState, waveAnnounce: `LEVEL UP! → ${level}`, waveAnnounceTimer: 2.5 }
        : s.gameState,
    }));
  },

  useSkill: (id) => {
    const { player } = get();
    const skill = player.skills[id];
    if (skill.cooldown > 0) return false;
    if (id !== 'bloodRage' && player.energy < skill.energyCost) return false;

    let energyUsed = skill.energyCost;
    set((s) => ({
      player: {
        ...s.player,
        energy: Math.max(0, s.player.energy - energyUsed),
        skills: {
          ...s.player.skills,
          [id]: { ...skill, cooldown: skill.maxCooldown, isActive: true, activeTimer: skill.maxActiveTime },
        },
        isRaging: id === 'bloodRage' ? true : s.player.isRaging,
        rageTimer: id === 'bloodRage' ? skill.maxActiveTime : s.player.rageTimer,
        isWhirlwinding: id === 'whirlwind' ? true : s.player.isWhirlwinding,
        whirlwindTimer: id === 'whirlwind' ? skill.maxActiveTime : s.player.whirlwindTimer,
        isPhantomStriking: id === 'phantomStrike' ? true : s.player.isPhantomStriking,
        damageMultiplier: id === 'bloodRage' ? s.player.damageMultiplier * 1.8 : s.player.damageMultiplier,
      },
    }));
    return true;
  },

  setSkillActive: (id, active) =>
    set((s) => ({
      player: {
        ...s.player,
        skills: { ...s.player.skills, [id]: { ...s.player.skills[id], isActive: active } },
      },
    })),

  tickSkills: (delta) => {
    set((s) => {
      const skills = { ...s.player.skills } as Record<SkillId, Skill>;
      let isRaging = s.player.isRaging;
      let rageTimer = s.player.rageTimer;
      let isWhirlwinding = s.player.isWhirlwinding;
      let whirlwindTimer = s.player.whirlwindTimer;
      let isPhantomStriking = s.player.isPhantomStriking;
      let dmgMult = s.player.damageMultiplier;

      (Object.keys(skills) as SkillId[]).forEach((id) => {
        const sk = skills[id];
        if (sk.cooldown > 0) skills[id] = { ...sk, cooldown: Math.max(0, sk.cooldown - delta) };
        if (sk.isActive && sk.activeTimer > 0) {
          const newTimer = sk.activeTimer - delta;
          if (newTimer <= 0) {
            skills[id] = { ...sk, isActive: false, activeTimer: 0 };
            if (id === 'bloodRage') { isRaging = false; dmgMult = 1.0 + (s.player.level - 1) * 0.08; }
            if (id === 'whirlwind') isWhirlwinding = false;
            if (id === 'phantomStrike') isPhantomStriking = false;
          } else {
            skills[id] = { ...sk, activeTimer: newTimer };
          }
        }
      });

      if (isRaging) {
        rageTimer = Math.max(0, rageTimer - delta);
        if (rageTimer <= 0) { isRaging = false; dmgMult = 1.0 + (s.player.level - 1) * 0.08; }
      }
      if (isWhirlwinding) whirlwindTimer = Math.max(0, whirlwindTimer - delta);
      if (whirlwindTimer <= 0) isWhirlwinding = false;

      return {
        player: {
          ...s.player, skills, isRaging, rageTimer, isWhirlwinding, whirlwindTimer,
          isPhantomStriking, damageMultiplier: dmgMult,
        },
      };
    });
  },

  setEnemies: (enemies) => set({ enemies }),

  updateEnemy: (id, updates) =>
    set((s) => ({ enemies: s.enemies.map((e) => (e.id === id ? { ...e, ...updates } : e)) })),

  damageEnemy: (id, damage, isCrit = false) => {
    let killed = false;
    let pos = { x: 0, y: 0, z: 0 };
    set((s) => ({
      enemies: s.enemies.map((e) => {
        if (e.id !== id) return e;
        pos = e.position;
        const newHp = Math.max(0, e.health - damage);
        if (newHp <= 0 && e.state !== 'dead') killed = true;
        return {
          ...e, health: newHp,
          state: newHp <= 0 ? 'dead' : 'staggered',
          staggerTimer: newHp <= 0 ? 0 : 0.35,
          deathTimer: newHp <= 0 ? 1.4 : e.deathTimer,
        };
      }),
    }));
    get().addDamageNumber(pos.x, 2.5, pos.z, Math.round(damage), isCrit, false, false);
    return killed;
  },

  removeDeadEnemies: () =>
    set((s) => ({ enemies: s.enemies.filter((e) => !(e.state === 'dead' && e.deathTimer <= 0)) })),

  setGamePhase: (phase) => set((s) => ({ gameState: { ...s.gameState, phase } })),

  incrementKills: () => set((s) => ({ player: { ...s.player, kills: s.player.kills + 1 } })),

  addScore: (points) => set((s) => ({ gameState: { ...s.gameState, score: s.gameState.score + points } })),

  nextWave: () => set((s) => ({ gameState: { ...s.gameState, wave: s.gameState.wave + 1 } })),

  resetGame: () => set({ player: buildInitialPlayer(), enemies: [], gameState: { ...initialGameState }, particles: [], damageNumbers: [] }),

  announceWave: (msg) => set((s) => ({ gameState: { ...s.gameState, waveAnnounce: msg, waveAnnounceTimer: 3.0 } })),

  triggerScreenShake: (intensity) =>
    set((s) => ({ gameState: { ...s.gameState, screenShake: Math.max(s.gameState.screenShake, intensity) } })),

  triggerHitFlash: (intensity) =>
    set((s) => ({ gameState: { ...s.gameState, hitFlash: Math.max(s.gameState.hitFlash, intensity) } })),

  tickEffects: (delta) =>
    set((s) => ({
      gameState: {
        ...s.gameState,
        screenShake: Math.max(0, s.gameState.screenShake - delta * 5),
        hitFlash: Math.max(0, s.gameState.hitFlash - delta * 4),
        waveAnnounceTimer: Math.max(0, s.gameState.waveAnnounceTimer - delta),
        elapsedTime: s.gameState.elapsedTime + delta,
      },
    })),

  addParticle: (particle) =>
    set((s) => ({ particles: [...s.particles.slice(-140), particle] })),

  updateParticles: (delta) =>
    set((s) => ({
      particles: s.particles
        .map((p) => ({
          ...p, life: p.life - delta,
          position: { x: p.position.x + p.velocity.x * delta, y: p.position.y + p.velocity.y * delta, z: p.position.z + p.velocity.z * delta },
          velocity: { ...p.velocity, y: p.velocity.y - 9 * delta },
        }))
        .filter((p) => p.life > 0),
    })),

  addDamageNumber: (x, y, z, value, isCrit = false, isHeal = false, isSkill = false) =>
    set((s) => ({
      damageNumbers: [
        ...s.damageNumbers.slice(-20),
        { id: uuidv4(), x, y, z, value, isCrit, isHeal, isSkill, life: 1.4 },
      ],
    })),

  tickDamageNumbers: (delta) =>
    set((s) => ({ damageNumbers: s.damageNumbers.map((d) => ({ ...d, life: d.life - delta })).filter((d) => d.life > 0) })),
}));
