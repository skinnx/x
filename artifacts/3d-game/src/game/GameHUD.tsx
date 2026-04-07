import { useGameStore } from './useGameStore';
import { SkillId } from './types';

/* ── SVG Skill Icons ─────────────────────────────────────── */
function IconWhirlwind({ size = 28, color = '#ff6633' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M16 5 C22 5 27 10 27 16 C27 22 22 27 16 27 C10 27 5 22 5 16" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M5 16 C5 10 10 5 16 5" stroke={color} strokeWidth="2.5" strokeLinecap="round" opacity="0.5"/>
      <path d="M16 2 L13 6 L16 5 L19 6 Z" fill={color}/>
      <circle cx="16" cy="16" r="3" fill={color} opacity="0.6"/>
      <path d="M10 10 L12 13" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
      <path d="M22 10 L20 13" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
    </svg>
  );
}
function IconPhantomStrike({ size = 28, color = '#4488ff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M6 16 L26 16" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M20 10 L26 16 L20 22" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 12 L14 16 L6 20" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
      <line x1="4" y1="16" x2="8" y2="16" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.3"/>
    </svg>
  );
}
function IconBloodRage({ size = 28, color = '#dd1111' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M16 4 C16 4 8 10 8 18 C8 23.5 11.5 28 16 28 C20.5 28 24 23.5 24 18 C24 10 16 4 16 4Z" fill={color} opacity="0.7"/>
      <path d="M12 20 C12 20 14 16 16 14 C18 16 20 20 20 20" stroke="#ff6633" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <path d="M16 4 C16 4 10 14 12 20" stroke="#ff4422" strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>
      <circle cx="16" cy="10" r="2.5" fill="#ff8844" opacity="0.8"/>
    </svg>
  );
}
function IconExecute({ size = 28, color = '#aa44ff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="11" r="7" stroke={color} strokeWidth="2.2"/>
      <circle cx="13" cy="9.5" r="1.5" fill={color} opacity="0.8"/>
      <circle cx="19" cy="9.5" r="1.5" fill={color} opacity="0.8"/>
      <path d="M12 14 C13 17 19 17 20 14" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none"/>
      <path d="M10 20 L16 28 L22 20" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13 20 L16 24 L19 20" fill={color} opacity="0.4"/>
    </svg>
  );
}

const SKILL_ICONS: Record<SkillId, (props: { size?: number; color?: string }) => JSX.Element> = {
  whirlwind: IconWhirlwind,
  phantomStrike: IconPhantomStrike,
  bloodRage: IconBloodRage,
  execute: IconExecute,
};

const SKILL_ORDER: SkillId[] = ['whirlwind', 'phantomStrike', 'bloodRage', 'execute'];

/* ── Reusable styled bar ─────────────────────────────────── */
function StatBar({ pct, color, glow, height = 9 }: { pct: number; color: string; glow: string; height?: number }) {
  return (
    <div style={{ width: '100%', height, background: 'rgba(0,0,0,0.6)', borderRadius: height / 2, overflow: 'hidden', position: 'relative' }}>
      <div style={{
        height: '100%', width: `${Math.max(0, Math.min(1, pct)) * 100}%`,
        background: color, borderRadius: height / 2,
        boxShadow: `0 0 6px ${glow}`,
        transition: 'width 0.08s ease-out',
      }} />
    </div>
  );
}

