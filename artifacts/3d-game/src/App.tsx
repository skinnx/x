import { useEffect } from 'react';
import { GameScene } from './game/Scene';
import { GameHUD } from './game/GameHUD';
import { useGameStore } from './game/useGameStore';
import { ErrorBoundary } from './game/ErrorBoundary';

function App() {
  const { gameState, setGamePhase } = useGameStore();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Tab') e.preventDefault();
      if ((e.code === 'KeyP' || e.code === 'Escape') && gameState.phase === 'playing') {
        setGamePhase('paused');
      } else if ((e.code === 'KeyP' || e.code === 'Escape') && gameState.phase === 'paused') {
        setGamePhase('playing');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [gameState.phase, setGamePhase]);

  return (
    <div
      className="relative w-screen h-screen overflow-hidden"
      style={{ background: '#030610', userSelect: 'none' }}
    >
      <ErrorBoundary>
        <GameScene />
      </ErrorBoundary>

      {gameState.phase !== 'paused' && <GameHUD />}
      {gameState.phase === 'paused' && <PauseScreen />}
    </div>
  );
}

function PauseScreen() {
  const { setGamePhase, resetGame } = useGameStore();
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(2px)' }}
    >
      <div
        className="text-5xl font-black tracking-[0.2em] uppercase mb-8"
        style={{
          color: '#e8c870',
          textShadow: '0 0 30px rgba(180,140,50,0.6), 0 4px 8px rgba(0,0,0,0.9)',
          fontFamily: 'Georgia, serif',
        }}
      >
        PAUSED
      </div>
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={() => setGamePhase('playing')}
          className="px-12 py-3.5 text-base font-bold tracking-[0.18em] uppercase transition-all duration-150"
          style={{
            background: 'linear-gradient(180deg, #6b3010, #381804)',
            border: '2px solid #aa6622',
            color: '#ffcc80',
            cursor: 'pointer',
            fontFamily: 'Georgia, serif',
            boxShadow: '0 0 20px rgba(150,80,0,0.3)',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          CONTINUE
        </button>
        <button
          onClick={resetGame}
          style={{
            color: '#664422',
            cursor: 'pointer',
            background: 'transparent',
            border: 'none',
            fontSize: 12,
            letterSpacing: '0.15em',
            marginTop: 4,
          }}
        >
          MAIN MENU
        </button>
      </div>
      <div className="mt-8 text-xs" style={{ color: '#443322', letterSpacing: '0.2em' }}>
        Press P or ESC to resume
      </div>
    </div>
  );
}

export default App;
