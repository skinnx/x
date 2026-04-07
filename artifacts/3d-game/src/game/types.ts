export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Enemy {
  id: string;
  position: Vector3D;
  health: number;
  maxHealth: number;
  state: 'idle' | 'chasing' | 'attacking' | 'dead';
  rotation: number;
  attackCooldown: number;
  spawnPosition: Vector3D;
}

export interface PlayerState {
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  isAttacking: boolean;
  attackCooldown: number;
  combo: number;
  lastAttackTime: number;
  isDodging: boolean;
  dodgeCooldown: number;
  kills: number;
  isAlive: boolean;
}

export interface GameState {
  phase: 'menu' | 'playing' | 'paused' | 'gameover' | 'victory';
  wave: number;
  totalEnemies: number;
  enemiesKilled: number;
  score: number;
  elapsedTime: number;
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
  dodge = 'dodge',
  block = 'block',
}
