import { useEffect, useRef } from 'react';
import { useGameStore } from './useGameStore';

export function GameHUD() {
  const { player, gameState, enemies } = useGameStore();

  const hpPct = player.health / player.maxHealth;
  const spPct = player.stamina / player.maxStamina;
  const boss = enemies.find(e => e.type === 'boss' && e.state !== 'dead');
  const aliveCount = enemies.filter(e => e.state !== 'dead' && e.health > 0).length;

  const shakeX = (Math.random() - 0.5) * gameState.screenShake * 12;
  const shakeY = (Math.random() - 0.5) * gameState.screenShake * 12;

  return (
    <div
      className="absolute inset-0 pointer-events-none select-none overflow-hidden"
      style={{ transform: `translate(${shakeX}px,${shakeY}px)` }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.55) 100%)',
        }}
      />
      {gameState.hitFlash > 0 && (
        <div
          className="absolute inset-0"
          style={{
            background: `rgba(200,0,0,${gameState.hitFlash * 0.3})`,
            pointerEvents: 'none',
          }}
        />
      )}
      {hpPct < 0.3 && (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at center, transparent 40%, rgba(180,0,0,${(0.3 - hpPct) * 1.2}) 100%)`,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      )}

      <div className="absolute bottom-8 left-8">
        <BarGroup label="HP" pct={hpPct} color1="#cc1100" color2="#ff4422" glow="#ff2200" width={220} height={14} />
        <div className="mt-2">
          <BarGroup label="SP" pct={spPct} color1="#1133cc" color2="#3366ff" glow="#4488ff" width={180} height={9} />
        </div>
        {player.combo > 1 && (
          <div className="mt-3">
            <ComboDisplay combo={player.combo} heavy={player.isHeavyAttacking} />
          </div>
        )}
      </div>

      {boss && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 flex flex-col items-center" style={{ width: 400 }}>
          <div className="text-xs tracking-[0.35em] uppercase mb-1.5" style={{ color: '#cc88ff', textShadow: '0 0 10px #8800cc' }}>
            — DARK LORD —
          </div>
          <div className="relative w-full h-4 rounded-sm overflow-hidden" style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(180,80,255,0.5)' }}>
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${(boss.health / boss.maxHealth) * 100}%`,
                background: 'linear-gradient(90deg, #440088, #9922ff)',
                boxShadow: '0 0 12px #8800cc',
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-bold" style={{ color: '#eeddff', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
                {Math.ceil(boss.health)} / {boss.maxHealth}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="absolute top-6 right-8 flex flex-col items-end gap-1.5">
        <div style={{ fontFamily: 'Georgia, serif' }}>
          <span className="text-xs tracking-widest uppercase" style={{ color: '#aa8844' }}>Score</span>
          <div className="text-3xl font-black" style={{ color: '#e8c870', textShadow: '0 0 20px rgba(200,160,60,0.6)' }}>
            {gameState.score.toLocaleString()}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <WaveBadge wave={gameState.wave} />
        </div>
        <div className="text-xs font-mono mt-0.5" style={{ color: '#886644' }}>
          {aliveCount} enemies
        </div>
      </div>

      <div className="absolute bottom-8 right-8 flex flex-col items-end gap-1">
        <ControlHint keys="WASD" action="Move" />
        <ControlHint keys="Space" action="Dodge" />
        <ControlHint keys="F" action="Attack" />
        <ControlHint keys="G" action="Heavy Attack" />
        <ControlHint keys="Q" action="Block" />
        <ControlHint keys="Tab" action="Lock-On" />
        <ControlHint keys="P" action="Pause" />
      </div>

      {player.lockedTargetId && (
        <LockOnReticle targetId={player.lockedTargetId} />
      )}

      {gameState.waveAnnounceTimer > 0 && (
        <WaveAnnounce text={gameState.waveAnnounce} timer={gameState.waveAnnounceTimer} />
      )}
    </div>
  );
}

