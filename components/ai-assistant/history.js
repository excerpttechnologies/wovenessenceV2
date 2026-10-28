/* Conversation history for the AI assistant.

   Stored in the browser, not in MongoDB. Two reasons:

     - The assistant is read-only, and that includes not writing a chat log
       into the business database on every question.
     - A transcript contains customer names and figures the user asked about.
       Keeping it in this browser means it is visible to the same signed-in
       operator on the same device and to nobody else.

   The trade is honest: a different device, a different browser or clearing
   site data starts a fresh history. The answer itself remains reproducible
   because it is generated from live ERP data on request.

   Answers are trimmed before storage (fewer table rows, fewer chart points)
   so a long conversation cannot exhaust localStorage. If the quota is still
   hit, the oldest conversations are dropped and the write is retried once.
   ========================================================================== */

const KEY = 'we.ai-assistant.v1';
const MAX_CONVERSATIONS = 12;
const MAX_TURNS = 30;
const STORED_TABLE_ROWS = 25;
const STORED_CHART_POINTS = 14;

export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createConversation() {
  const now = new Date().toISOString();
  return {
    id: newId(),
    title: 'New conversation',
    createdAt: now,
    updatedAt: now,
    turns: [],
  };
}

export function emptyState() {
  const conversation = createConversation();
  return { activeId: conversation.id, conversations: [conversation] };
}

export function loadHistory() {
  if (typeof window === 'undefined') return emptyState();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    const conversations = Array.isArray(parsed?.conversations)
      ? parsed.conversations.filter((conversation) => conversation && conversation.id && Array.isArray(conversation.turns))
      : [];
    if (!conversations.length) return emptyState();
    const activeId = conversations.some((conversation) => conversation.id === parsed.activeId)
      ? parsed.activeId
      : conversations[0].id;
    return { activeId, conversations };
  } catch {
    return emptyState();
  }
}

function trimAnswer(answer) {
  if (!answer || typeof answer !== 'object') return answer;
  return {
    ...answer,
    tables: (answer.tables || []).map((table) => ({
      ...table,
      rows: (table.rows || []).slice(0, STORED_TABLE_ROWS),
    })),
    charts: (answer.charts || []).map((chart) => {
      if (chart.type === 'line') {
        return {
          ...chart,
          labels: (chart.labels || []).slice(0, STORED_CHART_POINTS),
          series: (chart.series || []).map((series) => ({
            ...series,
            points: (series.points || []).slice(0, STORED_CHART_POINTS),
          })),
        };
      }
      return { ...chart, data: (chart.data || []).slice(0, STORED_CHART_POINTS) };
    }),
    data: {},
  };
}

function serialise(state) {
  const conversations = [...state.conversations]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, MAX_CONVERSATIONS)
    .map((conversation) => ({
      ...conversation,
      turns: conversation.turns.slice(-MAX_TURNS).map((turn) => ({
        ...turn,
        answer: turn.answer ? trimAnswer(turn.answer) : null,
      })),
    }));
  return { activeId: state.activeId, conversations };
}

export function saveHistory(state) {
  if (typeof window === 'undefined') return;
  let payload = serialise(state);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(payload));
      return;
    } catch {
      if (payload.conversations.length <= 1) return;
      /* Drop the oldest conversation and try again once. */
      payload = {
        ...payload,
        conversations: payload.conversations.slice(0, Math.max(1, payload.conversations.length - 1)),
      };
      if (!payload.conversations.some((conversation) => conversation.id === payload.activeId)) {
        payload.activeId = payload.conversations[0].id;
      }
    }
  }
}

export function clearAll() {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(KEY); } catch { /* storage disabled */ }
}

export function mergeConversation(conversations, conversation) {
  const next = conversations.filter((row) => row.id !== conversation.id);
  next.unshift(conversation);
  return next;
}
