import { useEffect } from 'react';
import { GameScene } from './game/Scene';
import { GameHUD, GameMenu, GameOverScreen } from './game/GameHUD';
import { useGameStore } from './game/useGameStore';
import { ErrorBoundary } from './game/ErrorBoundary';

function App() {
  const { gameState, setGamePhase } = useGameStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyP' && gameState.phase === 'playing') {
        setGamePhase('paused');
      } else if (e.code === 'KeyP' && gameState.phase === 'paused') {
        setGamePhase('playing');
      }
      if (e.code === 'Escape' && gameState.phase === 'playing') {
        setGamePhase('paused');
      } else if (e.code === 'Escape' && gameState.phase === 'paused') {
        setGamePhase('playing');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState.phase, setGamePhase]);

  return (
    <div
      className="relative w-screen h-screen overflow-hidden"
      style={{ background: '#030610', userSelect: 'none' }}
    >
      <ErrorBoundary>
        <GameScene />
      </ErrorBoundary>

      {gameState.phase === 'menu' && <GameMenu />}
      {gameState.phase === 'playing' && <GameHUD />}
      {gameState.phase === 'paused' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)' }}>
          <div
            className="text-4xl font-black tracking-widest uppercase mb-6"
            style={{
              color: '#e8c870',
              textShadow: '0 0 20px rgba(200,160,60,0.7)',
              fontFamily: 'Georgia, serif',
            }}
          >
            PAUSED
          </div>
          <button
            onClick={() => setGamePhase('playing')}
            className="px-8 py-3 text-base font-bold tracking-widest uppercase mb-3"
            style={{
              background: 'linear-gradient(180deg, #6b3010, #381804)',
              border: '2px solid #aa6622',
              color: '#ffcc80',
              cursor: 'pointer',
              fontFamily: 'Georgia, serif',
            }}
          >
            Resume
          </button>
          <button
            onClick={() => { useGameStore.getState().resetGame(); }}
            className="px-6 py-2 text-sm tracking-widest"
            style={{ color: '#664422', cursor: 'pointer', background: 'transparent', border: 'none' }}
          >
            Main Menu
          </button>
        </div>
      )}
      {gameState.phase === 'gameover' && <GameOverScreen />}
    </div>
  );
}

export default App;
