import { useState } from 'react';

/**
 * Reusable "expandable category" pattern for menus with several option lists
 * (music track, sound effect, background, tube style, etc.).
 *
 * Renders a collapsed ROW inside the parent menu (category name + small preview
 * of the active item + chevron). On tap, it opens a CENTERED child modal on top of the
 * parent menu (higher z-index), with a header, an optional large preview at the top, and the
 * option list as the child modal's ONLY scroll area — no siblings competing for space,
 * so the scroll never "locks up" before the end of the list.
 *
 * Closing the child modal (X or backdrop) returns to the parent modal; it does not close both.
 *
 * Used in SoundSettings (music track / sound effect) and reused in the Shop
 * (background / tube style).
 */
export interface CategoryPickerProps<T extends { id: string }> {
  /** Category name, e.g. "Music track", "Background". */
  label: string;
  items: T[];
  activeId: string;
  onSelect: (id: string) => void;
  /** SMALL preview of the active item, shown in the collapsed row (icon/swatch/color). */
  collapsedPreview: (active: T | undefined) => React.ReactNode;
  /** Display name of the active item, shown next to the small preview in the collapsed row. */
  activeLabel: (active: T | undefined) => string;
  /** Optional LARGE preview, pinned at the top of the child modal (above the list). */
  bigPreview?: (active: T | undefined) => React.ReactNode;
  /** Renders a single row of the option list inside the child modal. */
  renderRow: (item: T, isActive: boolean, onSelect: () => void) => React.ReactNode;
  /** Child modal title (defaults to `label`). */
  modalTitle?: string;
  /** Optional FIXED footer inside the child modal (below the list). Used by the Shop to show
   *  "Buy/Equip" right HERE — so the action is reachable without having to close the modal. */
  footer?: React.ReactNode;
}

export function CategoryPicker<T extends { id: string }>({
  label,
  items,
  activeId,
  onSelect,
  collapsedPreview,
  activeLabel,
  bigPreview,
  renderRow,
  modalTitle,
  footer,
}: CategoryPickerProps<T>) {
  const [open, setOpen] = useState(false);
  const active = items.find(i => i.id === activeId);

  return (
    <>
      {/* Collapsed row — lives inside the parent menu */}
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-xl bg-slate-800 px-4 py-3 text-left transition active:scale-[0.98]"
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 text-sm font-medium text-slate-100">{label}</div>
          <div className="flex items-center gap-2">
            {/* h-10/w-10 = same size as the "sm" swatch (BgSwatch/TubeSwatch) used in the list
                rows — a smaller slot cut the TubeSwatch (40×24px) in half. */}
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-700/60 text-sm leading-none">
              {collapsedPreview(active)}
            </span>
            <span className="truncate text-xs text-slate-400">
              {activeLabel(active)}
            </span>
          </div>
        </div>
        <span className="shrink-0 text-slate-500">›</span>
      </button>

      {/* Child modal — centered, z-index above the parent menu, closes only itself */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[85dvh] w-full max-w-sm flex-col rounded-2xl bg-slate-900 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Fixed header */}
            <div className="flex shrink-0 items-center justify-between px-5 pt-5 pb-3">
              <div className="text-base font-semibold text-slate-100">{modalTitle ?? label}</div>
              <button
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition active:scale-90"
              >
                ✕
              </button>
            </div>

            {/* Fixed large preview (optional) */}
            {bigPreview && (
              <div className="shrink-0 px-5 pb-3">
                {bigPreview(active)}
              </div>
            )}

            {/* Option list — the ONLY scroll area, no siblings competing for space.
                pt-1.5: without it the ring of the 1st item (selected) touches the scroll edge and
                looks clipped relative to the others. */}
            <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-1.5 ${footer ? 'pb-3' : 'pb-[max(1.25rem,env(safe-area-inset-bottom))]'}`}>
              <div className="flex flex-col gap-1.5">
                {items.map(item =>
                  renderRow(item, item.id === activeId, () => {
                    onSelect(item.id);
                  }),
                )}
              </div>
            </div>

            {/* Optional fixed footer (the Shop's buy/equip action) */}
            {footer && (
              <div className="shrink-0 border-t border-slate-800 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                {footer}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
