/**
 * Cozy Bee — Cloud Function callables.
 *
 * Two callables; both round-trip Gemini 2.5 Flash via REST so we can keep
 * GEMINI_API_KEY server-side.
 *
 *   botDistill(question)              → { intent: QueryIntent }
 *   botWrap(question, intent, result, lang) → { answer: string }
 *
 * The QueryIntent schema is enforced via Gemini's responseSchema, which is
 * what guarantees the LLM cannot invent fields — invalid output is rejected
 * by the API before it reaches us.
 */

import * as functions from 'firebase-functions';

// ─── Shared types (mirror of client-side types) ─────────────────────────────

const RELATIVE_HINTS = ['today', 'tomorrow', 'this_week', 'next_week', 'this_month'] as const;
const INTENTS = [
  'lookup_schedule',
  'find_free_room',
  'who_is_where',
  'count_events',
  'next_event',
  'who_teaches',
  'list_for_day',
  'check_conflicts',
  'unknown',
] as const;

interface DistillInput { question: string; }
interface WrapInput {
  question: string;
  intent: unknown;
  result: unknown;
  /** BCP-47 locale; only `en-US` and `he-IL` are supported in v1. */
  lang: string;
}

// ─── Rate limiting (per-uid, in-memory) ─────────────────────────────────────
// 30 calls per rolling hour per user. In-memory bucket is fine for v1 — we
// run as a single instance for low traffic, and worst-case a few extra calls
// slipping through during a cold-start race is not a billing emergency.

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT = 30;
const callTimestamps = new Map<string, number[]>();

function checkRateLimit(uid: string): void {
  const now = Date.now();
  const recent = (callTimestamps.get(uid) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      `Rate limit: ${RATE_LIMIT} questions per hour. Try again later.`,
    );
  }
  recent.push(now);
  callTimestamps.set(uid, recent);
}

// ─── Gemini REST client ─────────────────────────────────────────────────────

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

interface GeminiPart { text: string; }
interface GeminiContent { role?: string; parts: GeminiPart[]; }
interface GeminiBody {
  contents: GeminiContent[];
  systemInstruction?: GeminiContent;
  generationConfig?: {
    temperature?: number;
    responseMimeType?: string;
    responseSchema?: unknown;
  };
}

async function callGemini(body: GeminiBody): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'GEMINI_API_KEY is not configured on the Functions runtime.',
    );
  }
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new functions.https.HttpsError(
      'internal',
      `Gemini API error ${res.status}: ${errText.slice(0, 300)}`,
    );
  }
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') ?? '';
  if (!text) throw new functions.https.HttpsError('internal', 'Gemini returned no text.');
  return text;
}

// ─── Distill ────────────────────────────────────────────────────────────────

const DISTILL_SYSTEM_INSTRUCTION = `You are an intent parser for Cadenza, a music-school calendar app.
Your job: convert the user's natural-language question into a strict QueryIntent JSON object.
You never answer the question. You never invent entity IDs. You never write prose.

Rules:
- Choose exactly one intent from the enum.
- Names go in entityRefs as free text exactly as the user said them — the app resolves IDs.
- Use timeRange.relativeHint when the user uses words like "today", "tomorrow", "this week".
- timeRange.timeOfDay is HH:MM 24h ("4pm" → "16:00", "9:30am" → "09:30").
- filters.dayOfWeek: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat.
- If the user is asking you to change data (cancel, create, delete), return intent="unknown".
- If the question is too vague to map (e.g. "what about her?"), return intent="unknown".

Examples:
Q: "What does Sarah Cohen teach on Tuesday?"
→ {"intent":"lookup_schedule","entityRefs":{"teacherName":"Sarah Cohen"},"filters":{"dayOfWeek":[2]}}

Q: "Which rooms are free Friday at 4pm?"
→ {"intent":"find_free_room","entityRefs":{},"timeRange":{"relativeHint":"this_week","timeOfDay":"16:00"},"filters":{"dayOfWeek":[5]}}

Q: "Who's in Studio A right now?"
→ {"intent":"who_is_where","entityRefs":{"roomName":"Studio A"},"timeRange":{"relativeHint":"today"}}

Q: "How many lessons does David Levi have this week?"
→ {"intent":"count_events","entityRefs":{"teacherName":"David Levi"},"timeRange":{"relativeHint":"this_week"}}

Q: "When is David's next lesson?"
→ {"intent":"next_event","entityRefs":{"teacherName":"David"}}

Q: "Who teaches Piano?"
→ {"intent":"who_teaches","entityRefs":{"activityName":"Piano"}}

Q: "What's on the schedule tomorrow?"
→ {"intent":"list_for_day","entityRefs":{},"timeRange":{"relativeHint":"tomorrow"}}

Q: "Any double-bookings in Room B today?"
→ {"intent":"check_conflicts","entityRefs":{"roomName":"Room B"},"timeRange":{"relativeHint":"today"}}

Q: "What about her?"
→ {"intent":"unknown","entityRefs":{}}

Q: "Cancel all events tomorrow."
→ {"intent":"unknown","entityRefs":{}}`;