function BarGroup({ label, pct, color1, color2, glow, width, height }: {
  label: string; pct: number; color1: string; color2: string; glow: string; width: number; height: number;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-xs font-black uppercase tracking-widest w-6" style={{ color: color2, textShadow: `0 0 8px ${glow}` }}>
        {label}
      </span>
      <div className="relative rounded-sm overflow-hidden" style={{ width, height, background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div
          className="h-full transition-all duration-100"
          style={{
            width: `${pct * 100}%`,
            background: `linear-gradient(90deg, ${color1}, ${color2})`,
            boxShadow: `0 0 8px ${glow}`,
          }}
        />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 60%)' }} />
      </div>
      <span className="text-xs font-mono" style={{ color: 'rgba(200,170,120,0.6)', minWidth: 28, textAlign: 'right' }}>
        {Math.ceil(pct * 100)}%
      </span>
    </div>
  );
}

function ComboDisplay({ combo, heavy }: { combo: number; heavy: boolean }) {
  const color = heavy ? '#cc44ff' : combo >= 4 ? '#ff6600' : combo >= 3 ? '#ffaa00' : '#ff8833';
  const glow = heavy ? '#9922ff' : color;
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: combo }).map((_, i) => (
        <div
          key={i}
          className="rounded-sm"
          style={{ width: 10, height: 22, background: color, boxShadow: `0 0 8px ${glow}`, opacity: 0.85 + i * 0.05 }}
        />
      ))}
      <span
        className="text-sm font-black tracking-widest uppercase ml-1"
        style={{ color, textShadow: `0 0 14px ${glow}, 0 2px 4px rgba(0,0,0,0.9)` }}
      >
        {heavy ? 'HEAVY' : `${combo}x COMBO`}
      </span>
    </div>
  );
}

function WaveBadge({ wave }: { wave: number }) {
  const isBoss = wave % 3 === 0;
  return (
    <div
      className="px-2.5 py-0.5 text-xs font-black tracking-[0.2em] uppercase"
      style={{
        background: isBoss ? 'rgba(80,0,120,0.7)' : 'rgba(60,20,0,0.7)',
        border: `1px solid ${isBoss ? 'rgba(180,80,255,0.5)' : 'rgba(200,120,20,0.4)'}`,
        color: isBoss ? '#cc88ff' : '#e8b860',
        boxShadow: isBoss ? '0 0 12px rgba(120,0,200,0.4)' : '0 0 8px rgba(180,100,0,0.3)',
        fontFamily: 'Georgia, serif',
      }}
    >
      {isBoss ? `★ WAVE ${wave} ★` : `WAVE ${wave}`}
    </div>
  );
}

function ControlHint({ keys, action }: { keys: string; action: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="text-xs px-1.5 py-0.5 rounded font-mono"
        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(220,190,140,0.8)' }}
      >
        {keys}
      </span>
      <span className="text-xs" style={{ color: 'rgba(150,120,80,0.7)' }}>{action}</span>
    </div>
  );
}

function LockOnReticle({ targetId }: { targetId: string }) {
  const enemy = useGameStore.getState().enemies.find(e => e.id === targetId);
  if (!enemy || enemy.state === 'dead') return null;
  return (
    <div
      className="absolute flex items-center justify-center"
      style={{
        left: '50%',
        top: '40%',
        width: 48,
        height: 48,
        transform: 'translate(-50%, -50%)',
        border: '2px solid #ffcc00',
        borderRadius: '50%',
        boxShadow: '0 0 12px #ffaa00',
        animation: 'spin 3s linear infinite',
        opacity: 0.85,
      }}
    >
      <div style={{ width: 6, height: 6, background: '#ffcc00', borderRadius: '50%', boxShadow: '0 0 6px #ffcc00' }} />
    </div>
  );
}

function WaveAnnounce({ text, timer }: { text: string; timer: number }) {
  const opacity = Math.min(1, timer * 0.8);
  const isBoss = text.includes('BOSS');
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center"
      style={{ top: '22%', opacity }}
    >
      <div
        className="text-sm tracking-[0.4em] uppercase mb-1"
        style={{ color: isBoss ? '#cc88ff' : '#aa8844', textShadow: isBoss ? '0 0 16px #9900cc' : '0 0 10px #aa6600' }}
      >
        {isBoss ? '— PREPARE FOR BATTLE —' : '— ENEMIES APPROACH —'}
      </div>
      <div
        className="text-4xl font-black tracking-[0.25em] uppercase"
        style={{
          color: isBoss ? '#dd88ff' : '#e8c870',
          textShadow: isBoss
            ? '0 0 40px #9900cc, 0 4px 8px rgba(0,0,0,0.9)'
            : '0 0 30px rgba(200,160,60,0.8), 0 4px 8px rgba(0,0,0,0.9)',
          fontFamily: 'Georgia, serif',
        }}
      >
        {text}
      </div>
    </div>
  );
}

