import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { v4 as uuidv4 } from 'uuid';
import { Enemy, EnemyType, ENEMY_STATS } from './types';
import { useGameStore } from './useGameStore';

const SPAWN_RADIUS = 26;

type WaveConfig = { type: EnemyType; count: number }[];

function getWaveConfig(wave: number): WaveConfig {
  const isBossWave = wave % 3 === 0;
  if (isBossWave) {
    return [
      { type: 'boss', count: 1 },
      { type: 'soldier', count: wave },
      { type: 'scout', count: wave },
    ];
  }
  const scouts = Math.min(2 + Math.floor(wave * 0.8), 8);
  const soldiers = Math.min(1 + Math.floor(wave * 0.5), 6);
  const berserkers = wave >= 3 ? Math.min(Math.floor(wave * 0.3), 4) : 0;
  return [
    { type: 'scout', count: scouts },
    { type: 'soldier', count: soldiers },
    { type: 'berserker', count: berserkers },
  ];
}

function spawnPos(index: number, total: number): { x: number; z: number } {
  const angle = (index / total) * Math.PI * 2 + Math.random() * 0.6;
  const r = SPAWN_RADIUS + Math.random() * 6;
  return { x: Math.sin(angle) * r, z: Math.cos(angle) * r };
}

export function WaveManager() {
  const { gameState, enemies, setEnemies, removeDeadEnemies, nextWave, announceWave } = useGameStore();
  const spawnedRef = useRef(false);
  const waveRef = useRef(0);
  const betweenWaveRef = useRef(0);
  const isBetweenRef = useRef(false);

  useEffect(() => {
    if (gameState.phase === 'playing' && !spawnedRef.current) {
      spawnedRef.current = true;
      waveRef.current = gameState.wave;
      spawnWave(gameState.wave);
    }
    if (gameState.phase !== 'playing') {
      spawnedRef.current = false;
    }
  }, [gameState.phase]);

  function spawnWave(wave: number) {
    const config = getWaveConfig(wave);
    const isBoss = wave % 3 === 0;

    const label = isBoss ? `⚔ BOSS WAVE ${wave} ⚔` : `WAVE ${wave}`;
    announceWave(label);

    let allSpawns: Enemy[] = [];
    let totalCount = config.reduce((s, c) => s + c.count, 0);
    let idx = 0;

    config.forEach(({ type, count }) => {
      for (let i = 0; i < count; i++) {
        const sp = spawnPos(idx++, totalCount);
        const waveBonus = (wave - 1) * ENEMY_STATS[type].hp * 0.3;
        const hp = Math.round(ENEMY_STATS[type].hp + waveBonus);
        allSpawns.push({
          id: uuidv4(),
          type,
          position: { x: sp.x, y: 0, z: sp.z },
          health: hp,
          maxHealth: hp,
          state: 'idle',
          rotation: 0,
          attackCooldown: 0,
          spawnPosition: { x: sp.x, y: 0, z: sp.z },
          staggerTimer: 0,
          deathTimer: 1.2,
        });
      }
    });

    const { enemies: existing } = useGameStore.getState();
    setEnemies([...existing.filter(e => e.state !== 'dead'), ...allSpawns]);
    waveRef.current = wave;
  }

  useFrame((_, delta) => {
    if (gameState.phase !== 'playing') return;

    removeDeadEnemies();

    if (isBetweenRef.current) {
      betweenWaveRef.current -= delta;
      if (betweenWaveRef.current <= 0) {
        isBetweenRef.current = false;
        nextWave();
        const newWave = useGameStore.getState().gameState.wave;
        spawnWave(newWave);
      }
      return;
    }

    const { enemies: live } = useGameStore.getState();
    const alive = live.filter(e => e.state !== 'dead' && e.health > 0);
    if (alive.length === 0 && spawnedRef.current) {
      isBetweenRef.current = true;
      betweenWaveRef.current = 3.5;
    }
  });

  return null;
}
