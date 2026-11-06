// Party room engine — transport-agnostic and server-authoritative.
//
// The hub knows nothing about sockets: it receives opaque connection handles plus
// injected `send(conn, msg)` / `close(conn, code, reason)` functions, a clock, a
// random source and `recordResult`. That makes every rule testable with a fake clock.

import { realClock } from './clock.js';
import { QUESTIONS } from './questions.js';
import {
  makeCode, normalizeCode, pickQuestions, triviaPoints, reactionPoints, goDelay,
  standings, partyReward, FALSE_START_PENALTY,
} from './logic.js';

export const DEFAULT_CONFIG = {
  maxPlayers: 12,
  seatGraceMs: 30_000,        // reconnect window that keeps your seat and score
  idleMs: 30 * 60_000,        // rooms idle this long are closed
  startDelayMs: 3_000,        // "get ready" countdown before round 1
  triviaRounds: 8,
  questionMs: 12_000,
  revealMs: 4_000,
  reactionRounds: 5,
  goMinMs: 1_500,
  goMaxMs: 4_500,
  reactionWindowMs: 3_000,
  reactionPauseMs: 3_000,
};

const GAMES = {
  trivia: { result: 'party_trivia', rounds: (c) => c.triviaRounds },
  reaction: { result: 'party_reaction', rounds: (c) => c.reactionRounds },
};

export class PartyHub {
  /**
   * @param {object} o
   * @param {(conn:any, msg:object) => void} o.send
   * @param {(conn:any, code?:number, reason?:string) => void} [o.close]
   * @param {{now:()=>number, setTimeout:Function, clearTimeout:Function}} [o.clock]
   * @param {() => number} [o.random]
   * @param {(userId:string, r:object) => Promise<object>} [o.recordResult]
   * @param {Array} [o.questions]
   * @param {object} [o.config]
   * @param {(…args) => void} [o.log]
   */
  constructor({ send, close = () => {}, clock = realClock, random = Math.random, recordResult = async () => null,
    questions = QUESTIONS, config = {}, log = console.error } = {}) {
    this._send = send;
    this._close = close;
    this.clock = clock;
    this.random = random;
    this.recordResult = recordResult;
    this.questions = questions;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.log = log;
    this.rooms = new Map();     // code -> Room
    this.conns = new Map();     // conn -> user {id, username, avatar}
    this.userConn = new Map();  // userId -> conn (latest wins)
    this.userRoom = new Map();  // userId -> code
  }

  // ---- connection lifecycle -------------------------------------------------

  connect(conn, user) {
    const prev = this.userConn.get(user.id);
    if (prev && prev !== conn) {
      this.conns.delete(prev);
      this.send(prev, { type: 'error', code: 'replaced', message: 'You opened PlayNest Party in another tab.' });
      this._close(prev, 4001, 'replaced');
    }
    this.conns.set(conn, { id: user.id, username: user.username, avatar: user.avatar });
    this.userConn.set(user.id, conn);
    this.send(conn, { type: 'hello', userId: user.id, now: this.clock.now() });
    // A brand-new connection is not attached to a seat until it sends `join`.
    // If the previous socket held a seat, it stays reserved for the grace window.
    const room = this.roomOfUser(user.id);
    const p = room?.players.get(user.id);
    if (p && p.connected) room.markDisconnected(user.id);
  }

  disconnect(conn) {
    const user = this.conns.get(conn);
    this.conns.delete(conn);
    if (!user || this.userConn.get(user.id) !== conn) return;
    this.userConn.delete(user.id);
    this.roomOfUser(user.id)?.markDisconnected(user.id);
  }

  send(conn, msg) {
    if (!conn) return;
    try { this._send(conn, msg); } catch (e) { this.log('party send failed', e); }
  }

  sendToUser(userId, msg) { this.send(this.userConn.get(userId), msg); }

  roomOfUser(userId) {
    const code = this.userRoom.get(userId);
    return code ? this.rooms.get(code) : undefined;
  }

  // ---- inbound messages -----------------------------------------------------