export function GameMenu() {
  const { setGamePhase, resetGame } = useGameStore();
  const starsRef = useRef<HTMLDivElement[]>([]);

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{
        background: 'linear-gradient(180deg, #050010 0%, #150308 60%, #0a0005 100%)',
        overflow: 'hidden',
      }}
    >
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 80%, rgba(120,0,0,0.25) 0%, transparent 70%)' }} />

      <div className="flex flex-col items-center gap-1 mb-14 z-10">
        <div className="text-xs tracking-[0.6em] uppercase mb-4" style={{ color: '#664422' }}>
          An Epic Action RPG
        </div>
        <div
          className="font-black uppercase"
          style={{
            fontSize: 72,
            lineHeight: 1,
            color: '#cc1a00',
            textShadow: '0 0 60px #aa0800, 0 0 120px #550000, 0 8px 16px rgba(0,0,0,0.9)',
            fontFamily: 'Georgia, serif',
            letterSpacing: '0.08em',
          }}
        >
          CRIMSON
        </div>
        <div
          className="font-bold uppercase tracking-[0.5em]"
          style={{
            fontSize: 32,
            color: '#e8c870',
            textShadow: '0 0 30px rgba(180,140,40,0.7), 0 4px 8px rgba(0,0,0,0.9)',
            fontFamily: 'Georgia, serif',
          }}
        >
          DESERT
        </div>
        <div className="flex gap-3 mt-4">
          {[0, 1, 2].map(i => (
            <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#880000', boxShadow: '0 0 6px #cc0000' }} />
          ))}
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 z-10">
        <button
          onClick={() => { resetGame(); setGamePhase('playing'); }}
          className="px-14 py-4 text-xl font-black uppercase tracking-[0.2em] transition-all duration-200"
          style={{
            background: 'linear-gradient(180deg, #8b1a1a 0%, #4a0808 100%)',
            border: '2px solid #cc3300',
            color: '#ffd080',
            textShadow: '0 1px 4px rgba(0,0,0,0.9)',
            boxShadow: '0 0 30px rgba(180,40,0,0.4), inset 0 1px 0 rgba(255,140,0,0.2)',
            cursor: 'pointer',
            fontFamily: 'Georgia, serif',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.boxShadow = '0 0 50px rgba(255,60,0,0.7), inset 0 1px 0 rgba(255,140,0,0.3)';
            e.currentTarget.style.transform = 'scale(1.04)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.boxShadow = '0 0 30px rgba(180,40,0,0.4), inset 0 1px 0 rgba(255,140,0,0.2)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          BEGIN YOUR LEGEND
        </button>
      </div>

      <div className="absolute bottom-10 flex flex-col items-center gap-1.5 z-10 text-xs" style={{ color: '#55332a', letterSpacing: '0.1em' }}>
        <span>WASD Move · Space Dodge · F Attack · G Heavy · Q Block · Tab Lock-On</span>
        <span>Chain attacks for combo bonus · Block to reduce damage</span>
        <span style={{ color: '#441122' }}>Every 3rd wave a powerful Boss awakens</span>
      </div>
    </div>
  );
}

export function GameOverScreen() {
  const { gameState, player, resetGame, setGamePhase } = useGameStore();

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.88)' }}
    >
      <div
        className="text-xs tracking-[0.5em] uppercase mb-3"
        style={{ color: '#660000' }}
      >
        — Your story ends here —
      </div>
      <div
        className="font-black uppercase mb-2"
        style={{
          fontSize: 64,
          color: '#cc0000',
          textShadow: '0 0 50px #ff0000, 0 0 100px #880000, 0 6px 10px rgba(0,0,0,0.9)',
          fontFamily: 'Georgia, serif',
          letterSpacing: '0.08em',
        }}
      >
        FALLEN
      </div>

      <div
        className="flex gap-10 mt-6 mb-8 px-10 py-5"
        style={{ background: 'rgba(40,10,10,0.6)', border: '1px solid rgba(100,30,30,0.4)' }}
      >
        <StatEntry label="Score" value={gameState.score.toLocaleString()} accent="#e8c870" />
        <StatEntry label="Wave" value={String(gameState.wave)} accent="#cc88ff" />
        <StatEntry label="Kills" value={String(player.kills)} accent="#ff6644" />
      </div>

      <button
        onClick={() => { resetGame(); setGamePhase('playing'); }}
        className="px-10 py-3.5 font-black uppercase tracking-[0.18em] mb-3 transition-all duration-200"
        style={{
          background: 'linear-gradient(180deg, #6b1010, #380404)',
          border: '2px solid #991100',
          color: '#ffcc80',
          cursor: 'pointer',
          fontFamily: 'Georgia, serif',
          fontSize: 16,
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        RISE AGAIN
      </button>
      <button
        onClick={resetGame}
        style={{ color: '#553322', cursor: 'pointer', background: 'transparent', border: 'none', fontSize: 12, letterSpacing: '0.15em' }}
      >
        MAIN MENU
      </button>
    </div>
  );
}

function StatEntry({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs tracking-widest uppercase" style={{ color: '#664422' }}>{label}</span>
      <span className="text-2xl font-black" style={{ color: accent, textShadow: `0 0 12px ${accent}66`, fontFamily: 'Georgia, serif' }}>
        {value}
      </span>
    </div>
  );
}
