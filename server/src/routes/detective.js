// AI Detective — /api/detective
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { query } from '../db.js';
import { recordResult } from '../progress.js';
import { ah } from '../util.js';
import { createDetectiveAI } from '../detective/ai.js';
import { createDetectiveService } from '../detective/service.js';

export const detectiveService = createDetectiveService({ query, recordResult, ai: createDetectiveAI() });

export const detectiveRouter = Router();
detectiveRouter.use(requireAuth);

// Generating an AI case can take a while; keep one in flight per user.
const creating = new Set();

detectiveRouter.post('/new', ah(async (req, res) => {
  const uid = req.user.id;
  if (creating.has(uid)) return res.status(429).json({ error: 'A case is already being prepared' });
  creating.add(uid);
  try {
    res.json({ case: await detectiveService.newCase(uid) });
  } finally {
    creating.delete(uid);
  }
}));

detectiveRouter.get('/current', ah(async (req, res) => {
  res.json({ case: await detectiveService.current(req.user.id) });
}));

detectiveRouter.post('/:id/ask', ah(async (req, res) => {
  res.json(await detectiveService.ask(req.user.id, req.params.id, req.body || {}));
}));

detectiveRouter.post('/:id/accuse', ah(async (req, res) => {
  res.json(await detectiveService.accuse(req.user.id, req.params.id, req.body || {}));
}));
