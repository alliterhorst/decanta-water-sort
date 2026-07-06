import { useId, useState } from 'react';
import { BG_THEMES, TUBE_STYLES, TUBE_SHAPES, type Wallet, type ShopItem, type BgTheme, type TubeStyle, type TubeShapeItem } from '../game/economy';
import { TUBE_SHAPE_SPECS, CLASSIC_SHAPE, tubeSvgPath, type TubeShapeSpec } from '../render/geometry';
import { CategoryPicker } from './CategoryPicker';
import { useT } from '../i18n/context';
import type { Dictionary } from '../i18n/types';

const bgName = (t: Dictionary, id: string) => t.economy.bg[id as keyof typeof t.economy.bg];
const tubeName = (t: Dictionary, id: string) => t.economy.tube[id as keyof typeof t.economy.tube];
const shapeName = (t: Dictionary, id: string) => t.economy.shape[id as keyof typeof t.economy.shape];
const specOf = (id: string): TubeShapeSpec => TUBE_SHAPE_SPECS[id] ?? CLASSIC_SHAPE;

interface Props {
  wallet: Wallet;
  onBuyOrEquip: (item: ShopItem) => void;
  onPreview: (item: ShopItem) => void;
  onClose: () => void;
}

export function ShopModal({ wallet, onBuyOrEquip, onPreview, onClose }: Props) {
  const t = useT();
  const owned = (id: string) => wallet.owned.includes(id);
  // Item currently being previewed (not purchased yet)
  const [previewing, setPreviewing] = useState<ShopItem | null>(null);

  const handleItemClick = (item: ShopItem) => {
    if (owned(item.id) || item.price === 0) {
      // Already owned or free → equip directly, no confirmation
      onBuyOrEquip(item);
      setPreviewing(null);
    } else if (previewing?.id === item.id) {
      // Clicked the same item already in preview → no-op (use the Buy button)
    } else {
      // Paid item not owned → enter preview
      setPreviewing(item);
      onPreview(item);
    }
  };

  const handleBuy = () => {
    if (!previewing) return;
    onBuyOrEquip(previewing);
    setPreviewing(null);
  };

  const canAffordPreview = previewing ? wallet.coins >= previewing.price : false;

  // "Active" ID shown in each category picker: if there's an item from that
  // category in preview, show it; otherwise show the equipped one.
  const activeBgId = previewing?.kind === 'bg' ? previewing.id : wallet.bg;
  const activeTubeId = previewing?.kind === 'tube' ? previewing.id : wallet.tube;
  const activeShapeId = previewing?.kind === 'shape' ? previewing.id : wallet.tubeShape;
  // Shape swatches are tinted with the color the player has equipped (or is previewing), so the
  // "shape" preview reads as the same glass they'll actually see in-game.
  const activeTubeRim = (TUBE_STYLES.find(ts => ts.id === activeTubeId) ?? TUBE_STYLES[0]).rim;

  // Buy footer INSIDE each category's child modal — shows "Buy" while the paid item is in
  // preview, so the action is reachable without having to close the modal to find it.
  const buyFooter = (kind: ShopItem['kind']) => {
    if (!previewing || previewing.kind !== kind) return null;
    return (
      <button
        onClick={handleBuy}
        disabled={!canAffordPreview}
        className="w-full rounded-xl bg-teal-400 py-3 text-base font-semibold text-slate-900 transition active:scale-95 disabled:opacity-40"
      >
        {canAffordPreview ? t.shop.comprarPor(previewing.price) : t.shop.saldoInsuficiente(previewing.price)}
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal card — flex column with a max height so scrolling works */}
      <div className="flex max-h-[85dvh] w-full max-w-sm flex-col rounded-2xl bg-slate-900 shadow-2xl">

        {/* ── Fixed header ── */}
        <div className="shrink-0 px-5 pb-3 pt-5">
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold text-slate-100">{t.shop.title}</span>
            <div className="flex items-center gap-1.5 text-base font-medium text-amber-400">
              <span>★</span>
              <span>{t.common.moedas(wallet.coins)}</span>
            </div>
          </div>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-2">
          <div className="mb-3">
            <CategoryPicker<BgTheme>
              label={t.shop.fundos}
              modalTitle={t.shop.fundos}
              items={BG_THEMES}
              activeId={activeBgId}
              onSelect={id => {
                const item = BG_THEMES.find(b => b.id === id);
                if (item) handleItemClick(item);
              }}
              collapsedPreview={active => active && <BgSwatch top={active.top} mid={active.mid} deep={active.deep} size="sm" />}
              activeLabel={active => (active ? bgName(t, active.id) : '—')}
              bigPreview={active => active && <BgSwatch top={active.top} mid={active.mid} deep={active.deep} size="lg" />}
              renderRow={(bg) => {
                const isOwned = owned(bg.id);
                const isEquipped = wallet.bg === bg.id;
                const isPreviewing = previewing?.id === bg.id;
                return (
                  <ItemRow
                    key={bg.id}
                    name={bgName(t, bg.id)}
                    price={bg.price}
                    isOwned={isOwned}
                    isEquipped={isEquipped}
                    isPreviewing={isPreviewing}
                    canAfford={wallet.coins >= bg.price || isOwned}
                    preview={<BgSwatch top={bg.top} mid={bg.mid} deep={bg.deep} size="sm" />}
                    onClick={() => handleItemClick(bg)}
                  />
                );
              }}
              footer={buyFooter('bg')}
            />
          </div>

          <div className="mb-3">
            <CategoryPicker<TubeStyle>
              label={t.shop.corDoTubo}
              modalTitle={t.shop.corDoTubo}
              items={TUBE_STYLES}
              activeId={activeTubeId}
              onSelect={id => {
                const item = TUBE_STYLES.find(ts => ts.id === id);
                if (item) handleItemClick(item);
              }}
              collapsedPreview={active => active && <TubeSwatch rim={active.rim} size="sm" />}
              activeLabel={active => (active ? tubeName(t, active.id) : '—')}
              bigPreview={active => active && <TubeSwatch rim={active.rim} size="lg" />}
              renderRow={(ts) => {
                const isOwned = owned(ts.id);
                const isEquipped = wallet.tube === ts.id;
                const isPreviewing = previewing?.id === ts.id;
                return (
                  <ItemRow
                    key={ts.id}
                    name={tubeName(t, ts.id)}
                    price={ts.price}
                    isOwned={isOwned}
                    isEquipped={isEquipped}
                    isPreviewing={isPreviewing}
                    canAfford={wallet.coins >= ts.price || isOwned}
                    preview={<TubeSwatch rim={ts.rim} size="sm" />}
                    onClick={() => handleItemClick(ts)}
                  />
                );
              }}
              footer={buyFooter('tube')}
            />
          </div>

          <div className="mb-3">
            <CategoryPicker<TubeShapeItem>
              label={t.shop.formatoDoTubo}
              modalTitle={t.shop.formatoDoTubo}
              items={TUBE_SHAPES}
              activeId={activeShapeId}
              onSelect={id => {
                const item = TUBE_SHAPES.find(s => s.id === id);
                if (item) handleItemClick(item);
              }}
              collapsedPreview={active => active && <ShapeSwatch spec={specOf(active.id)} rim={activeTubeRim} size="sm" />}
              activeLabel={active => (active ? shapeName(t, active.id) : '—')}
              bigPreview={active => active && <ShapeSwatch spec={specOf(active.id)} rim={activeTubeRim} size="lg" />}
              renderRow={(sh) => {
                const isOwned = owned(sh.id);
                const isEquipped = wallet.tubeShape === sh.id;
                const isPreviewing = previewing?.id === sh.id;
                return (
                  <ItemRow
                    key={sh.id}
                    name={shapeName(t, sh.id)}
                    price={sh.price}
                    isOwned={isOwned}
                    isEquipped={isEquipped}
                    isPreviewing={isPreviewing}
                    canAfford={wallet.coins >= sh.price || isOwned}
                    preview={<ShapeSwatch spec={specOf(sh.id)} rim={activeTubeRim} size="sm" />}
                    onClick={() => handleItemClick(sh)}
                  />
                );
              }}
              footer={buyFooter('shape')}
            />
          </div>
        </div>

        {/* ── Fixed footer ── */}
        <div className="shrink-0 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 flex flex-col gap-2">
          {previewing && (
            <button
              onClick={handleBuy}
              disabled={!canAffordPreview}
              className="w-full rounded-xl bg-teal-400 py-3 text-base font-semibold text-slate-900 transition active:scale-95 disabled:opacity-40"
            >
              {canAffordPreview
                ? t.shop.comprarPor(previewing.price)
                : t.shop.saldoInsuficiente(previewing.price)}
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-slate-800 py-3 text-base font-medium text-slate-300 transition active:scale-95"
          >
            {previewing ? t.common.cancelar : t.common.fechar}
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemRow({
  name, price, isOwned, isEquipped, isPreviewing, canAfford, preview, onClick,
}: {
  name: string; price: number; isOwned: boolean; isEquipped: boolean;
  isPreviewing: boolean; canAfford: boolean; preview: React.ReactNode; onClick: () => void;
}) {
  const t = useT();
  const label = isEquipped
    ? t.shop.emUso
    : isPreviewing
      ? t.shop.visualizando
      : isOwned
        ? t.shop.equipar
        : price === 0
          ? t.shop.gratis
          : `★ ${t.common.moedas(price)}`;

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition active:scale-95 ${
        isEquipped
          ? 'bg-teal-400/15 ring-1 ring-teal-400/50'
          : isPreviewing
            ? 'bg-sky-400/10 ring-1 ring-sky-400/40'
            : 'bg-slate-700/60 hover:bg-slate-700'
      } ${!isOwned && !canAfford && !isPreviewing ? 'opacity-50' : ''}`}
    >
      <div className="shrink-0">{preview}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-medium text-slate-100">{name}</div>
        <div className={`text-sm ${isPreviewing ? 'text-sky-400' : 'text-slate-400'}`}>{label}</div>
      </div>
      {isEquipped && <span className="shrink-0 text-sm font-semibold text-teal-400">✓</span>}
      {isPreviewing && <span className="shrink-0 text-sm text-sky-400">◉</span>}
    </button>
  );
}

function BgSwatch({ top, mid, deep, size = 'sm' }: { top: number; mid: number; deep: number; size?: 'sm' | 'lg' }) {
  const toHex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  if (size === 'lg') {
    return (
      <div
        className="h-28 w-full rounded-xl ring-1 ring-white/10"
        style={{
          background: `linear-gradient(to bottom, ${toHex(top)}, ${toHex(mid)}, ${toHex(deep)})`,
        }}
      />
    );
  }
  return (
    <div
      className="h-10 w-10 rounded-lg"
      style={{
        background: `linear-gradient(to bottom, ${toHex(top)}, ${toHex(mid)}, ${toHex(deep)})`,
      }}
    />
  );
}

function TubeSwatch({ rim, size = 'sm' }: { rim: number; size?: 'sm' | 'lg' }) {
  const toHex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  if (size === 'lg') {
    return (
      <div className="flex h-28 w-full items-center justify-center rounded-xl bg-slate-950/40 ring-1 ring-white/10">
        <div
          className="relative h-24 w-12 rounded-b-2xl rounded-t-md border-2"
          style={{ borderColor: toHex(rim), background: toHex(rim) + '18' }}
        >
          {/* Glass side highlight */}
          <div
            className="absolute left-1.5 top-2 h-[calc(100%-1rem)] w-1.5 rounded-full opacity-60"
            style={{ background: toHex(rim) + '55' }}
          />
          {/* Illustrative "liquid" at the bottom of the tube */}
          <div
            className="absolute bottom-0 left-0 right-0 h-1/3 rounded-b-2xl"
            style={{ background: toHex(rim) + '40' }}
          />
        </div>
      </div>
    );
  }
  return (
    <div
      className="h-10 w-6 rounded-full border-2"
      style={{ borderColor: toHex(rim), background: toHex(rim) + '18' }}
    />
  );
}

/** Draws the actual tube SILHOUETTE (from the geometry spec) with a bit of liquid inside, so the
 *  shape reads at a glance in the shop. Tinted with the equipped tube color (rim). */
function ShapeSwatch({ spec, rim, size = 'sm' }: { spec: TubeShapeSpec; rim: number; size?: 'sm' | 'lg' }) {
  const toHex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  const clipId = useId();
  const VW = 44, VH = 108;
  const d = tubeSvgPath(spec, VW, VH);
  const glass = toHex(rim);
  const liquidTop = VH * 0.52; // fill ~48% from the bottom
  const svg = (
    <svg viewBox={`0 0 ${VW} ${VH}`} className={size === 'lg' ? 'h-24' : 'h-10'} fill="none" preserveAspectRatio="xMidYMid meet">
      <defs>
        <clipPath id={clipId}><path d={d} /></clipPath>
      </defs>
      {/* faint glass body */}
      <path d={d} fill={glass + '14'} />
      {/* liquid, clipped to the silhouette */}
      <rect x="0" y={liquidTop} width={VW} height={VH - liquidTop} fill={glass + '55'} clipPath={`url(#${clipId})`} />
      {/* outline */}
      <path d={d} fill="none" stroke={glass} strokeWidth={size === 'lg' ? 2 : 3} strokeLinejoin="round" strokeOpacity={0.9} />
    </svg>
  );
  if (size === 'lg') {
    return (
      <div className="flex h-28 w-full items-center justify-center rounded-xl bg-slate-950/40 ring-1 ring-white/10">
        {svg}
      </div>
    );
  }
  return <span className="flex h-10 w-10 items-center justify-center">{svg}</span>;
}
