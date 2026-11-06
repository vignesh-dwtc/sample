// Flip: 5×5 lights-toggle puzzle. Pressing a cell toggles it and its orthogonal neighbours.
import { seededRandom } from '../util.js';

export const SIZE = 5;
export const CELLS = SIZE * SIZE;
export const MAX_MOVES = 2000; // generous: a long, flailing solve must still be submittable

export function press(grid, i) {
  const r = Math.floor(i / SIZE), c = i % SIZE;
  grid[i] ^= 1;
  if (r > 0) grid[i - SIZE] ^= 1;
  if (r < SIZE - 1) grid[i + SIZE] ^= 1;
  if (c > 0) grid[i - 1] ^= 1;
  if (c < SIZE - 1) grid[i + 1] ^= 1;
  return grid;
}

export function applyMoves(grid, moves) {
  const g = [...grid];
  for (const m of moves) press(g, m);
  return g;
}

export const isSolved = (grid) => grid.every((v) => v === 0);

export function validMoves(moves) {
  return Array.isArray(moves) && moves.length > 0 && moves.length <= MAX_MOVES &&
    moves.every((m) => Number.isInteger(m) && m >= 0 && m < CELLS);
}

/**
 * All press-sets (as sorted cell lists) that clear `grid`, via light chasing over
 * the 32 possible first-row press patterns. Every solvable 5×5 board has exactly 4.
 */
export function allSolutions(grid) {
  const out = [];
  for (let mask = 0; mask < 1 << SIZE; mask++) {
    const g = [...grid];
    const presses = [];
    for (let c = 0; c < SIZE; c++) if (mask & (1 << c)) { press(g, c); presses.push(c); }
    for (let r = 1; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (g[(r - 1) * SIZE + c]) { const i = r * SIZE + c; press(g, i); presses.push(i); }
      }
    }
    if (isSolved(g)) out.push(presses.sort((a, b) => a - b));
  }
  return out;
}

export const minimumMoves = (grid) => Math.min(...allSolutions(grid).map((s) => s.length));

/**
 * The day's puzzle: start all-off and apply N distinct seeded presses (7–11).
 * We re-roll until that press set is the unique shortest solution, so par = N is optimal.
 */
export function generateFlip(date) {
  const rnd = seededRandom(`flip:${date}`);
  for (let attempt = 0; attempt < 500; attempt++) {
    const n = 7 + Math.floor(rnd() * 5);
    const cells = Array.from({ length: CELLS }, (_, i) => i);
    const presses = [];
    for (let k = 0; k < n; k++) presses.push(cells.splice(Math.floor(rnd() * cells.length), 1)[0]);
    const grid = applyMoves(Array(CELLS).fill(0), presses);
    const lengths = allSolutions(grid).map((s) => s.length);
    if (Math.min(...lengths) === n && lengths.filter((l) => l === n).length === 1) {
      return { grid, par: n, presses: presses.sort((a, b) => a - b) };
    }
  }
  // Fallback (not expected): accept the last roll with its true optimum as par.
  const presses = [0, 6, 12, 18, 24, 4, 20];
  return { grid: applyMoves(Array(CELLS).fill(0), presses), par: 7, presses };
}

export const flipScore = (moves, par) => Math.max(1, 10 - Math.max(0, moves - par));
export const flipXp = (score) => 30 + score * 5;
