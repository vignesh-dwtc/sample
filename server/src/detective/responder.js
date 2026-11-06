// Keyword-driven roleplay for the built-in (classic) cases. Pure functions — no I/O.
//
// Each suspect in builtin.js has:
//   lines:   { greet, alibi, victim, saw, motive, accuse, suspicion }  → arrays of replies
//   about:   { <otherSuspectId>: [replies] }                         → opinions / testimony about others
//   topics:  [{ keys: [...], replies: [...] }]                        → specific probes (objects, places, secrets)
//   fallback: [replies]
// A question is matched to the best-scoring topic. Asking the same topic again walks through its
// replies in order (so pressing a suspect can unlock a deeper answer), then repeats the last one.

/** Generic topics every suspect understands. `w` = weight per matched key. */
const GENERIC = [
  { id: 'accuse', w: 2, keys: ['did you do it', 'did you kill', 'you killed', 'you did it', 'killer', 'culprit', 'guilty', 'confess', 'murderer', 'responsible', 'it was you', 'admit', 'are you lying', 'liar'] },
  { id: 'suspicion', w: 1.8, keys: ['who did', 'who do you think', 'who do you suspect', 'suspect', 'who could have', 'who might', 'who would', 'your theory', 'your guess'] },
  { id: 'motive', w: 1.5, keys: ['motive', 'why would', 'reason', 'money', 'angry', 'anger', 'argu', 'fight', 'quarrel', 'grudge', 'hate', 'enemy', 'enemies', 'benefit', 'gain', 'inherit', 'threat', 'upset', 'jealous', 'resent', 'rival', 'dispute', 'want him dead', 'want her dead', 'hurt'] },
  { id: 'alibi', w: 1, keys: ['where', 'alibi', 'whereabouts', 'doing', 'what time', 'when', 'tonight', 'last night', 'that night', 'the night', 'evening', 'between', 'during', 'all night', 'your movements', 'timeline'] },
  { id: 'saw', w: 1, keys: ['see', 'saw', 'seen', 'notice', 'hear', 'heard', 'witness', 'unusual', 'strange', 'odd', 'suspicious', 'anything', 'anyone', 'somebody', 'someone', 'happened'] },
  { id: 'victim', w: 1.2, keys: ['relationship', 'victim', 'get along', 'got along', 'think of', 'feel about', 'knew', 'know him', 'know her', 'close to', 'history', 'work for', 'work with', 'worked for', 'worked with', 'like him', 'like her'] },
  { id: 'greet', w: 0.5, keys: ['hello', 'hi', 'hey', 'good evening', 'good morning', 'greetings', 'how are you', 'introduce', 'who are you', 'tell me about yourself'] },
];

const REPEAT_LEADS = ['Like I told you: ', 'As I said: ', 'I’ll say it again: '];

export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9':\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const reCache = new Map();
/** Keys of ≥4 chars (or phrases) match as word prefixes ("argu" → "argued"); short keys match whole words. */
function keyRegex(key) {
  let re = reCache.get(key);
  if (!re) {
    const k = normalize(key);
    const exact = !k.includes(' ') && k.length < 4;
    re = new RegExp(`(?:^|[^a-z0-9'])${escapeRe(k)}${exact ? "(?![a-z0-9'])" : ''}`);
    reCache.set(key, re);
  }
  return re;
}

export function countMatches(norm, keys) {
  let n = 0;
  for (const k of keys) if (keyRegex(k).test(norm)) n++;
  return n;
}

/** Build the topic table for one suspect of a case (generic + about-others + specific topics). */
export function topicsFor(caseData, suspect) {
  const victimKeys = caseData.victimAliases || [];
  const list = [];
  (suspect.topics || []).forEach((t, i) => list.push({ id: `t${i}`, w: t.w || 3, keys: t.keys, replies: t.replies }));
  for (const other of caseData.suspects) {
    if (other.id === suspect.id) continue;
    const replies = suspect.about?.[other.id];
    if (replies?.length) list.push({ id: `about:${other.id}`, w: 2.5, keys: other.aliases || [other.name], replies });
  }
  for (const g of GENERIC) {
    const replies = suspect.lines?.[g.id];
    if (!replies?.length) continue;
    const keys = g.id === 'victim' ? [...g.keys, ...victimKeys] : g.keys;
    list.push({ id: g.id, w: g.w, keys, replies });
  }
  return list;
}

/** Pick the best topic for a question, or null. Ties go to the earlier (more specific) topic. */
export function matchTopic(topics, question) {
  const norm = normalize(question);
  let best = null;
  let bestScore = 0;
  for (const t of topics) {
    const n = countMatches(norm, t.keys);
    if (!n) continue;
    const score = n * t.w;
    if (score > bestScore) { best = t; bestScore = score; }
  }
  return best;
}

/**
 * Answer a question in character.
 * @param {object} caseData   full built-in case (from builtin.js)
 * @param {string} suspectId
 * @param {string} question
 * @param {Array<{role:string, content:string}>} transcript  previous exchange with this suspect
 * @returns {string}
 */
export function respond(caseData, suspectId, question, transcript = []) {
  const suspect = caseData.suspects.find((s) => s.id === suspectId);
  if (!suspect) throw new Error(`Unknown suspect ${suspectId}`);
  const topics = topicsFor(caseData, suspect);
  const topic = matchTopic(topics, question);
  const previous = transcript.filter((m) => m.role === 'user').map((m) => matchTopic(topics, m.content)?.id ?? null);
  const id = topic ? topic.id : null;
  const count = previous.filter((p) => p === id).length;
  const replies = topic ? topic.replies : suspect.fallback;
  if (!topic) return replies[count % replies.length];
  if (count < replies.length) return replies[count];
  return REPEAT_LEADS[(count - replies.length) % REPEAT_LEADS.length] + replies[replies.length - 1];
}
