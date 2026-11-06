// Client copy of the Flip toggle rule (mirrors server/src/games/flip.js). The server re-verifies.
export const SIZE = 5;
export function pressCell(grid, i) {
  const g = [...grid];
  const r = Math.floor(i / SIZE), c = i % SIZE;
  const flip = (j) => { g[j] ^= 1; };
  flip(i);
  if (r > 0) flip(i - SIZE);
  if (r < SIZE - 1) flip(i + SIZE);
  if (c > 0) flip(i - 1);
  if (c < SIZE - 1) flip(i + 1);
  return g;
}
export const replay = (grid, moves) => moves.reduce(pressCell, grid);
export const litCount = (grid) => grid.reduce((a, b) => a + b, 0);
