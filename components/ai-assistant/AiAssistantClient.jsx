'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import AnswerView from './AnswerView';
import {
  clearAll, createConversation, loadHistory, newId, saveHistory,
} from './history';
import { conversationTitle, formatDateTime } from './formatters';

/* The assistant workspace: history, filters, conversation and composer.

   Two renderings share this component:

     variant="page"   the full /admin/ai-assistant screen, with the history
                      rail beside the chat.
     variant="panel"  the floating assistant, same state machine, no rail.

   Streaming is real: the API sends SSE status events while it works, then one
   `result` event. If streaming is unavailable the API answers with the same
   JSON payload, and this component handles both without a second code path.
   ========================================================================== */

const STAGE_LABELS = {
  received: 'Question received',
  authorising: 'Checking your data permissions',
  understanding: 'Understanding the question',
  planning: 'Selecting the business data to check',
  retrieving: 'Reading business data',
  writing: 'Writing the answer',
  composing: 'Preparing charts and figures',
};

const WELCOME = 'Welcome to Woven Essence AI Business Assistant. Ask questions about your sales, inventory, purchases, branches, customers, website orders, and business performance.';

function Spinner({ className = '' }) {
  return (
    <span
      className={'inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand/30 border-t-brand ' + className}
      aria-hidden="true"
    />
  );
}

function Icon({ name, size = 16 }) {
  const paths = {
    spark: ['M12 3l1.6 5.1L19 10l-5.4 1.9L12 17l-1.6-5.1L5 10l5.4-1.9z', 'M19 15l.7 2.1L22 18l-2.3.9L19 21l-.7-2.1L16 18l2.3-.9z'],
    plus: ['M12 5v14', 'M5 12h14'],
    close: ['M6 6l12 12', 'M18 6L6 18'],
    trash: ['M4 7h16', 'M9 7V5h6v2', 'M6 7l1 13h10l1-13', 'M10 11v6', 'M14 11v6'],
    expand: ['M4 9V4h5', 'M20 15v5h-5', 'M15 4h5v5', 'M9 20H4v-5'],
    collapse: ['M9 4v5H4', 'M15 20v-5h5', 'M20 9h-5V4', 'M4 15h5v5'],
    send: ['M4 12l16-8-6 16-2.5-6.5L4 12z'],
    history: ['M12 8v5l3 2', 'M3 12a9 9 0 1 0 3-6.7', 'M3 4v5h5'],
    menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  }[name] || [];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map((d, index) => <path key={index} d={d} />)}
    </svg>
  );
}

function FilterChip({ label, children }) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-inkmuted">{label}</span>
      {children}
    </label>
  );
}

const selectClass = 'h-8 min-w-0 max-w-[200px] truncate rounded-md border border-line bg-white px-2 text-[12px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20';