/* ── Skill slot ──────────────────────────────────────────── */
function SkillSlot({ id, index }: { id: SkillId; index: number }) {
  const { player } = useGameStore();
  const skill = player.skills[id];
  const keys = ['Z', 'X', 'C', 'V'];
  const cdPct = skill.cooldown / skill.maxCooldown;
  const energyOk = id === 'bloodRage' || player.energy >= skill.energyCost;
  const ready = skill.cooldown <= 0 && energyOk;
  const active = skill.isActive;
  const Icon = SKILL_ICONS[id];

  return (
    <div style={{
      position: 'relative', width: 68, height: 72,
      background: active
        ? `linear-gradient(135deg, ${skill.color}22, rgba(0,0,0,0.85))`
        : 'linear-gradient(135deg, rgba(15,10,5,0.92), rgba(5,5,15,0.92))',
      borderRadius: 6,
      border: `1px solid ${active ? skill.color : ready ? 'rgba(180,140,60,0.55)' : 'rgba(80,60,40,0.35)'}`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', cursor: 'default',
      boxShadow: active
        ? `0 0 16px ${skill.color}88, inset 0 0 12px ${skill.color}22`
        : ready ? '0 0 5px rgba(180,140,60,0.2), inset 0 1px 0 rgba(255,255,255,0.04)'
        : 'none',
    }}>
      {/* Corner: keybind */}
      <div style={{ position: 'absolute', top: 3, left: 5, fontSize: 9, color: ready ? '#a09060' : '#4a3828', fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: 0 }}>
        {keys[index]}
      </div>
      {/* Energy cost */}
      {skill.energyCost > 0 && (
        <div style={{ position: 'absolute', top: 3, right: 5, fontSize: 8, color: energyOk ? '#4488ff' : '#ff3333', fontFamily: 'monospace' }}>
          {skill.energyCost}
        </div>
      )}
      {/* Cooldown overlay */}
      {skill.cooldown > 0 && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${cdPct * 100}%`, background: 'rgba(0,0,0,0.72)', zIndex: 2, borderRadius: '6px 6px 0 0' }} />
      )}
      {/* Icon */}
      <div style={{ zIndex: 3, opacity: ready ? 1 : 0.35, marginBottom: 4 }}>
        <Icon size={30} color={skill.color} />
      </div>
      {/* Skill name */}
      <div style={{ fontSize: 7.5, color: ready ? '#c0a860' : '#4a3828', fontFamily: 'serif', letterSpacing: 0.3, zIndex: 3, textAlign: 'center' }}>
        {skill.name.split(' ').join('\n')}
      </div>
      {/* Cooldown number overlay */}
      {skill.cooldown > 0.05 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 'bold', color: '#fff', fontFamily: 'monospace', zIndex: 5, textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
          {skill.cooldown.toFixed(1)}
        </div>
      )}
      {/* Active pulse border */}
      {active && (
        <div style={{ position: 'absolute', inset: -2, borderRadius: 8, border: `1.5px solid ${skill.color}`, animation: 'cdPulse 0.65s ease-in-out infinite alternate', pointerEvents: 'none', zIndex: 1 }} />
      )}
    </div>
  );
}

/* ── Floating damage numbers ─────────────────────────────── */
function DamageNumbers() {
  const { damageNumbers } = useGameStore();
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {damageNumbers.map((dn) => {
        const age = 1 - dn.life / 1.4;
        const y = 44 - age * 18;
        const opacity = dn.life > 0.6 ? 1 : dn.life / 0.6;
        const scale = dn.isCrit ? (1.2 + age * 0.2) : 1;
        const color = dn.isHeal ? '#66ffaa' : dn.isCrit ? '#ffcc22' : '#ffffff';
        const size = dn.isCrit ? 26 : 18;
        return (
          <div key={dn.id} style={{
            position: 'absolute',
            left: `${44 + Math.sin(dn.x * 13.7 + dn.z) * 14}%`,
            top: `${y}%`,
            transform: `translateX(-50%) scale(${scale})`,
            color, fontSize: size,
            fontWeight: 900,
            fontFamily: '"Georgia", serif',
            opacity,
            textShadow: dn.isCrit
              ? `0 0 12px #ffcc22, 0 2px 6px rgba(0,0,0,0.9), 0 0 24px #ff8800`
              : '0 1px 4px rgba(0,0,0,0.9)',
            userSelect: 'none', pointerEvents: 'none',
            letterSpacing: dn.isCrit ? 1 : 0,
          }}>
            {dn.isCrit && <span style={{ fontSize: 10, color: '#ffcc00', verticalAlign: 'super', marginRight: 2, fontFamily: 'monospace', letterSpacing: 2 }}>CRIT</span>}
            {dn.isHeal ? '+' : ''}{dn.value}
          </div>
        );
      })}
    </div>
  );
}

