// Pure arcade scoring rules (no DB). Arcade games run on the player's device, so the server
// only sanity-checks scores (caps per game) and decides XP + achievements.
import { HttpError } from '../util.js';

export const ARCADE_GAMES = {
  // score = runs in a 2-over innings (12 balls, max 6 per ball → 72)
  arcade_cricket: { max: 72, xp: (s) => Math.min(80, 15 + s), win: (s) => s >= 24 },
  // score = distance points; generous cap for long runs
  arcade_highway: { max: 50000, xp: (s) => Math.min(80, 10 + Math.round(s / 150)), win: (s) => s >= 3000 },
  // score = points for a timed round (coins 10/20, queen 50, combos)
  arcade_carrom: { max: 600, xp: (s) => Math.min(80, 10 + Math.round(s / 5)), win: (s) => s >= 120 },
  // score = relics ×150 + gems ×10 + time bonus (max 300) + no-damage bonus (200); adventure runs 5–15 min
  arcade_adventure: { max: 2500, xp: (s) => Math.min(120, 20 + Math.round(s / 20)), win: (s) => s >= 750 },
};

export function arcadeReward(game, score, data = {}) {
  const g = ARCADE_GAMES[game];
  if (!g) throw new HttpError(400, 'Unknown arcade game');
  if (!Number.isInteger(score) || score < 0 || score > g.max) throw new HttpError(400, 'Score out of range');
  const achievements = [];
  if (game === 'arcade_cricket') {
    if (Number(data.sixes) >= 3) achievements.push('six_machine');
    if (score >= 50) achievements.push('half_century');
  }
  if (game === 'arcade_highway') {
    if (score >= 10000) achievements.push('highway_hero');
    if (Number(data.nearMisses) >= 10) achievements.push('close_shave');
  }
  if (game === 'arcade_adventure') {
    if (Number(data.relics) >= 5) achievements.push('relic_hunter');
    if (data.flawless === true && Number(data.relics) >= 5) achievements.push('untouchable');
  }
  if (game === 'arcade_carrom') {
    if (data.queen === true) achievements.push('queen_covered');
    if (score >= 300) achievements.push('carrom_king');
  }
  return { xp: g.xp(score), won: g.win(score), achievements };
}