export default function AiAssistantClient({ variant = 'page', onClose = null }) {
  const compact = variant === 'panel';
  const [meta, setMeta] = useState(null);
  const [metaError, setMetaError] = useState('');
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [history, setHistory] = useState(() => ({ activeId: '', conversations: [] }));
  const [ready, setReady] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [filters, setFilters] = useState({ company: '', branch: '', channel: 'all' });
  const [stage, setStage] = useState('');
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState('');

  const abortRef = useRef(null);
  const endRef = useRef(null);
  const textareaRef = useRef(null);
  const saveTimer = useRef(null);

  const active = useMemo(
    () => history.conversations.find((conversation) => conversation.id === history.activeId)
      || history.conversations[0]
      || null,
    [history]
  );

  /* ------------------------------------------------------------ bootstrap -- */

  useEffect(() => {
    setHistory(loadHistory());
    setReady(true);
    return () => { abortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveHistory(history), 250);
    return () => clearTimeout(saveTimer.current);
  }, [history, ready]);

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    setMetaError('');
    try {
      const response = await fetch('/api/ai-assistant/meta', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load the assistant.');
      setMeta(data);
      setFilters((current) => ({ ...current, channel: current.channel || 'all' }));
    } catch (err) {
      setMetaError(err.message || 'Could not load the assistant.');
    } finally {
      setLoadingMeta(false);
    }
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [active?.turns?.length, busy, stage]);

  /* -------------------------------------------------------------- history -- */

  const updateActive = useCallback((updater) => {
    setHistory((current) => {
      const targetId = current.activeId || current.conversations[0]?.id;
      const conversations = current.conversations.map((conversation) => (
        conversation.id === targetId
          ? { ...updater(conversation), updatedAt: new Date().toISOString() }
          : conversation
      ));
      return { ...current, conversations };
    });
  }, []);

  const commitTurn = useCallback((turnId, patch) => {
    updateActive((conversation) => ({
      ...conversation,
      title: conversation.turns.length === 0 && patch.question
        ? conversationTitle(patch.question)
        : conversation.title,
      turns: conversation.turns.map((turn) => (turn.id === turnId ? { ...turn, ...patch } : turn)),
    }));
  }, [updateActive]);

  const startNewConversation = () => {
    abortRef.current?.abort();
    setBusy(false);
    setStage('');
    setBanner('');
    setHistory((current) => {
      const conversation = createConversation();
      return {
        activeId: conversation.id,
        conversations: trimConversations([conversation, ...current.conversations]),
      };
    });
    setInput('');
  };

  const clearConversation = () => {
    if (!active) return;
    if (active.turns.length) {
      const confirmed = window.confirm('Clear every message in this conversation?');
      if (!confirmed) return;
    }
    abortRef.current?.abort();
    setBusy(false);
    setStage('');
    setBanner('');
    updateActive((conversation) => ({ ...conversation, turns: [], title: 'New conversation' }));
  };

  const deleteConversation = (id) => {
    setHistory((current) => {
      const remaining = current.conversations.filter((conversation) => conversation.id !== id);
      if (!remaining.length) {
        const conversation = createConversation();
        return { activeId: conversation.id, conversations: [conversation] };
      }
      return {
        activeId: current.activeId === id ? remaining[0].id : current.activeId,
        conversations: remaining,
      };
    });
  };

  const selectConversation = (id) => {
    abortRef.current?.abort();
    setBusy(false);
    setStage('');
    setBanner('');
    setHistory((current) => ({ ...current, activeId: id }));
    setHistoryVisible(false);
  };

  const deleteAll = () => {
    if (!window.confirm('Delete every saved conversation from this browser?')) return;
    clearAll();
    const conversation = createConversation();
    setHistory({ activeId: conversation.id, conversations: [conversation] });
    setBanner('');
  };

  /* ----------------------------------------------------------------- ask --- */

  const lastAnswered = useMemo(() => {
    if (!active) return null;
    return [...active.turns].reverse().find((turn) => turn.answer) || null;
  }, [active]);

  const followUpContext = useCallback(() => {
    if (!lastAnswered?.answer?.metadata) return {};
    const period = lastAnswered.answer.metadata.period;
    return {
      questionType: lastAnswered.answer.questionType,
      period: period?.from && period?.to
        ? { start: period.from, end: period.to }
        : undefined,
      filters: lastAnswered.filters || filters,
    };
  }, [lastAnswered, filters]);

  const ask = useCallback(async (question, { retryTurnId = null } = {}) => {
    const text = String(question || '').trim();
    if (!text || busy) return;

    setBanner('');
    setBusy(true);
    setInput('');
    setStage('received');

    const turnId = retryTurnId || newId();
    const turn = {
      id: turnId,
      question: text,
      createdAt: new Date().toISOString(),
      filters: { ...filters },
      answer: null,
      error: '',
      pending: true,
    };

    if (retryTurnId) {
      commitTurn(turnId, { ...turn });
    } else {
      updateActive((conversation) => ({
        ...conversation,
        title: conversation.turns.length === 0 ? conversationTitle(text) : conversation.title,
        turns: [...conversation.turns, turn],
      }));
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const applyAnswer = (answer) => {
      commitTurn(turnId, { answer, error: '', pending: false });
      setBusy(false);
      setStage('');
    };
    const applyError = (message) => {
      commitTurn(turnId, { error: message, pending: false });
      setBusy(false);
      setStage('');
    };

    try {
      const response = await fetch('/api/ai-assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          question: text,
          stream: true,
          filters: {
            company: filters.company || undefined,
            branch: filters.branch || undefined,
            channel: filters.channel || 'all',
          },
          context: followUpContext(),
          history: (active?.turns || [])
            .filter((row) => row.answer || row.error)
            .slice(-6)
            .flatMap((row) => ([
              { role: 'user', content: row.question },
              { role: 'assistant', content: row.answer?.summary || row.error || '' },
            ])),
        }),
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') || '';

      if (!response.ok && !contentType.includes('text/event-stream')) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'The assistant could not answer that question.');
      }

      if (!contentType.includes('text/event-stream')) {
        const payload = await response.json();
        if (payload.error) throw new Error(payload.error);
        applyAnswer(payload);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('This browser could not read the assistant response.');
      const decoder = new TextDecoder();
      let buffer = '';
      let done = false;

      while (!done) {
        const read = await reader.read();
        if (read.done) break;
        buffer += decoder.decode(read.value, { stream: true });

        let separator = buffer.indexOf('\n\n');
        while (separator >= 0) {
          const frame = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);
          separator = buffer.indexOf('\n\n');

          let event = 'message';
          const dataLines = [];
          frame.split('\n').forEach((line) => {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
          });
          if (!dataLines.length) continue;
          let payload = {};
          try { payload = JSON.parse(dataLines.join('\n')); } catch { continue; }

          if (event === 'status') {
            setStage(payload.stage || 'retrieving');
          } else if (event === 'result') {
            applyAnswer(payload);
            done = true;
          } else if (event === 'error') {
            applyError(payload.error || 'The assistant could not answer that question.');
            done = true;
          }
        }
      }

      if (!done) {
        applyError('The connection closed before an answer arrived. Retry to ask again.');
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        applyError('Stopped.');
        return;
      }
      applyError(err.message || 'The assistant could not answer that question.');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [active, busy, commitTurn, filters, followUpContext, updateActive]);

  /* --------------------------------------------------------------- render -- */

  if (!ready) {
    return (
      <div className="flex h-64 items-center justify-center text-[13px] text-inkmuted">
        <Spinner className="mr-2" /> Opening the assistant...
      </div>
    );
  }

  const provider = meta?.provider || null;
  const companyOptions = meta?.scope?.companies || [];
  const branchOptions = (meta?.scope?.branches || []).filter((branch) => (
    !filters.company || branch.businessId === filters.company
  ));
  const channelOptions = meta?.scope?.channels || [
    { value: 'all', label: 'All channels' },
    { value: 'offline', label: 'Offline store' },
    { value: 'instagram', label: 'Instagram' },
    { value: 'website', label: 'E-commerce website' },
  ];

  const setFilter = (key, value) => {
    setFilters((current) => {
      if (key === 'company') {
        const stillValid = !value || (meta?.scope?.branches || []).some(
          (branch) => branch.businessId === value && branch.id === current.branch
        );
        return { ...current, company: value, branch: stillValid ? current.branch : '' };
      }
      return { ...current, [key]: value };
    });
  };

  const turns = active?.turns || [];
  const hasTurns = turns.length > 0;

  const historyRail = (
    <aside className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] font-bold uppercase tracking-wide text-inkmuted">History</p>
        <button
          type="button"
          onClick={startNewConversation}
          className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2 py-1 text-[11px] font-semibold text-cell hover:border-brand hover:text-brand"
        >
          <Icon name="plus" size={12} /> New
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {history.conversations.map((conversation) => {
          const selected = conversation.id === active?.id;
          return (
            <div
              key={conversation.id}
              className={
                'group flex items-start gap-1 rounded-lg border px-2 py-1.5 transition-colors '
                + (selected ? 'border-brand/30 bg-[#eff9f3]' : 'border-transparent hover:border-line hover:bg-white')
              }
            >
              <button
                type="button"
                onClick={() => selectConversation(conversation.id)}
                className="min-w-0 flex-1 text-left"
              >
                <p className={'truncate text-[12px] ' + (selected ? 'font-semibold text-ink' : 'text-cell')}>
                  {conversation.title || 'New conversation'}
                </p>
                <p className="text-[10px] text-inkmuted">
                  {conversation.turns.length} turn{conversation.turns.length === 1 ? '' : 's'} &middot; {formatDateTime(conversation.updatedAt)}
                </p>
              </button>
              <button
                type="button"
                aria-label="Delete conversation"
                onClick={() => deleteConversation(conversation.id)}
                className="mt-0.5 rounded p-1 text-inkmuted opacity-0 transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100"
              >
                <Icon name="trash" size={12} />
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={deleteAll}
        className="mt-1 rounded-md px-1 py-1 text-left text-[11px] text-inkmuted hover:text-danger"
      >
        Delete saved history
      </button>
    </aside>
  );

  return (
    <section className={compact ? 'flex h-full min-h-0 flex-col' : 'space-y-3'}>
      {/* --------------------------------------------------------- header -- */}
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className={compact ? 'text-[15px] font-bold text-ink' : 'text-[19px] font-bold tracking-tight text-ink'}>
            AI Business Assistant
          </h1>
          {provider?.configured && (
            <p className="mt-0.5 text-[11.5px] text-inkmuted">
              {`Grounded in ERP and storefront data · ${provider.provider} ${provider.model}`}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {compact ? (
            <>
              <button type="button" onClick={startNewConversation} title="New conversation" className="rounded-md border border-line bg-white p-1.5 text-cell hover:border-brand hover:text-brand">
                <Icon name="plus" size={14} />
              </button>
              <button type="button" onClick={clearConversation} title="Clear conversation" className="rounded-md border border-line bg-white p-1.5 text-cell hover:border-brand hover:text-brand">
                <Icon name="trash" size={14} />
              </button>
              <Link href="/admin/ai-assistant" className="rounded-md border border-line bg-white px-2 py-1 text-[11px] font-semibold text-cell hover:border-brand hover:text-brand">
                Open full
              </Link>
              {onClose && (
                <button type="button" onClick={onClose} aria-label="Close assistant" className="rounded-md border border-line bg-white p-1.5 text-cell hover:border-brand hover:text-brand">
                  <Icon name="close" size={14} />
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setHistoryVisible((value) => !value)}
                className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2 py-1.5 text-[11px] font-semibold text-cell hover:border-brand hover:text-brand lg:hidden"
              >
                <Icon name="history" size={13} /> History
              </button>
              <button type="button" onClick={startNewConversation} className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-cell hover:border-brand hover:text-brand">
                <Icon name="plus" size={13} /> New conversation
              </button>
              <button type="button" onClick={clearConversation} className="rounded-md border border-line bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-cell hover:border-brand hover:text-brand">
                Clear
              </button>
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                aria-label={expanded ? 'Collapse workspace' : 'Expand workspace'}
                className="rounded-md border border-line bg-white p-1.5 text-cell hover:border-brand hover:text-brand"
              >
                <Icon name={expanded ? 'collapse' : 'expand'} size={14} />
              </button>
            </>
          )}
        </div>
      </header>

      {(metaError || banner) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#f3c9c5] bg-[#fdf1f0] px-3 py-2 text-[12px] text-[#a12a22]">
          <span>{metaError || banner}</span>
          {metaError && (
            <button type="button" onClick={loadMeta} className="rounded border border-[#e3a7a1] px-2 py-0.5 text-[11px] font-semibold">
              Retry
            </button>
          )}
        </div>
      )}

      {/* --------------------------------------------------------- filters -- */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-white px-3 py-2">
        <FilterChip label="Company">
          <select
            className={selectClass}
            value={filters.company}
            onChange={(event) => setFilter('company', event.target.value)}
            aria-label="Company filter"
          >
            <option value="">All companies in scope</option>
            {companyOptions.map((company) => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
        </FilterChip>

        <FilterChip label="Branch">
          <select
            className={selectClass}
            value={filters.branch}
            onChange={(event) => setFilter('branch', event.target.value)}
            aria-label="Branch filter"
          >
            <option value="">All branches</option>
            {branchOptions.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {[branch.name, branch.city].filter(Boolean).join(' · ')}
              </option>
            ))}
          </select>
        </FilterChip>

        <FilterChip label="Channel">
          <select
            className={selectClass}
            value={filters.channel}
            onChange={(event) => setFilter('channel', event.target.value)}
            aria-label="Channel filter"
          >
            {channelOptions.map((channel) => (
              <option key={channel.value} value={channel.value}>{channel.label}</option>
            ))}
          </select>
        </FilterChip>

        <span className="ml-auto self-center text-[10.5px] text-inkmuted">
          {meta?.scope?.unrestricted
            ? 'Your account may see every branch.'
            : 'Restricted to the branches assigned to your account.'}
        </span>
      </div>

      {/* ---------------------------------------------------------- body ---- */}
      <div className={'grid min-h-0 gap-3 ' + (compact ? 'flex-1' : (expanded || historyVisible ? '' : 'lg:grid-cols-[220px_minmax(0,1fr)]'))}>
        {!compact && !expanded && (
          <div className={'min-h-0 rounded-xl border border-line bg-[#f7faf8] p-2 ' + (historyVisible ? 'block' : 'hidden lg:block')}>
            {historyRail}
          </div>
        )}

        <div className={'flex min-h-0 flex-col rounded-xl border border-line bg-[#fbfdfc] ' + (compact ? 'flex-1' : 'min-h-[520px]')}>
          <div
            className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3 sm:px-4"
            aria-live="polite"
          >
            {!hasTurns && (
              <div className="mx-auto max-w-3xl space-y-4 py-2">
                <div className="rounded-2xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(20,30,60,0.04)]">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e8f7ee] text-brand">
                      <Icon name="spark" size={15} />
                    </span>
                    <p className="text-[13px] font-bold text-ink">Woven Essence AI Business Assistant</p>
                  </div>
                  <p className="text-[12.5px] leading-relaxed text-cell">{WELCOME}</p>
                </div>

                <div>
                  <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-inkmuted">
                    Suggested questions
                  </p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {(meta?.suggestedQuestions || []).map((question) => (
                      <button
                        key={question}
                        type="button"
                        onClick={() => ask(question)}
                        disabled={busy || loadingMeta}
                        className="rounded-lg border border-line bg-white px-3 py-2 text-left text-[12px] text-cell transition-colors hover:border-brand hover:bg-[#f4fbf7] hover:text-ink disabled:opacity-60"
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {turns.map((turn) => (
              <div key={turn.id} className="space-y-2">
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-brand px-3 py-2 text-[13px] leading-snug text-white shadow-[0_1px_2px_rgba(20,30,60,0.12)]">
                    {turn.question}
                  </p>
                </div>

                <div className="flex justify-start">
                  <div className="w-full max-w-[95%] rounded-2xl rounded-bl-md border border-line bg-white px-3 py-3 shadow-[0_1px_2px_rgba(20,30,60,0.04)]">
                    {turn.pending && (
                      <div className="flex items-center gap-2 text-[12px] text-inkmuted">
                        <Spinner />
                        <span>{STAGE_LABELS[stage] || 'Working on it'}...</span>
                      </div>
                    )}

                    {turn.error && !turn.pending && (
                      <div className="space-y-2">
                        <p className="text-[12.5px] leading-snug text-[#a12a22]">{turn.error}</p>
                        <button
                          type="button"
                          onClick={() => ask(turn.question, { retryTurnId: turn.id })}
                          disabled={busy}
                          className="rounded-md border border-line bg-white px-2 py-1 text-[11px] font-semibold text-cell hover:border-brand hover:text-brand disabled:opacity-60"
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {turn.answer && !turn.pending && (
                      <AnswerView
                        answer={turn.answer}
                        compact={compact}
                        onAsk={busy ? null : ask}
                        onRetry={busy ? null : () => ask(turn.question, { retryTurnId: turn.id })}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}

            <div ref={endRef} />
          </div>

          {/* ------------------------------------------------------ composer */}
          <div className="border-t border-line bg-white px-2.5 py-2 sm:px-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value.slice(0, 1000))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    ask(input);
                  }
                }}
                rows={compact ? 1 : 2}
                placeholder="Ask about sales, stock, purchases, customers, branches or the website..."
                aria-label="Ask the business assistant"
                className="max-h-32 min-h-[38px] flex-1 resize-y rounded-lg border border-line bg-white px-3 py-2 text-[13px] text-ink outline-none placeholder:text-inkmuted/80 focus:border-brand focus:ring-2 focus:ring-brand/20"
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => ask(input)}
                disabled={busy || !input.trim()}
                className="btn btn-primary inline-flex h-[38px] shrink-0 items-center gap-1.5 px-3 disabled:opacity-60"
              >
                {busy ? <Spinner className="border-white/40 border-t-white" /> : <Icon name="send" size={15} />}
                {busy ? 'Working' : 'Ask'}
              </button>
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-1 px-0.5">
              <p className="text-[10.5px] text-inkmuted">
                Enter sends · Shift + Enter adds a line · answers cover the period shown in each result.
              </p>
              {input.length > 800 && <span className="text-[10.5px] text-inkmuted">{input.length}/1000</span>}
            </div>
          </div>
        </div>
      </div>

      {!compact && (
        <p className="px-1 text-[10.5px] leading-snug text-inkmuted">
          Every answer is computed from recorded transactions for the period and scope shown. Check critical figures
          against the linked ERP report before acting on them. The assistant is read-only: it cannot change a record.
        </p>
      )}
    </section>
  );
}

function trimConversations(conversations) {
  return conversations.slice(0, 12);
}
