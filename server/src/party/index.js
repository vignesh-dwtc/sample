// Party games over WebSocket: `/ws?token=<jwt>`.
// Transport glue only — all game rules live in engine.js.
import { WebSocketServer } from 'ws';
import { verifyToken, getUser as dbGetUser } from '../auth.js';
import { recordResult as dbRecordResult } from '../progress.js';
import { PartyHub } from './engine.js';

const OPEN = 1;

function reject(socket, status, text) {
  try {
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  } catch { /* ignore */ }
  socket.destroy();
}

/**
 * Attach the party WebSocket endpoint to an http.Server.
 * Options are injectable for tests.
 */
export function attachParty(server, {
  getUser = dbGetUser,
  recordResult = dbRecordResult,
  heartbeatMs = 25_000,
  sweepMs = 60_000,
  config,
  random,
  clock,
} = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });
  const hub = new PartyHub({
    send: (ws, msg) => { if (ws.readyState === OPEN) ws.send(JSON.stringify(msg)); },
    close: (ws, code, reason) => { try { ws.close(code, reason); } catch { /* ignore */ } },
    recordResult,
    config,
    random,
    clock,
  });

  server.on('upgrade', (req, socket, head) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return reject(socket, 400, 'Bad Request'); }
    if (url.pathname !== '/ws') return reject(socket, 404, 'Not Found');
    const userId = verifyToken(url.searchParams.get('token') || '');
    if (!userId) return reject(socket, 401, 'Unauthorized');
    socket.on('error', () => {});
    Promise.resolve(getUser(userId)).then((user) => {
      if (!user) return reject(socket, 401, 'Unauthorized');
      if (socket.destroyed) return;
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, user));
    }, (e) => {
      console.error('party auth failed', e);
      reject(socket, 500, 'Internal Server Error');
    });
  });

  wss.on('connection', (ws, _req, user) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('error', () => {});
    ws.on('close', () => hub.disconnect(ws));
    // Simple flood guard: at most 40 messages per second per socket.
    let windowStart = Date.now();
    let count = 0;
    ws.on('message', (data, isBinary) => {
      ws.isAlive = true;
      if (isBinary) return;
      const t = Date.now();
      if (t - windowStart >= 1000) { windowStart = t; count = 0; }
      if (++count > 40) return;
      // A throw here would escape the 'message' emitter and crash the whole server.
      try { hub.handle(ws, data.toString()); } catch (e) { console.error('party message failed', e); }
    });
    try {
      hub.connect(ws, { id: user.id, username: user.username, avatar: user.avatar });
    } catch (e) {
      console.error('party connect failed', e);
      ws.close(1011, 'error');
    }
  });

  // Heartbeat: terminate sockets that missed a ping/pong cycle so their seat
  // enters the reconnect grace window promptly.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* ignore */ }
    }
  }, heartbeatMs);
  const sweeper = setInterval(() => hub.sweep(), sweepMs);
  heartbeat.unref?.();
  sweeper.unref?.();

  const close = () => {
    clearInterval(heartbeat);
    clearInterval(sweeper);
    hub.shutdown();
    for (const ws of wss.clients) ws.terminate();
    wss.close();
  };
  server.on('close', close);

  return { wss, hub, close };
}