  handle(conn, raw) {
    const user = this.conns.get(conn);
    if (!user) return;
    let msg = raw;
    if (typeof raw === 'string') {
      try { msg = JSON.parse(raw); } catch { return this.error(conn, 'Malformed message'); }
    }
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return this.error(conn, 'Malformed message');

    const room = this.roomOfUser(user.id);
    // Keep-alive pings are not activity: an open-but-abandoned tab must not keep a room alive forever.
    if (room && msg.type !== 'ping') room.touch();

    switch (msg.type) {
      case 'ping': return this.send(conn, { type: 'pong', now: this.clock.now() });
      case 'create': return this.create(conn, user, msg.game);
      case 'join': return this.join(conn, user, msg.code);
      case 'leave': return this.leave(conn, user);
      case 'start': return room ? room.start(user.id) : this.error(conn, 'You are not in a room');
      case 'again': return room ? room.again(user.id) : this.error(conn, 'You are not in a room');
      case 'answer': return room?.game?.answer?.(user.id, msg.choice);
      case 'tap': return room?.game?.tap?.(user.id);
      default: return this.error(conn, 'Unknown message type');
    }
  }

  error(conn, message) { this.send(conn, { type: 'error', message }); }

  create(conn, user, game) {
    // Own-property check: `toString`, `__proto__`, `constructor` etc. must not count as games.
    if (typeof game !== 'string' || !Object.hasOwn(GAMES, game)) return this.error(conn, 'Pick a game: trivia or reaction');
    this.leaveCurrent(user.id);
    let code;
    for (let i = 0; i < 1000 && (!code || this.rooms.has(code)); i++) code = makeCode(this.random);
    if (this.rooms.has(code)) return this.error(conn, 'No room codes available, try again');
    const room = new Room(this, code, game, user.id);
    this.rooms.set(code, room);
    room.addPlayer(user);
  }

  join(conn, user, rawCode) {
    const code = normalizeCode(rawCode);
    const room = code && this.rooms.get(code);
    if (!room) return this.send(conn, { type: 'error', code: 'not_found', message: 'Room not found. Check the code and try again.' });
    if (room.players.has(user.id)) return room.reattach(user);
    if (room.players.size >= this.config.maxPlayers) return this.send(conn, { type: 'error', code: 'full', message: 'That room is full (12 players max).' });
    this.leaveCurrent(user.id);
    room.addPlayer(user);
  }

  leave(conn, user) {
    this.leaveCurrent(user.id);
    this.send(conn, { type: 'left' });
  }

  leaveCurrent(userId) {
    this.roomOfUser(userId)?.removePlayer(userId);
  }

  /** Close rooms idle for longer than config.idleMs. Call periodically. */
  sweep() {
    const now = this.clock.now();
    for (const room of [...this.rooms.values()]) {
      if (now - room.lastActivity >= this.config.idleMs) room.close('Room closed after 30 minutes of inactivity.');
    }
  }

  /** Stop every room (server shutdown). */
  shutdown() {
    for (const room of [...this.rooms.values()]) room.close('Server restarting — please rejoin in a moment.');
  }
}

// ---------------------------------------------------------------------------

export class Room {
  constructor(hub, code, game, hostId) {
    this.hub = hub;
    this.code = code;
    this.gameName = game;
    this.hostId = hostId;
    this.phase = 'lobby';
    this.players = new Map(); // userId -> seat (insertion order = join order)
    this.round = 0;
    this.game = null;
    this.timers = new Set();
    this.lastActivity = hub.clock.now();
    this.finalStandings = null;
    this.closed = false;
  }

  get config() { return this.hub.config; }
  get now() { return this.hub.clock.now(); }
  get totalRounds() { return GAMES[this.gameName].rounds(this.config); }

  touch() { this.lastActivity = this.now; }

  schedule(fn, ms) {
    const h = this.hub.clock.setTimeout(() => {
      this.timers.delete(h);
      if (this.closed) return;
      try { fn(); } catch (e) { this.hub.log('party timer error', e); }
    }, ms);
    this.timers.add(h);
    return h;
  }

  cancel(h) {
    if (h == null) return;
    this.hub.clock.clearTimeout(h);
    this.timers.delete(h);
  }

  clearTimers() {
    for (const h of this.timers) this.hub.clock.clearTimeout(h);
    this.timers.clear();
  }

  // ---- membership ------------------------------------------------------------

  addPlayer(user) {
    this.players.set(user.id, {
      id: user.id, username: user.username, avatar: user.avatar, score: 0, connected: true, dropTimer: null,
    });
    this.hub.userRoom.set(user.id, this.code);
    this.touch();
    this.broadcastRoom();
    this.sendSnapshot(user.id);
  }