/* ── Wave / Level-up announcement ───────────────────────── */
function Announcement() {
  const { gameState } = useGameStore();
  const { waveAnnounce, waveAnnounceTimer } = gameState;
  if (waveAnnounceTimer <= 0 || !waveAnnounce) return null;
  const isLevelUp = waveAnnounce.startsWith('LEVEL');
  const opacity = Math.min(1, Math.min(waveAnnounceTimer * 2, (3 - waveAnnounceTimer) * 2));
  const ty = -8 + (1 - Math.min(1, waveAnnounceTimer * 3)) * 8;

  return (
    <div style={{ position: 'absolute', top: '26%', left: '50%', transform: `translateX(-50%) translateY(${ty}px)`, textAlign: 'center', pointerEvents: 'none', opacity }}>
      {isLevelUp ? (
        <>
          <div style={{ color: '#cc88ff', fontSize: 11, letterSpacing: 6, fontFamily: 'monospace', marginBottom: 6, textShadow: '0 0 12px #aa44ff' }}>ADVANCEMENT</div>
          <div style={{ color: '#cc88ff', fontSize: 38, fontWeight: 900, fontFamily: '"Georgia", serif', letterSpacing: 5, textShadow: '0 0 22px #aa44ff, 0 0 50px #7722cc' }}>
            LEVEL UP
          </div>
          <div style={{ color: '#aa88ff', fontSize: 14, fontFamily: 'monospace', letterSpacing: 4, marginTop: 6, opacity: 0.85 }}>
            Level {waveAnnounce.replace('LEVEL UP! → ', '')} — Power Increased
          </div>
        </>
      ) : (
        <>
          <div style={{ color: '#884422', fontSize: 10, letterSpacing: 6, fontFamily: 'monospace', marginBottom: 5 }}>— WAVE —</div>
          <div style={{ color: '#fff', fontSize: 34, fontWeight: 900, fontFamily: '"Georgia", serif', letterSpacing: 6, textShadow: '0 0 20px #ff4422, 0 0 50px #cc1100' }}>
            {waveAnnounce}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Main HUD (in-game) ──────────────────────────────────── */
function InGameHUD() {
  const { player, gameState } = useGameStore();
  const allEnemies = useGameStore.getState().enemies;
  const bossEnemy = allEnemies.find(e => e.type === 'boss' && e.state !== 'dead');
  const liveCount = allEnemies.filter(e => e.state !== 'dead').length;

  const xpPct = player.level >= 10 ? 1 : player.xp / player.xpToNext;
  const hpPct = player.health / player.maxHealth;

  const streakTitles: [number, string, string][] = [
    [25, 'LEGENDARY', '#ffaa00'],
    [15, 'UNSTOPPABLE', '#ff6600'],
    [10, 'DOMINATING', '#ff2200'],
    [5, 'RAMPAGE', '#ff4422'],
    [3, 'KILLING SPREE', '#cc8822'],
  ];
  let streakLabel = '';
  let streakColor = '';
  for (const [n, title, color] of streakTitles) {
    if (player.kills >= n) { streakLabel = title; streakColor = color; break; }
  }

  return (
    <>
      {/* ── Hit flash vignette ── */}
      {gameState.hitFlash > 0.05 && (
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at center, transparent 40%, rgba(200,20,0,${gameState.hitFlash * 0.5}) 100%)`, pointerEvents: 'none' }} />
      )}
      {/* ── Blood Rage border pulse ── */}
      {player.isRaging && (
        <div style={{ position: 'absolute', inset: 0, border: '3px solid rgba(200,0,0,0.4)', animation: 'ragePulse 0.7s ease-in-out infinite', pointerEvents: 'none' }} />
      )}

      {/* ══ TOP BAR ══ */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, rgba(180,120,40,0.35), transparent)' }} />

      {/* ══ PLAYER STATUS (top-left) ══ */}
      <div style={{ position: 'absolute', top: 20, left: 20, width: 222 }}>
        {/* Name plate */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '6px 10px', background: 'linear-gradient(90deg, rgba(120,10,10,0.9), rgba(0,0,0,0.6))', borderLeft: '2px solid #aa2200', borderRadius: '0 4px 4px 0' }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, #aa1a1a, #330000)', border: '1px solid #660000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2 L10 6 L14 7 L11 10 L12 14 L8 12 L4 14 L5 10 L2 7 L6 6 Z" fill="#cc2200" stroke="#ff4422" strokeWidth="0.5"/>
            </svg>
          </div>
          <div>
            <div style={{ color: '#e0c090', fontSize: 11, fontFamily: '"Georgia", serif', letterSpacing: 2, lineHeight: 1 }}>CRIMSON KNIGHT</div>
            <div style={{ color: '#aa7744', fontSize: 9, fontFamily: 'monospace', letterSpacing: 1 }}>LEVEL {player.level}</div>
          </div>
          {player.isRaging && (
            <div style={{ marginLeft: 'auto', color: '#ff2200', fontSize: 8, fontFamily: 'monospace', letterSpacing: 1, animation: 'cdPulse 0.5s infinite alternate' }}>RAGE</div>
          )}
        </div>

        {/* HP */}
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M5 9 C5 9 1 6 1 3.5 A2.5 2.5 0 0 1 5 2.5 A2.5 2.5 0 0 1 9 3.5 C9 6 5 9 5 9Z" fill="#cc1111"/>
            </svg>
            <div style={{ flex: 1, position: 'relative' }}>
              <StatBar pct={hpPct} color={`linear-gradient(90deg, #880000, ${hpPct < 0.3 ? '#ff1100' : '#cc1111'})`} glow="#cc1111" height={10} />
              {hpPct < 0.3 && <div style={{ position: 'absolute', inset: 0, borderRadius: 5, border: '1px solid #ff1100', animation: 'cdPulse 0.4s infinite alternate' }} />}
            </div>
            <div style={{ color: '#884444', fontSize: 9, fontFamily: 'monospace', minWidth: 36, textAlign: 'right' }}>{Math.ceil(player.health)}/{player.maxHealth}</div>
          </div>
          {/* Stamina */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M5 1 L7 4 L9 4 L5 9 L3 6 L1 6 Z" fill="#22aa44"/>
            </svg>
            <div style={{ flex: 1 }}>
              <StatBar pct={player.stamina / player.maxStamina} color="linear-gradient(90deg, #115522, #22aa44)" glow="#22aa44" height={7} />
            </div>
          </div>
          {/* Energy */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <polygon points="5,1 8,5 5,5 5,9 2,5 5,5" fill="#3366dd"/>
            </svg>
            <div style={{ flex: 1 }}>
              <StatBar pct={player.energy / player.maxEnergy} color="linear-gradient(90deg, #1133aa, #4488ff)" glow="#4488ff" height={7} />
            </div>
          </div>
          {/* XP */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <polygon points="5,1 6.5,4 10,4 7.5,6.5 8.5,10 5,8 1.5,10 2.5,6.5 0,4 3.5,4" fill="#7722cc" opacity="0.9"/>
            </svg>
            <div style={{ flex: 1 }}>
              <StatBar pct={xpPct} color="linear-gradient(90deg, #5522aa, #9944ff)" glow="#9944ff" height={5} />
            </div>
            {player.level < 10 && <div style={{ color: '#553388', fontSize: 8, fontFamily: 'monospace' }}>{player.xp}/{player.xpToNext}</div>}
            {player.level >= 10 && <div style={{ color: '#ffaa00', fontSize: 8, fontFamily: 'monospace' }}>MAX</div>}
          </div>
        </div>

        {/* Kill streak badge */}
        {streakLabel && (
          <div style={{ padding: '3px 8px', background: `linear-gradient(90deg, ${streakColor}22, transparent)`, borderLeft: `2px solid ${streakColor}`, color: streakColor, fontSize: 9, fontFamily: 'monospace', letterSpacing: 2, fontWeight: 'bold', textShadow: `0 0 8px ${streakColor}` }}>
            ⚔ {streakLabel} ⚔
          </div>
        )}
      </div>

      {/* ══ TOP CENTER (Wave + Score) ══ */}
      <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 0, alignItems: 'stretch' }}>
        <div style={{ padding: '6px 20px', background: 'rgba(0,0,0,0.72)', borderLeft: '1px solid rgba(180,140,50,0.4)', borderTop: '1px solid rgba(180,140,50,0.4)', borderBottom: '1px solid rgba(180,140,50,0.4)', borderRadius: '6px 0 0 6px', textAlign: 'center' }}>
          <div style={{ color: '#604020', fontSize: 8, letterSpacing: 3, fontFamily: 'monospace' }}>WAVE</div>
          <div style={{ color: '#e0c080', fontSize: 24, fontWeight: 900, fontFamily: '"Georgia", serif', lineHeight: 1 }}>{gameState.wave}</div>
        </div>
        <div style={{ width: 1, background: 'rgba(180,140,50,0.3)' }} />
        <div style={{ padding: '6px 20px', background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(180,140,50,0.4)', textAlign: 'center' }}>
          <div style={{ color: '#604020', fontSize: 8, letterSpacing: 3, fontFamily: 'monospace' }}>SCORE</div>
          <div style={{ color: '#ffcc44', fontSize: 24, fontWeight: 900, fontFamily: '"Georgia", serif', lineHeight: 1 }}>{gameState.score.toLocaleString()}</div>
        </div>
        <div style={{ width: 1, background: 'rgba(180,140,50,0.3)' }} />
        <div style={{ padding: '6px 20px', background: 'rgba(0,0,0,0.72)', borderRight: '1px solid rgba(180,140,50,0.4)', borderTop: '1px solid rgba(180,140,50,0.4)', borderBottom: '1px solid rgba(180,140,50,0.4)', borderRadius: '0 6px 6px 0', textAlign: 'center' }}>
          <div style={{ color: '#604020', fontSize: 8, letterSpacing: 3, fontFamily: 'monospace' }}>KILLS</div>
          <div style={{ color: '#ff6644', fontSize: 24, fontWeight: 900, fontFamily: '"Georgia", serif', lineHeight: 1 }}>{player.kills}</div>
        </div>
      </div>

      {/* ══ Enemy counter (top right) ══ */}
      {liveCount > 0 && (
        <div style={{ position: 'absolute', top: 20, right: 20, padding: '6px 14px', background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(180,60,60,0.4)', borderRadius: 5, color: '#aa5544', fontSize: 11, fontFamily: 'monospace', letterSpacing: 1 }}>
          {liveCount} <span style={{ fontSize: 8, opacity: 0.7 }}>ENEMIES</span>
        </div>
      )}

      {/* ══ BOSS HEALTH BAR ══ */}
      {bossEnemy && (
        <div style={{ position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)', width: 440 }}>
          <div style={{ background: 'rgba(0,0,0,0.82)', border: '1px solid #660088', borderRadius: 6, padding: '10px 16px', boxShadow: '0 0 20px rgba(100,0,140,0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ color: '#cc88ff', fontSize: 11, letterSpacing: 3, fontFamily: '"Georgia", serif', textShadow: '0 0 10px #aa44ff' }}>☠ SHADOW WARLORD ☠</div>
              <div style={{ color: '#885599', fontSize: 9, fontFamily: 'monospace' }}>{Math.ceil(bossEnemy.health)}/{bossEnemy.maxHealth}</div>
            </div>
            <div style={{ position: 'relative', height: 12, background: 'rgba(0,0,0,0.6)', borderRadius: 6, overflow: 'hidden', border: '1px solid #330055' }}>
              <div style={{ height: '100%', width: `${(bossEnemy.health / bossEnemy.maxHealth) * 100}%`, background: 'linear-gradient(90deg, #44006a, #aa00cc, #dd44ff)', borderRadius: 6, boxShadow: '0 0 10px #aa00cc', transition: 'width 0.12s' }} />
              {/* Phase markers */}
              {[0.75, 0.5, 0.25].map((p) => (
                <div key={p} style={{ position: 'absolute', top: 0, bottom: 0, left: `${p * 100}%`, width: 1, background: 'rgba(255,255,255,0.15)' }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ COMBO DISPLAY (bottom-right) ══ */}
      {player.combo > 1 && (
        <div style={{ position: 'absolute', bottom: 110, right: 24, textAlign: 'right' }}>
          <div style={{ color: player.combo >= 4 ? '#ffaa00' : '#ffcc88', fontSize: player.combo >= 4 ? 44 : 34, fontWeight: 900, fontFamily: '"Georgia", serif', textShadow: player.combo >= 4 ? '0 0 20px #ffaa00, 0 0 40px #ff6600' : '0 0 10px #ffcc88', lineHeight: 1 }}>
            ×{player.combo}
          </div>
          <div style={{ color: '#884422', fontSize: 9, fontFamily: 'monospace', letterSpacing: 3 }}>COMBO</div>
        </div>
      )}

      {/* ══ SKILL BAR (bottom center) ══ */}
      <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        {/* Keybind hint */}
        <div style={{ color: 'rgba(130,100,60,0.55)', fontSize: 8, fontFamily: 'monospace', letterSpacing: 1, textAlign: 'center' }}>
          Z · Whirlwind &nbsp;·&nbsp; X · Phantom Strike &nbsp;·&nbsp; C · Blood Rage &nbsp;·&nbsp; V · Execute
        </div>
        {/* Skill slots */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 12px', background: 'linear-gradient(180deg, rgba(10,6,2,0.88), rgba(5,3,8,0.92))', borderRadius: 8, border: '1px solid rgba(120,90,40,0.4)', boxShadow: '0 -2px 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)' }}>
          {SKILL_ORDER.map((id, i) => <SkillSlot key={id} id={id} index={i} />)}
        </div>
        {/* Controls */}
        <div style={{ color: 'rgba(80,60,40,0.5)', fontSize: 7.5, fontFamily: 'monospace', letterSpacing: 0.8, textAlign: 'center' }}>
          WASD Move &nbsp;·&nbsp; Space Dodge &nbsp;·&nbsp; F Light &nbsp;·&nbsp; G Heavy &nbsp;·&nbsp; Q Block &nbsp;·&nbsp; Tab Lock
        </div>
      </div>

      <Announcement />
      <DamageNumbers />
    </>
  );
}

/* ══ MAIN EXPORT ══════════════════════════════════════════ */
export function GameHUD() {
  const { gameState } = useGameStore();
  if (gameState.phase === 'menu') return <MenuScreen />;
  if (gameState.phase === 'gameover') return <GameOverScreen />;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <style>{`
        @keyframes cdPulse { from { opacity: 0.6; } to { opacity: 1; } }
        @keyframes ragePulse { 0%,100% { opacity: 0.3; } 50% { opacity: 0.8; } }
      `}</style>
      <InGameHUD />
    </div>
  );
}

/* ══ MENU SCREEN ══════════════════════════════════════════ */
function MenuScreen() {
  const { setGamePhase, resetGame } = useGameStore();
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at center, rgba(30,5,0,0.95) 0%, rgba(0,0,0,0.98) 100%)' }}>
      <div style={{ textAlign: 'center', maxWidth: 560 }}>
        {/* Decorative line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, justifyContent: 'center' }}>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(180,120,40,0.6))' }} />
          <svg width="16" height="16" viewBox="0 0 16 16"><polygon points="8,1 10,6 15,6 11,9 13,15 8,11 3,15 5,9 1,6 6,6" fill="#aa3300" stroke="#cc4422" strokeWidth="0.5"/></svg>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(180,120,40,0.6), transparent)' }} />
        </div>

        <div style={{ fontSize: 9, color: '#664422', letterSpacing: 6, fontFamily: 'monospace', marginBottom: 10 }}>3D ACTION RPG</div>
        <div style={{ fontSize: 60, fontWeight: 900, letterSpacing: 6, fontFamily: '"Georgia", serif', lineHeight: 1, marginBottom: 8, background: 'linear-gradient(180deg, #ff4422 0%, #aa1100 40%, #cc2200 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 20px rgba(200,50,0,0.7))' }}>
          CRIMSON
        </div>
        <div style={{ fontSize: 48, fontWeight: 900, letterSpacing: 10, fontFamily: '"Georgia", serif', lineHeight: 1, marginBottom: 36, background: 'linear-gradient(180deg, #cc9940 0%, #886620 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          DESERT
        </div>

        {/* Controls panel */}
        <div style={{ marginBottom: 40, padding: '16px 28px', background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(120,80,30,0.3)', borderRadius: 4, color: '#7a5830', fontSize: 10, letterSpacing: 1.5, lineHeight: 2.4, fontFamily: 'monospace' }}>
          <div style={{ color: '#a07840', marginBottom: 4 }}>COMBAT CONTROLS</div>
          <div>WASD — Move &nbsp;·&nbsp; Space — Dodge &nbsp;·&nbsp; Q — Block</div>
          <div>F — Light Attack &nbsp;·&nbsp; G — Heavy Attack &nbsp;·&nbsp; Tab — Lock-On</div>
          <div style={{ color: '#8866aa', marginTop: 6 }}>Z — Whirlwind (AOE) &nbsp;·&nbsp; X — Phantom Strike (Dash)</div>
          <div style={{ color: '#8866aa' }}>C — Blood Rage (Fury) &nbsp;·&nbsp; V — Execute (Finisher)</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28, justifyContent: 'center' }}>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(180,120,40,0.4))' }} />
          <div style={{ color: '#442210', fontSize: 8, letterSpacing: 4, fontFamily: 'monospace' }}>ENTER THE ARENA</div>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(180,120,40,0.4), transparent)' }} />
        </div>

        <button
          style={{ pointerEvents: 'all', cursor: 'pointer', background: 'linear-gradient(180deg, #8a1200, #5a0800)', color: '#f0c090', border: '1px solid #cc4422', borderRadius: 3, padding: '14px 60px', fontSize: 15, letterSpacing: 6, fontFamily: '"Georgia", serif', fontWeight: 'bold', boxShadow: '0 0 24px rgba(180,50,0,0.4), 0 4px 8px rgba(0,0,0,0.8)', transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 40px rgba(220,60,0,0.65), 0 4px 8px rgba(0,0,0,0.8)'; e.currentTarget.style.transform = 'scale(1.03)'; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 0 24px rgba(180,50,0,0.4), 0 4px 8px rgba(0,0,0,0.8)'; e.currentTarget.style.transform = 'scale(1)'; }}
          onClick={() => { resetGame(); setGamePhase('playing'); }}
        >
          BEGIN
        </button>
      </div>
    </div>
  );
}

/* ══ GAME OVER SCREEN ══════════════════════════════════════ */
function GameOverScreen() {
  const { gameState, player, resetGame, setGamePhase } = useGameStore();
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at center, rgba(15,0,0,0.97) 0%, rgba(0,0,0,0.99) 100%)' }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <div style={{ fontSize: 9, color: '#440000', letterSpacing: 6, fontFamily: 'monospace', marginBottom: 14 }}>— YOU HAVE FALLEN —</div>
        <div style={{ fontSize: 70, fontWeight: 900, fontFamily: '"Georgia", serif', letterSpacing: 4, lineHeight: 1, marginBottom: 40, background: 'linear-gradient(180deg, #cc1100, #660000)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 20px rgba(180,0,0,0.6))' }}>
          FALLEN
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, marginBottom: 40, border: '1px solid rgba(120,40,40,0.3)', borderRadius: 4, overflow: 'hidden' }}>
          {[['WAVE REACHED', String(gameState.wave)], ['FINAL SCORE', gameState.score.toLocaleString()], ['TOTAL KILLS', String(player.kills)], ['LEVEL', String(player.level)]].map(([lbl, val]) => (
            <div key={lbl} style={{ padding: '14px 20px', background: 'rgba(0,0,0,0.55)', textAlign: 'center' }}>
              <div style={{ color: '#442222', fontSize: 8, letterSpacing: 3, fontFamily: 'monospace', marginBottom: 4 }}>{lbl}</div>
              <div style={{ color: '#cc4444', fontSize: 28, fontWeight: 900, fontFamily: '"Georgia", serif', lineHeight: 1 }}>{val}</div>
            </div>
          ))}
        </div>

        <button
          style={{ pointerEvents: 'all', cursor: 'pointer', background: 'linear-gradient(180deg, #5a0800, #350500)', color: '#cc8888', border: '1px solid #882222', borderRadius: 3, padding: '12px 50px', fontSize: 14, letterSpacing: 5, fontFamily: '"Georgia", serif', boxShadow: '0 0 16px rgba(120,0,0,0.4)', transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 30px rgba(160,0,0,0.55)'; e.currentTarget.style.transform = 'scale(1.04)'; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 0 16px rgba(120,0,0,0.4)'; e.currentTarget.style.transform = 'scale(1)'; }}
          onClick={() => { resetGame(); setGamePhase('playing'); }}
        >
          RISE AGAIN
        </button>
      </div>
    </div>
  );
}
