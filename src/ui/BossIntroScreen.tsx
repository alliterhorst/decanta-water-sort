import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import type { BossData } from '../game/boss';
import { useT } from '../i18n/context';

interface Props {
  boss: BossData;
  onFight: () => void;
  onFlee?: () => void;
}

const BOSS_ICONS = ['⬡', '◈', '◉'];

export function BossIntroScreen({ boss, onFight, onFlee }: Props) {
  const t = useT();
  const bossText = t.boss[boss.id as keyof typeof t.boss];
  const cardRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const card = cardRef.current;
    const icon = iconRef.current;
    if (!card || !icon) return;

    const tl = gsap.timeline();
    tl.from(card, { opacity: 0, y: 40, duration: 0.55, ease: 'power3.out' });
    tl.from(icon, { scale: 0.4, opacity: 0, duration: 0.4, ease: 'back.out(2)' }, 0.15);

    // Pulse aura on the icon indefinitely
    gsap.to(icon, {
      boxShadow: `0 0 80px 30px ${boss.portraitAccent}44, 0 0 40px 10px ${boss.portraitAccent}66`,
      repeat: -1,
      yoyo: true,
      duration: 1.8,
      ease: 'sine.inOut',
      delay: 0.4,
    });

    return () => { tl.kill(); gsap.killTweensOf(icon); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center"
      style={{ background: boss.portraitGradient }}
    >
      {/* Noise overlay for texture */}
      <div className="pointer-events-none absolute inset-0 opacity-20"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'1\'/%3E%3C/svg%3E")', backgroundSize: '200px 200px' }}
      />

      <div ref={cardRef} className="relative mx-4 max-h-[85dvh] w-full max-w-sm overflow-y-auto overscroll-contain">
        {/* Tier tag */}
        <div
          className="mb-4 text-center text-xs font-bold uppercase tracking-widest"
          style={{ color: boss.portraitAccent }}
        >
          {t.bossIntro.tierN(boss.tier + 1)}
        </div>

        {/* Portrait */}
        <div className="mb-6 flex justify-center">
          <div
            ref={iconRef}
            className="flex h-36 w-36 items-center justify-center rounded-full select-none"
            style={{
              background: `radial-gradient(circle at 35% 35%, ${boss.portraitAccent}55 0%, transparent 70%)`,
              border: `2px solid ${boss.portraitAccent}66`,
              boxShadow: `0 0 60px 20px ${boss.portraitAccent}33, 0 0 30px 10px ${boss.portraitAccent}55`,
              fontSize: '5rem',
              lineHeight: 1,
            }}
          >
            {BOSS_ICONS[boss.tier] ?? '◉'}
          </div>
        </div>

        {/* Identity */}
        <div className="mb-5 text-center">
          <div
            className="mb-0.5 text-2xl font-bold text-white"
            style={{ textShadow: `0 0 24px ${boss.portraitAccent}88` }}
          >
            {bossText.name}
          </div>
          <div className="text-sm font-medium" style={{ color: boss.portraitAccent }}>
            {bossText.title}
          </div>
        </div>

        {/* Lore */}
        <p className="mb-5 px-2 text-center text-sm leading-relaxed text-slate-300">
          {bossText.lore}
        </p>

        {/* Ability badge */}
        <div
          className="mx-auto mb-8 rounded-xl px-4 py-3 text-sm font-medium text-white"
          style={{
            background: `${boss.portraitAccent}18`,
            border: `1px solid ${boss.portraitAccent}44`,
            maxWidth: '20rem',
            textAlign: 'center',
          }}
        >
          {bossText.ability}
        </div>

        {/* CTA */}
        <div className="flex gap-3">
          {onFlee && (
            <button
              onClick={onFlee}
              className="flex-1 rounded-xl bg-black/30 py-3 text-sm font-medium text-slate-400 transition active:scale-95"
            >
              {t.bossIntro.recuar}
            </button>
          )}
          <button
            onClick={onFight}
            className="flex-1 rounded-xl py-3 text-sm font-bold text-white shadow-lg transition active:scale-95"
            style={{
              background: `linear-gradient(135deg, ${boss.portraitAccent}bb 0%, ${boss.portraitAccent} 100%)`,
              boxShadow: `0 4px 24px ${boss.portraitAccent}55`,
            }}
          >
            {t.bossIntro.enfrentar}
          </button>
        </div>
      </div>
    </div>
  );
}