// Schema sent to Gemini's responseSchema. Mirrors types/botQuery.ts.QueryIntent.
const QUERY_INTENT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    intent: { type: 'STRING', enum: [...INTENTS] },
    entityRefs: {
      type: 'OBJECT',
      properties: {
        teacherName: { type: 'STRING' },
        studentName: { type: 'STRING' },
        roomName: { type: 'STRING' },
        activityName: { type: 'STRING' },
      },
    },
    timeRange: {
      type: 'OBJECT',
      properties: {
        start: { type: 'STRING' },
        end: { type: 'STRING' },
        relativeHint: { type: 'STRING', enum: [...RELATIVE_HINTS] },
        timeOfDay: { type: 'STRING' },
      },
    },
    filters: {
      type: 'OBJECT',
      properties: {
        status: { type: 'ARRAY', items: { type: 'STRING', enum: ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'ARCHIVED'] } },
        dayOfWeek: { type: 'ARRAY', items: { type: 'INTEGER' } },
      },
    },
  },
  required: ['intent', 'entityRefs'],
};

export const botDistill = functions
  .runWith({ secrets: ['GEMINI_API_KEY'] })
  .https.onCall(async (data: DistillInput, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated.');
    }
    checkRateLimit(context.auth.uid);

    const { question } = data || {};
    if (!question || typeof question !== 'string' || question.length > 500) {
      throw new functions.https.HttpsError('invalid-argument', 'question must be a non-empty string ≤500 chars.');
    }

    const text = await callGemini({
      systemInstruction: { parts: [{ text: DISTILL_SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text: question }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: QUERY_INTENT_SCHEMA,
      },
    });

    let intent: unknown;
    try {
      intent = JSON.parse(text);
    } catch {
      throw new functions.https.HttpsError('internal', 'Distill returned non-JSON output.');
    }
    return { intent };
  });

// ─── Wrap ───────────────────────────────────────────────────────────────────

const WRAP_SYSTEM_INSTRUCTION = `You are Cadenza's answering bot.
You receive: the user's question, the parsed QueryIntent, and a deterministic QueryResult from the app.
Write a 1–2 sentence natural answer.

Hard rules:
- Use ONLY facts present in the QueryResult. Never invent dates, names, rooms, or counts.
- Match the user's locale exactly (en-US → English; he-IL → Hebrew).
- If result.kind === "no_results", say so plainly.
- If result.kind === "name_not_found", apologise and name the missing entity type (teacher/room/student/activity) — do not guess.
- If result.kind === "unsupported", say "I can only answer questions, not make changes."
- If result.kind === "error", say "Something went wrong." Do not echo internal errors.
- For event_list, list up to 5 events with a time and a room/teacher if present. Beyond 5, summarise with a count.
- For room_availability, mention free rooms; if none are free, list a few that are busy.
- Do not repeat the question back. Do not add small talk.`;

export const botWrap = functions
  .runWith({ secrets: ['GEMINI_API_KEY'] })
  .https.onCall(async (data: WrapInput, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated.');
    }
    checkRateLimit(context.auth.uid);

    const { question, intent, result, lang } = data || ({} as WrapInput);
    if (!question || !intent || !result) {
      throw new functions.https.HttpsError('invalid-argument', 'question, intent, and result are required.');
    }
    const locale = lang === 'he-IL' ? 'he-IL' : 'en-US';

    const userMessage = [
      `Locale: ${locale}`,
      `Question: ${question}`,
      `Intent: ${JSON.stringify(intent)}`,
      `Result: ${JSON.stringify(result)}`,
      `Write the answer in ${locale === 'he-IL' ? 'Hebrew' : 'English'}.`,
    ].join('\n');

    const text = await callGemini({
      systemInstruction: { parts: [{ text: WRAP_SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: { temperature: 0.2 },
    });

    return { answer: text.trim() };
  });