  reattach(user) {
    const p = this.players.get(user.id);
    this.cancel(p.dropTimer);
    p.dropTimer = null;
    p.connected = true;
    p.username = user.username;
    p.avatar = user.avatar;
    this.touch();
    this.broadcastRoom();
    this.sendSnapshot(user.id);
  }

  markDisconnected(userId) {
    const p = this.players.get(userId);
    if (!p || !p.connected) return;
    p.connected = false;
    this.cancel(p.dropTimer);
    p.dropTimer = this.schedule(() => this.removePlayer(userId), this.config.seatGraceMs);
    this.broadcastRoom();
    this.game?.playersChanged();
  }

  removePlayer(userId) {
    const p = this.players.get(userId);
    if (!p) return;
    this.cancel(p.dropTimer);
    this.players.delete(userId);
    if (this.hub.userRoom.get(userId) === this.code) this.hub.userRoom.delete(userId);
    if (this.players.size === 0) return this.destroy();
    if (this.hostId === userId) {
      const seats = [...this.players.values()];
      this.hostId = (seats.find((s) => s.connected) || seats[0]).id;
    }
    this.broadcastRoom();
    this.game?.playersChanged();
  }

  connectedIds() {
    return [...this.players.values()].filter((p) => p.connected).map((p) => p.id);
  }

  // ---- host actions -----------------------------------------------------------

  start(userId) {
    if (userId !== this.hostId) return this.hub.sendToUser(userId, { type: 'error', message: 'Only the host can start the game.' });
    if (this.phase !== 'lobby') return this.hub.sendToUser(userId, { type: 'error', message: 'The game has already started.' });
    if (this.connectedIds().length < 1) return this.hub.sendToUser(userId, { type: 'error', message: 'Need at least one player.' });
    for (const p of this.players.values()) p.score = 0;
    this.phase = 'playing';
    this.round = 0;
    this.finalStandings = null;
    this.game = this.gameName === 'trivia' ? new TriviaGame(this) : new ReactionGame(this);
    this.broadcastRoom();
    const endsAt = this.now + this.config.startDelayMs;
    this.countdown = { type: 'countdown', endsAt, now: this.now };
    this.broadcast(this.countdown);
    this.schedule(() => { this.countdown = null; this.game.nextRound(); }, this.config.startDelayMs);
  }

  again(userId) {
    if (userId !== this.hostId) return this.hub.sendToUser(userId, { type: 'error', message: 'Only the host can restart.' });
    if (this.phase !== 'results') return this.hub.sendToUser(userId, { type: 'error', message: 'The game is still running.' });
    this.resetToLobby();
  }

  resetToLobby() {
    // No game timers are pending in the results phase; seat grace timers keep running.
    for (const p of this.players.values()) p.score = 0;
    this.game = null;
    this.phase = 'lobby';
    this.round = 0;
    this.finalStandings = null;
    this.broadcastRoom();
  }

  // ---- game plumbing (used by game classes) ----------------------------------

  addScore(userId, pts) {
    const p = this.players.get(userId);
    if (p) p.score += pts;
  }

  finish() {
    this.phase = 'results';
    this.game = null;
    const list = standings([...this.players.values()]);
    this.finalStandings = list;
    this.broadcastRoom();
    this.broadcast({ type: 'final', standings: list });
    const resultGame = GAMES[this.gameName].result;
    for (const s of list) {
      const p = this.players.get(s.id);
      if (!p?.connected) continue;
      const reward = partyReward({ rank: s.rank, score: s.score, isHost: s.id === this.hostId });
      Promise.resolve()
        .then(() => this.hub.recordResult(s.id, {
          game: resultGame, score: s.score, won: reward.won, xp: reward.xp, achievements: reward.achievements,
          data: { room: this.code, rank: s.rank, players: list.length },
        }))
        .then((progress) => { if (progress) this.hub.sendToUser(s.id, { type: 'progress', progress }); })
        .catch((e) => this.hub.log('party recordResult failed', e));
    }
  }

  publicRoom() {
    return {
      code: this.code,
      game: this.gameName,
      hostId: this.hostId,
      phase: this.phase,
      players: [...this.players.values()].map(({ id, username, avatar, score, connected }) => ({ id, username, avatar, score, connected })),
      round: this.round,
      totalRounds: this.totalRounds,
    };
  }

