export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export type EnemyType = 'scout' | 'soldier' | 'berserker' | 'boss';

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

export interface PlayerState {
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
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
}

export const ENEMY_STATS: Record<EnemyType, {
  hp: number;
  speed: number;
  damage: number;
  attackRange: number;
  attackCooldown: number;
  size: number;
  color: string;
  armorColor: string;
  scoreValue: number;
  chaseRange: number;
}> = {
  scout: {
    hp: 50,
    speed: 5.5,
    damage: 6,
    attackRange: 2.0,
    attackCooldown: 0.9,
    size: 0.85,
    color: '#5a1818',
    armorColor: '#2a0808',
    scoreValue: 80,
    chaseRange: 28,
  },
  soldier: {
    hp: 120,
    speed: 3.2,
    damage: 12,
    attackRange: 2.5,
    attackCooldown: 1.4,
    size: 1.0,
    color: '#1a1a2a',
    armorColor: '#3a3a5a',
    scoreValue: 150,
    chaseRange: 22,
  },
  berserker: {
    hp: 220,
    speed: 2.5,
    damage: 22,
    attackRange: 2.8,
    attackCooldown: 1.8,
    size: 1.25,
    color: '#3a0808',
    armorColor: '#6a1010',
    scoreValue: 250,
    chaseRange: 26,
  },
  boss: {
    hp: 900,
    speed: 3.0,
    damage: 28,
    attackRange: 3.5,
    attackCooldown: 1.2,
    size: 1.6,
    color: '#1a0010',
    armorColor: '#6600aa',
    scoreValue: 1000,
    chaseRange: 35,
  },
};
