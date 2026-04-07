export interface Vector3D { x: number; y: number; z: number; }

export type EnemyType = 'scout' | 'soldier' | 'berserker' | 'boss';
export type SkillId = 'whirlwind' | 'phantomStrike' | 'bloodRage' | 'execute';

export interface Enemy {
  id: string;
  type: EnemyType;
  position: Vector3D;
  health: number;
  maxHealth: number;
  state: 'idle' | 'chasing' | 'attacking' | 'staggered' | 'dead';
  rotation: number;
  attackCooldown: number;
  spawnPosition: Vector3D;
  staggerTimer: number;
  deathTimer: number;
}

export interface Skill {
  id: SkillId;
  name: string;
  key: string;
  description: string;
  cooldown: number;
  maxCooldown: number;
  energyCost: number;
  isActive: boolean;
  activeTimer: number;
  maxActiveTime: number;
  color: string;
  icon: string;
}

export interface DamageNumber {
  id: string;
  x: number; y: number; z: number;
  value: number;
  isCrit: boolean;
  isHeal: boolean;
  isSkill: boolean;
  life: number;
}

export interface PlayerState {
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  energy: number;
  maxEnergy: number;
  level: number;
  xp: number;
  xpToNext: number;
  damageMultiplier: number;
  isAttacking: boolean;
  isHeavyAttacking: boolean;
  attackCooldown: number;
  combo: number;
  lastAttackTime: number;
  isDodging: boolean;
  dodgeCooldown: number;
  isBlocking: boolean;
  kills: number;
  isAlive: boolean;
  lockedTargetId: string | null;
  skills: Record<SkillId, Skill>;
  isRaging: boolean;
  rageTimer: number;
  isWhirlwinding: boolean;
  whirlwindTimer: number;
  isPhantomStriking: boolean;
}

export interface GameState {
  phase: 'menu' | 'playing' | 'paused' | 'gameover';
  wave: number;
  score: number;
  elapsedTime: number;
  waveAnnounce: string;
  waveAnnounceTimer: number;
  screenShake: number;
  hitFlash: number;
}

export interface Particle {
  id: string;
  position: Vector3D;
  velocity: Vector3D;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export enum Controls {
  forward = 'forward',
  back = 'back',
  left = 'left',
  right = 'right',
  jump = 'jump',
  attack = 'attack',
  heavy = 'heavy',
  block = 'block',
  lockOn = 'lockOn',
  skill1 = 'skill1',
  skill2 = 'skill2',
  skill3 = 'skill3',
  skill4 = 'skill4',
}

const makeSkill = (id: SkillId, name: string, key: string, desc: string, cd: number, energy: number, activeTime: number, color: string, icon: string): Skill => ({
  id, name, key, description: desc, cooldown: 0, maxCooldown: cd,
  energyCost: energy, isActive: false, activeTimer: 0, maxActiveTime: activeTime, color, icon,
});

export const INITIAL_SKILLS: Record<SkillId, Skill> = {
  whirlwind: makeSkill('whirlwind', 'Whirlwind', 'Z', 'Spin attack hitting all nearby enemies', 9, 40, 1.1, '#ff4422', '⚔'),
  phantomStrike: makeSkill('phantomStrike', 'Phantom Strike', 'X', 'Dash through enemies dealing massive damage', 7, 35, 0.4, '#4488ff', '⚡'),
  bloodRage: makeSkill('bloodRage', 'Blood Rage', 'C', '+80% damage, HP regen for 10s', 22, 0, 10, '#cc0000', '🩸'),
  execute: makeSkill('execute', 'Execute', 'V', 'Instantly execute weakened enemies', 13, 45, 0.3, '#aa44ff', '☠'),
};

export const XP_PER_LEVEL = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000];

export const ENEMY_STATS: Record<EnemyType, {
  hp: number; speed: number; damage: number; attackRange: number;
  attackCooldown: number; size: number; color: string; armorColor: string;
  scoreValue: number; chaseRange: number; xpValue: number;
}> = {
  scout:     { hp: 50,  speed: 5.5, damage: 6,  attackRange: 2.0, attackCooldown: 0.9, size: 0.85, color: '#5a1818', armorColor: '#2a0808', scoreValue: 80,   chaseRange: 28, xpValue: 30  },
  soldier:   { hp: 120, speed: 3.2, damage: 12, attackRange: 2.5, attackCooldown: 1.4, size: 1.0,  color: '#1a1a2a', armorColor: '#3a3a5a', scoreValue: 150,  chaseRange: 22, xpValue: 60  },
  berserker: { hp: 220, speed: 2.5, damage: 22, attackRange: 2.8, attackCooldown: 1.8, size: 1.25, color: '#3a0808', armorColor: '#6a1010', scoreValue: 250,  chaseRange: 26, xpValue: 100 },
  boss:      { hp: 900, speed: 3.0, damage: 28, attackRange: 3.5, attackCooldown: 1.2, size: 1.6,  color: '#1a0010', armorColor: '#6600aa', scoreValue: 1000, chaseRange: 35, xpValue: 400 },
};