  broadcast(msg) {
    for (const p of this.players.values()) if (p.connected) this.hub.sendToUser(p.id, msg);
  }

  broadcastRoom() { this.broadcast({ type: 'room', room: this.publicRoom() }); }

  /** Bring a (re)joining player up to date with the current game state. */
  sendSnapshot(userId) {
    if (this.phase === 'playing') {
      if (this.countdown) this.hub.sendToUser(userId, { ...this.countdown, now: this.now });
      this.game?.snapshot(userId);
    } else if (this.phase === 'results' && this.finalStandings) {
      this.hub.sendToUser(userId, { type: 'final', standings: this.finalStandings });
    }
  }

  close(message) {
    this.broadcast({ type: 'error', code: 'closed', message });
    this.broadcast({ type: 'left' });
    for (const id of this.players.keys()) if (this.hub.userRoom.get(id) === this.code) this.hub.userRoom.delete(id);
    this.players.clear();
    this.destroy();
  }

  destroy() {
    this.closed = true;
    this.clearTimers();
    this.game = null;
    if (this.hub.rooms.get(this.code) === this) this.hub.rooms.delete(this.code);
  }
}

// ---------------------------------------------------------------------------

class TriviaGame {
  constructor(room) {
    this.room = room;
    this.questions = pickQuestions(room.hub.questions, room.totalRounds, room.hub.random);
    this.state = 'idle'; // 'question' | 'reveal'
    this.q = null;
    this.answers = new Map(); // userId -> { choice, at }
    this.timer = null;
    this.lastReveal = null;
  }

  nextRound() {
    const room = this.room;
    if (room.round >= this.questions.length) return room.finish();
    room.round += 1;
    this.q = this.questions[room.round - 1];
    this.answers = new Map();
    this.state = 'question';
    this.startedAt = room.now;
    this.endsAt = this.startedAt + room.config.questionMs;
    this.lastReveal = null;
    room.touch();
    room.broadcastRoom();
    room.broadcast(this.questionMsg());
    this.timer = room.schedule(() => this.reveal(), room.config.questionMs);
  }

  questionMsg() {
    // Never includes the correct answer.
    return {
      type: 'question', round: this.room.round, totalRounds: this.room.totalRounds,
      category: this.q.category, text: this.q.text, choices: this.q.choices,
      endsAt: this.endsAt, duration: this.room.config.questionMs, now: this.room.now,
    };
  }

  answer(userId, choice) {
    const room = this.room;
    if (this.state !== 'question' || !room.players.has(userId)) return;
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) return;
    if (this.answers.has(userId)) return; // first answer is final
    const at = room.now;
    if (at > this.endsAt) return;
    this.answers.set(userId, { choice, at });
    room.hub.sendToUser(userId, { type: 'answered', round: room.round, choice });
    room.broadcast({ type: 'answeredCount', round: room.round, ids: [...this.answers.keys()] });
    this.playersChanged();
  }

  playersChanged() {
    if (this.state !== 'question') return;
    const live = this.room.connectedIds();
    if (live.length > 0 && live.every((id) => this.answers.has(id))) this.reveal();
  }

  reveal() {
    const room = this.room;
    if (this.state !== 'question') return;
    room.cancel(this.timer);
    this.state = 'reveal';
    const answers = {};
    const gained = {};
    for (const [id, a] of this.answers) {
      answers[id] = a.choice;
      const pts = triviaPoints(a.choice === this.q.correct, a.at, this.startedAt, room.config.questionMs);
      gained[id] = pts;
      room.addScore(id, pts);
    }
    for (const id of room.players.keys()) if (!(id in gained)) gained[id] = 0;
    this.lastReveal = { type: 'reveal', round: room.round, correct: this.q.correct, answers, gained };
    room.broadcast(this.lastReveal);
    room.broadcastRoom();
    this.timer = room.schedule(() => this.nextRound(), room.config.revealMs);
  }

  snapshot(userId) {
    const send = (m) => this.room.hub.sendToUser(userId, m);
    if (!this.q) return;
    send({ ...this.questionMsg(), now: this.room.now });
    const mine = this.answers.get(userId);
    if (mine && this.state === 'question') send({ type: 'answered', round: this.room.round, choice: mine.choice });
    if (this.state === 'question') send({ type: 'answeredCount', round: this.room.round, ids: [...this.answers.keys()] });
    if (this.state === 'reveal' && this.lastReveal) send(this.lastReveal);
  }
}

