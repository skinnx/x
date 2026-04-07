import { create } from 'zustand';
import { Enemy, PlayerState, GameState, Particle } from './types';

interface GameStore {
  player: PlayerState;
  enemies: Enemy[];
  gameState: GameState;
  particles: Particle[];

  setPlayerHealth: (health: number) => void;
  setPlayerStamina: (stamina: number) => void;
  setPlayerAttacking: (attacking: boolean, heavy?: boolean, combo?: number) => void;
  setPlayerDodging: (dodging: boolean) => void;
  setPlayerBlocking: (blocking: boolean) => void;
  setPlayerDead: () => void;
  consumeStamina: (amount: number) => boolean;
  restoreStamina: (amount: number) => void;
  setLockTarget: (id: string | null) => void;

  setEnemies: (enemies: Enemy[]) => void;
  updateEnemy: (id: string, updates: Partial<Enemy>) => void;
  damageEnemy: (id: string, damage: number) => boolean;
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
}

const initialPlayer: PlayerState = {
  health: 100,
  maxHealth: 100,
  stamina: 100,
  maxStamina: 100,
  isAttacking: false,
  isHeavyAttacking: false,
  attackCooldown: 0,
  combo: 0,
  lastAttackTime: 0,
  isDodging: false,
  dodgeCooldown: 0,
  isBlocking: false,
  kills: 0,
  isAlive: true,
  lockedTargetId: null,
};

const initialGameState: GameState = {
  phase: 'menu',
  wave: 1,
  score: 0,
  elapsedTime: 0,
  waveAnnounce: '',
  waveAnnounceTimer: 0,
  screenShake: 0,
  hitFlash: 0,
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

  setPlayerAttacking: (attacking, heavy = false, combo) =>
    set((s) => ({
      player: {
        ...s.player,
        isAttacking: attacking,
        isHeavyAttacking: heavy,
        combo: combo !== undefined ? combo : s.player.combo,
        lastAttackTime: attacking ? Date.now() : s.player.lastAttackTime,
      },
    })),

  setPlayerDodging: (dodging) =>
    set((s) => ({ player: { ...s.player, isDodging: dodging } })),

  setPlayerBlocking: (blocking) =>
    set((s) => ({ player: { ...s.player, isBlocking: blocking } })),

  setPlayerDead: () =>
    set((s) => ({
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
    set((s) => ({
      player: {
        ...s.player,
        stamina: Math.min(s.player.maxStamina, s.player.stamina + amount),
      },
    })),

  setLockTarget: (id) =>
    set((s) => ({ player: { ...s.player, lockedTargetId: id } })),

  setEnemies: (enemies) => set({ enemies }),

  updateEnemy: (id, updates) =>
    set((s) => ({
      enemies: s.enemies.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    })),

  damageEnemy: (id, damage) => {
    let killed = false;
    set((s) => ({
      enemies: s.enemies.map((e) => {
        if (e.id !== id) return e;
        const newHp = Math.max(0, e.health - damage);
        if (newHp <= 0 && e.state !== 'dead') killed = true;
        return {
          ...e,
          health: newHp,
          state: newHp <= 0 ? 'dead' : 'staggered',
          staggerTimer: newHp <= 0 ? 0 : 0.3,
          deathTimer: newHp <= 0 ? 1.2 : e.deathTimer,
        };
      }),
    }));
    return killed;
  },

  removeDeadEnemies: () =>
    set((s) => ({
      enemies: s.enemies.filter((e) => !(e.state === 'dead' && e.deathTimer <= 0)),
    })),

  setGamePhase: (phase) =>
    set((s) => ({ gameState: { ...s.gameState, phase } })),

  incrementKills: () =>
    set((s) => ({ player: { ...s.player, kills: s.player.kills + 1 } })),

  addScore: (points) =>
    set((s) => ({ gameState: { ...s.gameState, score: s.gameState.score + points } })),

  nextWave: () =>
    set((s) => ({
      gameState: { ...s.gameState, wave: s.gameState.wave + 1 },
    })),

  resetGame: () =>
    set({
      player: { ...initialPlayer },
      enemies: [],
      gameState: { ...initialGameState },
      particles: [],
    }),

  announceWave: (msg) =>
    set((s) => ({
      gameState: { ...s.gameState, waveAnnounce: msg, waveAnnounceTimer: 3.0 },
    })),

  triggerScreenShake: (intensity) =>
    set((s) => ({
      gameState: { ...s.gameState, screenShake: Math.max(s.gameState.screenShake, intensity) },
    })),

  triggerHitFlash: (intensity) =>
    set((s) => ({
      gameState: { ...s.gameState, hitFlash: Math.max(s.gameState.hitFlash, intensity) },
    })),

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
    set((s) => ({ particles: [...s.particles.slice(-120), particle] })),

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
          velocity: { ...p.velocity, y: p.velocity.y - 8 * delta },
        }))
        .filter((p) => p.life > 0),
    })),
}));
