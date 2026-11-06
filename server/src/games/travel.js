// Pure travel scoring rules (no DB) — shared by the route and tests.
import { HttpError } from '../util.js';

export const TRAVEL_GAMES = ['travel_sky', 'travel_bingo', 'travel_predict', 'travel_quiz', 'travel_trip'];
export const TRIP_MILESTONES = [25, 50, 100, 250, 500, 1000];

export function travelReward(game, score, data = {}) {
  if (game === 'travel_trip') {
    if (!TRIP_MILESTONES.includes(score)) throw new HttpError(400, 'Unknown milestone');
    const achievements = [];
    if (score >= 100) achievements.push('road_warrior');
    if (score >= 500) achievements.push('globetrotter');
    return { xp: Math.min(120, 20 + Math.round(score / 5)), won: true, achievements };
  }
  if (!Number.isInteger(score) || score < 0 || score > 100) throw new HttpError(400, 'Score must be 0–100');
  const achievements = [];
  if (game === 'travel_sky' && score >= 80) achievements.push(data.target === 'moon' ? 'moon_finder' : 'sun_finder');
  if (game === 'travel_bingo') {
    if (Number(data.lines) >= 1) achievements.push('bingo_line');
    if (data.full === true) achievements.push('bingo_full');
  }
  if (game === 'travel_predict' && score >= 90) achievements.push('predictor_ace');
  if (game === 'travel_quiz' && score >= 80) achievements.push('geo_guru');
  return { xp: Math.min(60, 10 + Math.round(score / 2)), won: score >= 60, achievements };
}
