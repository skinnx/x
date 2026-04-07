import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { v4 as uuidv4 } from 'uuid';
import { Enemy } from './types';
import { useGameStore } from './useGameStore';

const SPAWN_RADIUS = 25;
const ENEMY_HP_PER_WAVE = 40;

function getWaveEnemyCount(wave: number) {
  return Math.min(3 + wave * 2, 16);
}

function spawnPosition(i: number, total: number): { x: number; z: number } {
  const angle = (i / total) * Math.PI * 2 + Math.random() * 0.5;
  const r = SPAWN_RADIUS + Math.random() * 5;
  return { x: Math.sin(angle) * r, z: Math.cos(angle) * r };
}

export function WaveManager() {
  const { gameState, enemies, setEnemies, removeDeadEnemies, nextWave, setGamePhase } = useGameStore();
  const waveSpawnedRef = useRef(false);
  const waveRef = useRef(gameState.wave);
  const timerRef = useRef(0);

  useEffect(() => {
    waveSpawnedRef.current = false;
    waveRef.current = gameState.wave;
  }, [gameState.wave]);

  useFrame((_, delta) => {
    if (gameState.phase !== 'playing') return;

    timerRef.current += delta;

    removeDeadEnemies();

    const { enemies: liveEnemies, gameState: gs } = useGameStore.getState();
    const living = liveEnemies.filter((e) => e.state !== 'dead');

    if (!waveSpawnedRef.current || (living.length === 0 && timerRef.current > 2)) {
      if (!waveSpawnedRef.current) {
        waveSpawnedRef.current = true;
      } else {
        timerRef.current = 0;
        nextWave();
        return;
      }

      const count = getWaveEnemyCount(gs.wave);
      const newEnemies: Enemy[] = Array.from({ length: count }, (_, i) => {
        const sp = spawnPosition(i, count);
        return {
          id: uuidv4(),
          position: { x: sp.x, y: 0, z: sp.z },
          health: 60 + gs.wave * ENEMY_HP_PER_WAVE,
          maxHealth: 60 + gs.wave * ENEMY_HP_PER_WAVE,
          state: 'idle',
          rotation: 0,
          attackCooldown: 0,
          spawnPosition: { x: sp.x, y: 0, z: sp.z },
        };
      });
      setEnemies([...living, ...newEnemies]);
    }
  });

  return null;
}
