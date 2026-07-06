/**
 * Game engine types (water sort).
 * A tube is an array of color IDs, from the BOTTOM (index 0) to the TOP (end).
 * Empty tube = empty array. Only the top unit moves.
 */
export type Tube = number[];

/**
 * Chameleon wildcard: a neutral unit that matches ANY color.
 * It is just a sentinel color (-1) inside the tube; the pour/win rules treat it
 * as compatible with everything. Classic levels do not use it.
 */
export const WILD = -1;

export interface GameState {
  /** List of tubes. */
  tubes: Tube[];
  /** Capacity (units per tube). Default 4. */
  capacity: number;
  /**
   * Corks (capped tube). `locks[i]` = number of moves left until tube `i`'s cork
   * dissolves. 0/absent = open. A capped tube neither pours nor receives; it counts
   * down on each successful move. Optional — classic levels do not use it.
   */
  locks?: number[];
  /**
   * Color filter. `filters[i]` = the only color tube `i` accepts (besides the wildcard).
   * null/absent = free tube. Since the constraint is bound to the tube's POSITION, it breaks
   * symmetry (it enters the canonical key, like corks). Optional.
   */
  filters?: (number | null)[];
  /**
   * Hidden bottom. `hidden[i][p]` = true if the unit at position `p` (0 = bottom) of tube `i`
   * is face-down (color unknown to the player). It is revealed once it becomes the top. Does NOT
   * change the rules (only the top moves, and the top is always revealed) — it is RENDER/UX state
   * that enters the snapshot so undo can restore it. The solver ignores it. Optional.
   */
  hidden?: boolean[][];
  /**
   * Alchemy enabled. When true, pouring color A onto color B (A≠B) in a free tube
   * TRANSMUTES the contact into a 3rd color C, if a recipe exists (see MIX_RECIPES in the engine).
   * It is a GLOBAL move rule (not bound to a position), so it does not enter the canonical
   * key. Irreversible: once mixed, the color cannot be separated. Optional.
   */
  alchemy?: boolean;
}

/** A pour: from tube `from` to tube `to`, moving `count` units of the top color. */
export interface Move {
  from: number;
  to: number;
  count: number;
}
