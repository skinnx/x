import { useGameStore } from './useGameStore';
import { SkillId } from './types';

const SKILL_ORDER: SkillId[] = ['whirlwind', 'phantomStrike', 'bloodRage', 'execute'];

function HealthBar({ current, max, label, color, showNum }: { current: number; max: number; label: string; color: string; showNum?: boolean }) {
  const pct = Math.max(0, Math.min(1, current / max));
  const danger = pct < 0.3;
  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ color: '#bbb', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'monospace' }}>{label}</span>
        {showNum && <span style={{ color: '#888', fontSize: 10, fontFamily: 'monospace' }}>{Math.ceil(current)}/{max}</span>}
      </div>
      <div style={{ width: '100%', height: 8, background: 'rgba(0,0,0,0.55)', borderRadius: 2, overflow: 'hidden', border: `1px solid ${danger ? '#ff4422' : 'rgba(255,255,255,0.08)'}` }}>
        <div style={{
          height: '100%', width: `${pct * 100}%`,
          background: danger ? 'linear-gradient(90deg, #aa0000, #ff2200)' : `linear-gradient(90deg, ${color}, ${color}bb)`,
          transition: 'width 0.08s ease-out',
          boxShadow: danger ? '0 0 8px #ff2200' : `0 0 6px ${color}88`,
        }} />
      </div>
    </div>
  );
}

