import { useGameStore } from './useGameStore';

export function GameHUD() {
  const { player, gameState, enemies } = useGameStore();
  
  const healthPct = player.health / player.maxHealth;
  const staminaPct = player.stamina / player.maxStamina;

  return (
    <div className="absolute inset-0 pointer-events-none select-none">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)',
          pointerEvents: 'none',
        }}
      />

      <div className="absolute bottom-8 left-8 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#ff6644', textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>HP</span>
          <div className="relative w-48 h-3 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,80,50,0.4)' }}>
            <div
              className="h-full rounded-full transition-all duration-150"
              style={{
                width: `${healthPct * 100}%`,
                background: healthPct > 0.5
                  ? 'linear-gradient(90deg, #cc3300, #ff4422)'
                  : healthPct > 0.25
                  ? 'linear-gradient(90deg, #cc7700, #ff9900)'
                  : 'linear-gradient(90deg, #cc0000, #ff0000)',
                boxShadow: `0 0 8px ${healthPct > 0.5 ? '#ff4422' : '#ff0000'}`,
              }}
            />
          </div>
          <span className="text-xs font-mono" style={{ color: '#ff9980', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
            {Math.ceil(player.health)}/{player.maxHealth}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#44aaff', textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>SP</span>
          <div className="relative w-48 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(50,100,255,0.3)' }}>
            <div
              className="h-full rounded-full transition-all duration-100"
              style={{
                width: `${staminaPct * 100}%`,
                background: 'linear-gradient(90deg, #1155cc, #4488ff)',
                boxShadow: '0 0 6px #4488ff',
              }}
            />
          </div>
        </div>
        {player.combo > 1 && (
          <div className="flex items-center gap-1">
            <span
              className="text-lg font-black tracking-widest uppercase"
              style={{
                color: player.combo >= 3 ? '#ffaa00' : '#ff6600',
                textShadow: `0 0 12px ${player.combo >= 3 ? '#ffaa00' : '#ff6600'}, 0 2px 4px rgba(0,0,0,0.9)`,
                animation: 'pulse 0.4s ease-in-out',
              }}
            >
              {player.combo}x COMBO
            </span>
          </div>
        )}
      </div>

      <div className="absolute top-6 right-8 flex flex-col items-end gap-1">
        <div style={{ color: '#e8c97a', textShadow: '0 1px 6px rgba(0,0,0,0.9)', fontFamily: 'Georgia, serif' }}>
          <span className="text-2xl font-black tracking-wider">{gameState.score.toLocaleString()}</span>
        </div>
        <div className="text-xs font-bold tracking-widest uppercase" style={{ color: '#cc8840', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
          WAVE {gameState.wave}
        </div>
        <div className="text-xs font-mono" style={{ color: '#a08060', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
          {enemies.filter(e => e.state !== 'dead').length} enemies remaining
        </div>
      </div>

      <div className="absolute bottom-8 right-8 flex flex-col items-end gap-1 text-xs" style={{ color: 'rgba(200,170,120,0.7)', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
        <span>WASD — Move</span>
        <span>Space — Dodge</span>
        <span>F / Click — Attack</span>
      </div>

      {player.isDodging && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <span
            className="text-sm font-black tracking-widest uppercase"
            style={{ color: '#88ddff', textShadow: '0 0 16px #44aaff, 0 2px 4px rgba(0,0,0,0.9)' }}
          >
            DODGE
          </span>
        </div>
      )}
    </div>
  );
}

export function GameMenu() {
  const { setGamePhase, resetGame } = useGameStore();
  
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{
        background: 'linear-gradient(180deg, rgba(5,0,15,0.95) 0%, rgba(20,5,5,0.92) 100%)',
      }}
    >
      <div className="flex flex-col items-center gap-2 mb-12">
        <div
          className="text-6xl font-black tracking-widest uppercase mb-1"
          style={{
            color: '#cc2200',
            textShadow: '0 0 30px #aa1100, 0 4px 8px rgba(0,0,0,0.9)',
            fontFamily: 'Georgia, serif',
            letterSpacing: '0.12em',
          }}
        >
          CRIMSON
        </div>
        <div
          className="text-4xl font-bold tracking-[0.3em] uppercase"
          style={{
            color: '#e8c870',
            textShadow: '0 0 20px #aa9030, 0 2px 4px rgba(0,0,0,0.9)',
            fontFamily: 'Georgia, serif',
          }}
        >
          DESERT
        </div>
        <div className="text-xs tracking-[0.4em] uppercase mt-2" style={{ color: '#886644' }}>
          3D Action RPG
        </div>
      </div>

      <button
        onClick={() => {
          resetGame();
          setGamePhase('playing');
        }}
        className="px-10 py-4 text-lg font-black tracking-widest uppercase mb-4 relative"
        style={{
          background: 'linear-gradient(180deg, #8b1a1a, #4a0808)',
          border: '2px solid #cc3300',
          color: '#ffd080',
          textShadow: '0 1px 4px rgba(0,0,0,0.9)',
          boxShadow: '0 0 20px rgba(200,50,0,0.4), inset 0 1px 0 rgba(255,150,0,0.2)',
          cursor: 'pointer',
          fontFamily: 'Georgia, serif',
          letterSpacing: '0.15em',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 0 30px rgba(255,80,0,0.7), inset 0 1px 0 rgba(255,150,0,0.3)';
          e.currentTarget.style.transform = 'scale(1.03)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '0 0 20px rgba(200,50,0,0.4), inset 0 1px 0 rgba(255,150,0,0.2)';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        BEGIN YOUR LEGEND
      </button>

      <div className="flex flex-col items-center gap-1 mt-8 text-xs" style={{ color: '#664422' }}>
        <span>WASD to move · Space to dodge · F or click to attack</span>
        <span>Chain attacks for combo bonus</span>
      </div>
    </div>
  );
}

export function GameOverScreen() {
  const { gameState, player, resetGame, setGamePhase, enemies } = useGameStore();
  
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)' }}
    >
      <div
        className="text-5xl font-black uppercase mb-2"
        style={{
          color: '#cc0000',
          textShadow: '0 0 30px #ff0000, 0 4px 8px rgba(0,0,0,0.9)',
          fontFamily: 'Georgia, serif',
          letterSpacing: '0.1em',
        }}
      >
        FALLEN
      </div>
      <div className="text-sm uppercase tracking-widest mb-8" style={{ color: '#884422' }}>
        Your legend ends here
      </div>
      <div className="flex flex-col items-center gap-1 mb-8 text-sm" style={{ color: '#c8a060' }}>
        <span>Score: <strong style={{ color: '#ffcc44' }}>{gameState.score.toLocaleString()}</strong></span>
        <span>Wave Reached: <strong style={{ color: '#ffcc44' }}>{gameState.wave}</strong></span>
        <span>Enemies Slain: <strong style={{ color: '#ffcc44' }}>{player.kills}</strong></span>
      </div>
      <button
        onClick={() => {
          resetGame();
          setGamePhase('playing');
        }}
        className="px-8 py-3 text-base font-bold tracking-widest uppercase"
        style={{
          background: 'linear-gradient(180deg, #6b1010, #380404)',
          border: '2px solid #991100',
          color: '#ffcc80',
          cursor: 'pointer',
          fontFamily: 'Georgia, serif',
        }}
      >
        RISE AGAIN
      </button>
      <button
        onClick={() => {
          resetGame();
        }}
        className="mt-3 px-6 py-2 text-sm tracking-widest uppercase"
        style={{ color: '#664422', cursor: 'pointer', background: 'transparent', border: 'none' }}
      >
        Main Menu
      </button>
    </div>
  );
}