// ---------------------------------------------------------------------------

class ReactionGame {
  constructor(room) {
    this.room = room;
    this.state = 'idle'; // 'wait' | 'go' | 'ended'
    this.taps = new Map();     // userId -> ms after go
    this.falseStarts = new Set();
    this.goAt = null;
    this.timer = null;
    this.lastEnd = null;
  }

  nextRound() {
    const room = this.room;
    if (room.round >= room.totalRounds) return room.finish();
    room.round += 1;
    this.taps = new Map();
    this.falseStarts = new Set();
    this.goAt = null;
    this.lastEnd = null;
    this.state = 'wait';
    room.touch();
    room.broadcastRoom();
    room.broadcast({ type: 'wait', round: room.round, totalRounds: room.totalRounds, now: room.now });
    const delay = goDelay(room.hub.random, room.config.goMinMs, room.config.goMaxMs);
    this.timer = room.schedule(() => this.go(), delay);
  }

  go() {
    const room = this.room;
    if (this.state !== 'wait') return;
    this.state = 'go';
    this.goAt = room.now;
    room.broadcast({ type: 'go', round: room.round, at: this.goAt, now: room.now });
    this.timer = room.schedule(() => this.endRound(), room.config.reactionWindowMs);
  }

  tap(userId) {
    const room = this.room;
    if (!room.players.has(userId)) return;
    if (this.falseStarts.has(userId) || this.taps.has(userId)) return; // duplicates ignored
    if (this.state === 'wait') {
      this.falseStarts.add(userId);
      room.hub.sendToUser(userId, { type: 'tapped', round: room.round, falseStart: true, ms: null });
      this.playersChanged();
    } else if (this.state === 'go') {
      const ms = room.now - this.goAt;
      this.taps.set(userId, ms);
      room.hub.sendToUser(userId, { type: 'tapped', round: room.round, falseStart: false, ms, order: this.taps.size });
      this.playersChanged();
    }
  }

  playersChanged() {
    const live = this.room.connectedIds();
    const pending = live.filter((id) => !this.taps.has(id) && !this.falseStarts.has(id));
    if (this.state === 'wait' && live.length > 0 && pending.length === 0) this.endRound();
    else if (this.state === 'go' && pending.length === 0) this.endRound();
  }

  endRound() {
    const room = this.room;
    if (this.state !== 'wait' && this.state !== 'go') return;
    room.cancel(this.timer);
    this.state = 'ended';
    // Rank only players still seated, so someone who tapped and then left doesn't push others down.
    const order = [...this.taps.entries()].filter(([id]) => room.players.has(id)).sort((a, b) => a[1] - b[1]);
    const rank = new Map(order.map(([id], i) => [id, i]));
    const results = [...room.players.keys()].map((id) => {
      if (this.falseStarts.has(id)) return { id, ms: null, points: FALSE_START_PENALTY, falseStart: true };
      if (rank.has(id)) return { id, ms: this.taps.get(id), points: reactionPoints(rank.get(id)) };
      return { id, ms: null, points: 0 };
    });
    results.sort((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity) || b.points - a.points);
    for (const r of results) room.addScore(r.id, r.points);
    this.lastEnd = { type: 'roundEnd', round: room.round, results };
    room.broadcast(this.lastEnd);
    room.broadcastRoom();
    this.timer = room.schedule(() => this.nextRound(), room.config.reactionPauseMs);
  }

  snapshot(userId) {
    const room = this.room;
    const send = (m) => room.hub.sendToUser(userId, m);
    if (room.round === 0) return;
    if (this.state === 'wait' || this.state === 'go') {
      send({ type: 'wait', round: room.round, totalRounds: room.totalRounds, now: room.now });
      if (this.state === 'go') send({ type: 'go', round: room.round, at: this.goAt, now: room.now });
      if (this.falseStarts.has(userId)) send({ type: 'tapped', round: room.round, falseStart: true, ms: null });
      else if (this.taps.has(userId)) send({ type: 'tapped', round: room.round, falseStart: false, ms: this.taps.get(userId) });
    } else if (this.lastEnd) {
      send(this.lastEnd);
    }
  }
}