function SkillSlot({ skillId, index }: { skillId: SkillId; index: number }) {
  const { player } = useGameStore();
  const skill = player.skills[skillId];
  const keys = ['Z', 'X', 'C', 'V'];
  const cdPct = skill.cooldown / skill.maxCooldown;
  const energyOk = skillId === 'bloodRage' || player.energy >= skill.energyCost;
  const ready = skill.cooldown <= 0 && energyOk;
  const active = skill.isActive;

  return (
    <div style={{
      position: 'relative', width: 64, height: 64, borderRadius: 6,
      border: `2px solid ${active ? skill.color : ready ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.1)'}`,
      background: active ? `${skill.color}33` : 'rgba(0,0,0,0.72)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', cursor: 'default',
      boxShadow: active ? `0 0 18px ${skill.color}bb, 0 0 5px ${skill.color}` : ready ? '0 0 6px rgba(255,255,255,0.15)' : 'none',
      transition: 'box-shadow 0.2s, border-color 0.2s',
    }}>
      {skill.cooldown > 0 && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${cdPct * 100}%`, background: 'rgba(0,0,0,0.68)', zIndex: 2 }} />
      )}
      <div style={{ fontSize: 24, zIndex: 3, filter: ready ? 'none' : 'brightness(0.45)' }}>{skill.icon}</div>
      <div style={{ fontSize: 8, color: ready ? '#ddd' : '#555', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.5, zIndex: 3, marginTop: 2 }}>
        {skill.name.split(' ')[0]}
      </div>
      <div style={{ position: 'absolute', top: 3, left: 3, fontSize: 9, color: '#aaa', fontFamily: 'monospace', background: 'rgba(0,0,0,0.55)', borderRadius: 2, padding: '0 3px', zIndex: 4 }}>
        {keys[index]}
      </div>
      {skill.energyCost > 0 && (
        <div style={{ position: 'absolute', bottom: 3, right: 3, fontSize: 8, color: energyOk ? '#4488ff' : '#ff4444', fontFamily: 'monospace', zIndex: 4 }}>
          {skill.energyCost}
        </div>
      )}
      {skill.cooldown > 0.1 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 'bold', color: '#fff', fontFamily: 'monospace', zIndex: 5 }}>
          {skill.cooldown.toFixed(1)}
        </div>
      )}
      {active && (
        <div style={{ position: 'absolute', inset: -3, borderRadius: 8, border: `2px solid ${skill.color}`, animation: 'pulse-ring 0.7s ease-in-out infinite alternate', pointerEvents: 'none', zIndex: 1 }} />
      )}
    </div>
  );
}

function DamageNumbers() {
  const { damageNumbers } = useGameStore();
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {damageNumbers.map((dn) => {
        const progress = 1 - dn.life / 1.4;
        const y = 50 - progress * 22;
        const opacity = dn.life > 0.8 ? 1 : dn.life / 0.8;
        const size = dn.isCrit ? (dn.isSkill ? 36 : 30) : 20;
        const color = dn.isHeal ? '#44ff88' : dn.isCrit ? (dn.isSkill ? '#ff88ff' : '#ffcc00') : dn.isSkill ? '#66aaff' : '#ffffff';
        return (
          <div key={dn.id} style={{
            position: 'absolute',
            left: `${45 + (Math.sin(dn.x * 7.3) * 15)}%`,
            top: `${y}%`,
            transform: 'translateX(-50%)',
            color, fontSize: size, fontWeight: 'bold', fontFamily: 'monospace',
            opacity, textShadow: `0 0 8px ${color}, 0 2px 4px rgba(0,0,0,0.8)`,
            transition: 'none', userSelect: 'none',
            letterSpacing: dn.isCrit ? 2 : 0,
          }}>
            {dn.isCrit && <span style={{ fontSize: 11, verticalAlign: 'super', color: '#ffcc00' }}>CRIT! </span>}
            {dn.isHeal ? '+' : ''}{dn.value}
          </div>
        );
      })}
    </div>
  );
}

function XPBar() {
  const { player } = useGameStore();
  const pct = player.level >= 10 ? 1 : player.xp / player.xpToNext;
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ color: '#aa88ff', fontSize: 10, fontFamily: 'monospace', letterSpacing: 1 }}>LV {player.level}</span>
        {player.level < 10
          ? <span style={{ color: '#668', fontSize: 9, fontFamily: 'monospace' }}>{player.xp}/{player.xpToNext}</span>
          : <span style={{ color: '#ffaa00', fontSize: 9, fontFamily: 'monospace' }}>MAX</span>
        }
      </div>
      <div style={{ width: '100%', height: 5, background: 'rgba(0,0,0,0.55)', borderRadius: 2, overflow: 'hidden', border: '1px solid rgba(170,136,255,0.25)' }}>
        <div style={{ height: '100%', width: `${pct * 100}%`, background: 'linear-gradient(90deg, #7722cc, #aa44ff)', boxShadow: '0 0 6px #aa44ffaa', transition: 'width 0.3s ease-out' }} />
      </div>
    </div>
  );
}

function KillStreak() {
  const { player } = useGameStore();
  const titles: [number, string, string][] = [
    [25, 'LEGENDARY', '#ff8800'],
    [15, 'UNSTOPPABLE', '#ff4400'],
    [10, 'DOMINATING', '#cc0066'],
    [5, 'RAMPAGE', '#ff2200'],
    [3, 'KILLING SPREE', '#ffaa00'],
  ];
  for (const [n, title, color] of titles) {
    if (player.kills >= n) return (
      <div style={{ textAlign: 'center', color, fontSize: 10, fontFamily: 'monospace', letterSpacing: 2, fontWeight: 'bold', textShadow: `0 0 8px ${color}`, marginTop: 4 }}>
        ⚔ {title} ⚔
      </div>
    );
  }
  return null;
}

function LevelUpBanner() {
  const { gameState } = useGameStore();
  const msg = gameState.waveAnnounce;
  if (!msg.startsWith('LEVEL') || gameState.waveAnnounceTimer <= 0) return null;
  const opacity = Math.min(1, gameState.waveAnnounceTimer * 1.8);
  return (
    <div style={{ position: 'absolute', top: '32%', left: '50%', transform: 'translateX(-50%)', textAlign: 'center', opacity, pointerEvents: 'none' }}>
      <div style={{ color: '#aa44ff', fontSize: 36, fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: 4, textShadow: '0 0 20px #aa44ff, 0 0 40px #7722cc' }}>
        ⬆ LEVEL UP! ⬆
      </div>
      <div style={{ color: '#ccc', fontSize: 15, fontFamily: 'monospace', marginTop: 6, letterSpacing: 3 }}>
        Now Level {msg.replace('LEVEL UP! → ', '')}
      </div>
      <div style={{ color: '#aa88ff', fontSize: 10, marginTop: 8, letterSpacing: 2 }}>+HP &nbsp; +Stamina &nbsp; +Energy &nbsp; +Damage</div>
    </div>
  );
}

export function GameHUD() {
  const { gameState, player } = useGameStore();

  if (gameState.phase === 'menu') return <MenuScreen />;
  if (gameState.phase === 'gameover') return <GameOverScreen />;

  const allEnemies = useGameStore.getState().enemies;
  const bossEnemy = allEnemies.find(e => e.type === 'boss' && e.state !== 'dead');
  const liveCount = allEnemies.filter(e => e.state !== 'dead').length;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', fontFamily: 'monospace' }}>
      <style>{`
        @keyframes pulse-ring { from { opacity: 0.5; transform: scale(1); } to { opacity: 1; transform: scale(1.08); } }
        @keyframes wave-slide { from { opacity: 0; transform: translateX(-50%) translateY(-12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        @keyframes rage-pulse { 0%,100% { box-shadow: inset 0 0 0 transparent; } 50% { box-shadow: inset 0 0 28px rgba(200,0,0,0.22); } }
      `}</style>

      {player.isRaging && (
        <div style={{ position: 'absolute', inset: 0, border: '3px solid #cc000040', animation: 'rage-pulse 0.8s ease-in-out infinite', pointerEvents: 'none', borderRadius: 2 }} />
      )}
      {gameState.hitFlash > 0.05 && (
        <div style={{ position: 'absolute', inset: 0, background: `rgba(220,20,20,${gameState.hitFlash * 0.42})`, pointerEvents: 'none' }} />
      )}

      {/* Player panel */}
      <div style={{ position: 'absolute', bottom: 106, left: 22, width: 210, background: 'rgba(0,0,0,0.62)', padding: '11px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(4px)' }}>
        <HealthBar current={player.health} max={player.maxHealth} label="Health" color="#cc2222" showNum />
        <HealthBar current={player.stamina} max={player.maxStamina} label="Stamina" color="#22aa44" />
        <div style={{ marginTop: 5 }}>
          <HealthBar current={player.energy} max={player.maxEnergy} label="Energy" color="#4488ff" />
        </div>
        <div style={{ marginTop: 7 }}>
          <XPBar />
        </div>
        <KillStreak />
        {player.isRaging && (
          <div style={{ marginTop: 5, textAlign: 'center', color: '#ff2200', fontSize: 10, fontWeight: 'bold', letterSpacing: 2, textShadow: '0 0 8px #ff4400', animation: 'pulse-ring 0.5s ease-in-out infinite alternate' }}>
            ⚔ BLOOD RAGE {player.skills.bloodRage.activeTimer.toFixed(1)}s ⚔
          </div>
        )}
      </div>

      {/* Skill bar */}
      <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 10, padding: '10px 16px', background: 'rgba(0,0,0,0.65)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(4px)' }}>
        {SKILL_ORDER.map((id, i) => <SkillSlot key={id} skillId={id} index={i} />)}
      </div>

      {/* Keybind hint */}
      <div style={{ position: 'absolute', bottom: 98, left: '50%', transform: 'translateX(-50%)', color: 'rgba(140,140,170,0.55)', fontSize: 9, letterSpacing: 1, textAlign: 'center' }}>
        Z Whirlwind &nbsp;·&nbsp; X Phantom Strike &nbsp;·&nbsp; C Blood Rage &nbsp;·&nbsp; V Execute
      </div>

      {/* Top bar */}
      <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 22, background: 'rgba(0,0,0,0.6)', padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(4px)' }}>
        {[
          { label: 'WAVE', val: gameState.wave, color: '#fff' },
          { label: 'SCORE', val: gameState.score.toLocaleString(), color: '#ffcc44' },
          { label: 'KILLS', val: player.kills, color: '#ff6644' },
          { label: 'COMBO', val: player.combo > 1 ? `x${player.combo}` : '-', color: player.combo >= 4 ? '#ffaa00' : player.combo >= 2 ? '#ffcc88' : '#888' },
        ].map(({ label, val, color }, i) => (
          <div key={i} style={{ textAlign: 'center', minWidth: 42 }}>
            <div style={{ color: '#666', fontSize: 8, letterSpacing: 2 }}>{label}</div>
            <div style={{ color, fontSize: 20, fontWeight: 'bold' }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Enemy count top-right */}
      {liveCount > 0 && (
        <div style={{ position: 'absolute', top: 16, right: 20, color: '#cc8888', fontSize: 10, background: 'rgba(0,0,0,0.55)', padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(200,80,80,0.18)' }}>
          {liveCount} enemies
        </div>
      )}

      {/* Boss health bar */}
      {bossEnemy && (
        <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', width: 400, background: 'rgba(0,0,0,0.78)', padding: '11px 16px', borderRadius: 8, border: '2px solid #660088', backdropFilter: 'blur(4px)', marginBottom: 110 }}>
          <div style={{ textAlign: 'center', color: '#cc88ff', fontSize: 10, letterSpacing: 3, marginBottom: 6, textShadow: '0 0 10px #aa44ff' }}>
            ☠ SHADOW WARLORD ☠
          </div>
          <div style={{ width: '100%', height: 12, background: 'rgba(0,0,0,0.55)', borderRadius: 4, overflow: 'hidden', border: '1px solid #440066' }}>
            <div style={{ height: '100%', width: `${(bossEnemy.health / bossEnemy.maxHealth) * 100}%`, background: 'linear-gradient(90deg, #440088, #aa00cc, #ff44ff)', boxShadow: '0 0 12px #cc00ff', transition: 'width 0.1s' }} />
          </div>
          <div style={{ textAlign: 'center', color: '#aa88cc', fontSize: 9, marginTop: 3, letterSpacing: 1 }}>
            {Math.ceil(bossEnemy.health)} / {bossEnemy.maxHealth}
          </div>
        </div>
      )}

      {/* Wave announcement */}
      {gameState.waveAnnounceTimer > 0 && !gameState.waveAnnounce.startsWith('LEVEL') && (
        <div style={{ position: 'absolute', top: '28%', left: '50%', transform: 'translateX(-50%)', color: '#fff', fontSize: 28, fontWeight: 'bold', letterSpacing: 4, textShadow: '0 0 20px #ff4422, 0 0 40px #ff0000', opacity: Math.min(1, gameState.waveAnnounceTimer * 1.5), animation: 'wave-slide 0.3s ease-out', pointerEvents: 'none', textAlign: 'center', whiteSpace: 'nowrap' }}>
          {gameState.waveAnnounce}
        </div>
      )}

      <LevelUpBanner />
      <DamageNumbers />

      {/* Controls reminder */}
      <div style={{ position: 'absolute', bottom: 24, right: 18, color: 'rgba(90,90,120,0.55)', fontSize: 8, lineHeight: 1.8 }}>
        <div>WASD Move · Space Dodge</div>
        <div>F Attack · G Heavy · Q Block</div>
        <div>Tab Lock-On · P Pause</div>
      </div>
    </div>
  );
}

function MenuScreen() {
  const { setGamePhase, resetGame } = useGameStore();
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)' }}>
      <div style={{ textAlign: 'center', maxWidth: 520 }}>
        <div style={{ color: '#cc2200', fontSize: 52, fontWeight: 900, letterSpacing: 8, textShadow: '0 0 30px #ff4400, 0 0 60px #aa0000', marginBottom: 4, fontFamily: 'monospace' }}>CRIMSON DESERT</div>
        <div style={{ color: '#883333', fontSize: 13, letterSpacing: 6, marginBottom: 44, fontFamily: 'monospace' }}>3D ACTION RPG — SURVIVE THE ARENA</div>
        <div style={{ marginBottom: 40, color: '#777', fontSize: 11, letterSpacing: 1.5, lineHeight: 2.2, fontFamily: 'monospace', background: 'rgba(0,0,0,0.35)', padding: '16px 24px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div>WASD — Move &nbsp;|&nbsp; Space — Dodge &nbsp;|&nbsp; Q — Block</div>
          <div>F — Light Attack &nbsp;|&nbsp; G — Heavy Attack &nbsp;|&nbsp; Tab — Lock-On</div>
          <div style={{ color: '#aa88ff', marginTop: 8 }}>Z — Whirlwind (AOE spin) &nbsp;|&nbsp; X — Phantom Strike (dash)</div>
          <div style={{ color: '#aa88ff' }}>C — Blood Rage (fury mode) &nbsp;|&nbsp; V — Execute (finish move)</div>
        </div>
        <button
          style={{ pointerEvents: 'all', cursor: 'pointer', background: 'linear-gradient(135deg, #8a0000, #cc2200)', color: '#fff', border: '1px solid #ff4422', borderRadius: 6, padding: '14px 52px', fontSize: 18, letterSpacing: 5, fontFamily: 'monospace', fontWeight: 'bold', boxShadow: '0 0 22px rgba(200,50,0,0.55)' }}
          onClick={() => { resetGame(); setGamePhase('playing'); }}
        >
          ENTER THE ARENA
        </button>
      </div>
    </div>
  );
}

function GameOverScreen() {
  const { gameState, player, resetGame, setGamePhase } = useGameStore();
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.84)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#cc0000', fontSize: 52, fontWeight: 900, letterSpacing: 8, textShadow: '0 0 30px #ff0000', fontFamily: 'monospace', marginBottom: 14 }}>FALLEN</div>
        <div style={{ color: '#555', fontSize: 11, marginBottom: 34, letterSpacing: 2, fontFamily: 'monospace' }}>You have been defeated in the Crimson Desert</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 36, background: 'rgba(0,0,0,0.42)', padding: '18px 28px', borderRadius: 8, border: '1px solid rgba(200,0,0,0.18)' }}>
          {[['WAVE', String(gameState.wave)], ['SCORE', gameState.score.toLocaleString()], ['KILLS', String(player.kills)], ['LEVEL', String(player.level)]].map(([lbl, val]) => (
            <div key={lbl} style={{ textAlign: 'center' }}>
              <div style={{ color: '#444', fontSize: 9, letterSpacing: 2, fontFamily: 'monospace' }}>{lbl}</div>
              <div style={{ color: '#cc4444', fontSize: 24, fontWeight: 'bold', fontFamily: 'monospace' }}>{val}</div>
            </div>
          ))}
        </div>
        <button
          style={{ pointerEvents: 'all', cursor: 'pointer', background: 'linear-gradient(135deg, #3a0000, #880000)', color: '#ccc', border: '1px solid #aa2200', borderRadius: 6, padding: '12px 44px', fontSize: 16, letterSpacing: 4, fontFamily: 'monospace' }}
          onClick={() => { resetGame(); setGamePhase('playing'); }}
        >
          RISE AGAIN
        </button>
      </div>
    </div>
  );
}
