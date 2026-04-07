import { create } from 'zustand';
import { Enemy, PlayerState, GameState, Particle } from './types';

interface GameStore {
  player: PlayerState;
  enemies: Enemy[];
  gameState: GameState;
  particles: Particle[];
  
  setPlayerHealth: (health: number) => void;
  setPlayerStamina: (stamina: number) => void;
  setPlayerAttacking: (attacking: boolean, combo?: number) => void;
  setPlayerDodging: (dodging: boolean) => void;
  setPlayerDead: () => void;
  consumeStamina: (amount: number) => boolean;
  restoreStamina: (amount: number) => void;
  
  setEnemies: (enemies: Enemy[]) => void;
  updateEnemy: (id: string, updates: Partial<Enemy>) => void;
  damageEnemy: (id: string, damage: number) => void;
  removeDeadEnemies: () => void;
  
  setGamePhase: (phase: GameState['phase']) => void;
  incrementKills: () => void;
  addScore: (points: number) => void;
  nextWave: () => void;
  resetGame: () => void;
  
  addParticle: (particle: Particle) => void;
  updateParticles: (delta: number) => void;
}

const initialPlayer: PlayerState = {
  health: 100,
  maxHealth: 100,
  stamina: 100,
  maxStamina: 100,
  isAttacking: false,
  attackCooldown: 0,
  combo: 0,
  lastAttackTime: 0,
  isDodging: false,
  dodgeCooldown: 0,
  kills: 0,
  isAlive: true,
};

const initialGameState: GameState = {
  phase: 'menu',
  wave: 1,
  totalEnemies: 5,
  enemiesKilled: 0,
  score: 0,
  elapsedTime: 0,
};

export const useGameStore = create<GameStore>((set, get) => ({
  player: { ...initialPlayer },
  enemies: [],
  gameState: { ...initialGameState },
  particles: [],

  setPlayerHealth: (health) =>
    set((s) => ({
      player: { ...s.player, health: Math.max(0, Math.min(health, s.player.maxHealth)) },
    })),

  setPlayerStamina: (stamina) =>
    set((s) => ({
      player: { ...s.player, stamina: Math.max(0, Math.min(stamina, s.player.maxStamina)) },
    })),

  setPlayerAttacking: (attacking, combo) =>
    set((s) => ({
      player: {
        ...s.player,
        isAttacking: attacking,
        combo: combo !== undefined ? combo : s.player.combo,
        lastAttackTime: attacking ? Date.now() : s.player.lastAttackTime,
      },
    })),

  setPlayerDodging: (dodging) =>
    set((s) => ({ player: { ...s.player, isDodging: dodging } })),

  setPlayerDead: () =>
    set((s) => ({
      player: { ...s.player, isAlive: false, health: 0 },
      gameState: { ...s.gameState, phase: 'gameover' },
    })),

  consumeStamina: (amount) => {
    const { player } = get();
    if (player.stamina < amount) return false;
    set((s) => ({
      player: { ...s.player, stamina: s.player.stamina - amount },
    }));
    return true;
  },

  restoreStamina: (amount) =>
    set((s) => ({
      player: {
        ...s.player,
        stamina: Math.min(s.player.maxStamina, s.player.stamina + amount),
      },
    })),

  setEnemies: (enemies) => set({ enemies }),

  updateEnemy: (id, updates) =>
    set((s) => ({
      enemies: s.enemies.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    })),

  damageEnemy: (id, damage) =>
    set((s) => ({
      enemies: s.enemies.map((e) =>
        e.id === id
          ? {
              ...e,
              health: Math.max(0, e.health - damage),
              state: e.health - damage <= 0 ? 'dead' : e.state,
            }
          : e
      ),
    })),

  removeDeadEnemies: () =>
    set((s) => ({
      enemies: s.enemies.filter((e) => e.state !== 'dead'),
    })),

  setGamePhase: (phase) =>
    set((s) => ({ gameState: { ...s.gameState, phase } })),

  incrementKills: () =>
    set((s) => ({
      player: { ...s.player, kills: s.player.kills + 1 },
      gameState: {
        ...s.gameState,
        enemiesKilled: s.gameState.enemiesKilled + 1,
      },
    })),

  addScore: (points) =>
    set((s) => ({
      gameState: { ...s.gameState, score: s.gameState.score + points },
    })),

  nextWave: () =>
    set((s) => ({
      gameState: {
        ...s.gameState,
        wave: s.gameState.wave + 1,
        totalEnemies: s.gameState.totalEnemies + 3,
        enemiesKilled: 0,
      },
    })),

  resetGame: () =>
    set({
      player: { ...initialPlayer },
      enemies: [],
      gameState: { ...initialGameState },
      particles: [],
    }),

  addParticle: (particle) =>
    set((s) => ({ particles: [...s.particles.slice(-80), particle] })),

  updateParticles: (delta) =>
    set((s) => ({
      particles: s.particles
        .map((p) => ({
          ...p,
          life: p.life - delta,
          position: {
            x: p.position.x + p.velocity.x * delta,
            y: p.position.y + p.velocity.y * delta,
            z: p.position.z + p.velocity.z * delta,
          },
          velocity: { ...p.velocity, y: p.velocity.y - 5 * delta },
        }))
        .filter((p) => p.life > 0),
    })),
}));
