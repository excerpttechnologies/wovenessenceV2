/* Deterministic question understanding.

   This module is the floor the assistant stands on. It turns an English
   question into a plan - a period, a channel, an optional category and one or
   more READ-ONLY tools - without any model in the loop.

   Why it exists alongside the AI provider:

     - The assistant must work, with real data, before an API key is ever
       configured. A missing key must not turn answers into "I cannot help".
     - The model is allowed to choose differently, but only within this same
       tool registry. When it is unavailable, times out or returns something
       invalid, the deterministic plan answers the question instead.
     - A model's tool choice is validated against the same plan structure, so
       there is one execution path rather than two.

   It is keyword scoring, not magic: a question this cannot place asks for a
   clarification instead of guessing at a domain.
   ========================================================================== */

import { defaultPeriod, detectPeriod, periodFromDates, withComparison } from './periods';
import { resolveChannel } from './scope';

export const SUGGESTED_QUESTIONS = [
  'What are our total sales today?',
  "Compare this month's sales with last month.",
  'Which products are selling the most?',
  'Which sarees are running low on stock?',
  'How many e-commerce orders were placed today?',
  'Compare sales across all four branches.',
  'Which sales channel generates the most revenue?',
  'Show our pending purchases and outstanding payments.',
  'Which products have high stock but low sales?',
  'How many website visitors converted into customers?',
];

export const QUESTION_TYPES = [
  'sales_summary', 'sales_by_branch', 'sales_by_channel', 'top_products',
  'inventory_summary', 'low_stock', 'product_performance', 'purchase_summary',
  'outstanding_balances', 'customer_analytics', 'ecommerce_orders',
  'website_analytics', 'business_report', 'help', 'clarify',
];

const TOOL_BY_TYPE = {
  sales_summary: 'getSalesSummary',
  sales_by_branch: 'getSalesByBranch',
  sales_by_channel: 'getSalesByChannel',
  top_products: 'getTopSellingProducts',
  inventory_summary: 'getInventorySummary',
  low_stock: 'getLowStockProducts',
  product_performance: 'getProductPerformance',
  purchase_summary: 'getPurchaseSummary',
  outstanding_balances: 'getOutstandingBalances',
  customer_analytics: 'getCustomerAnalytics',
  ecommerce_orders: 'getEcommerceOrderSummary',
  website_analytics: 'getWebsiteAnalytics',
  business_report: 'generateBusinessReport',
};

const PRODUCT_WORDS = [
  'saree', 'sarees', 'saree falls', 'fabric', 'fabrics', 'dupatta', 'dupattas',
  'lehenga', 'lehengas', 'suit', 'suits', 'readymade', 'kurti', 'kurtis',
  'blouse', 'blouses', 'dress', 'dresses', 'material', 'materials',
  'inskirt', 'pavada', 'border', 'borders',
];

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20,
};

function has(text, re) {
  return re.test(text);
}

function categoryHint(text) {
  const lower = text.toLowerCase();
  const hit = PRODUCT_WORDS.find((word) => new RegExp(`\\b${word}\\b`, 'i').test(lower));
  if (!hit) return '';
  return hit.replace(/s$/, '');
}

function limitOf(text) {
  const numeric = text.match(/\btop\s+(\d{1,2})\b/i);
  if (numeric) return Math.min(20, Math.max(1, Number(numeric[1])));
  const word = text.match(/\btop\s+([a-z]+)\b/i);
  if (word && NUMBER_WORDS[word[1].toLowerCase()]) return NUMBER_WORDS[word[1].toLowerCase()];
  return undefined;
}

function contextPeriod(context, today) {
  const raw = context?.period;
  if (!raw) return null;
  if (raw.start && raw.end) {
    try {
      const period = periodFromDates(String(raw.start), String(raw.end), { today });
      return withComparison(period, raw.comparisonKind || 'auto');
    } catch {
      return null;
    }
  }
  return null;
}

/* A follow-up is short and leans on what was already discussed. Long
   questions that merely start with "and" are treated as new questions. */
function isFollowUp(text) {
  const lower = text.toLowerCase().trim();
  if (!lower) return false;
  if (lower.split(/\s+/).length > 12) return false;
  return /^(and|also|now|then|what about|how about|same|only|show only|break|just)\b/.test(lower)
    || /\b(break (that|this|it) down|same period|that period|those|them|it)\b/.test(lower);
}

function clarificationReply() {
  return {
    questionType: 'clarify',
    tools: [],
    clarification: true,
  };
}

/* Classify one turn. `context` is what the client carried over from the last
   answer: its period, filters and question type. It is only ever used as a
   default - a period or filter named in this question always wins, and the
   server still validates it against the session scope. */
export function classify(question, { context = {}, today } = {}) {
  const text = String(question || '').trim();
  const lower = text.toLowerCase();
  const followUp = isFollowUp(text);
  const inheritedType = context?.questionType && TOOL_BY_TYPE[context.questionType]
    ? context.questionType
    : '';

  const detected = detectPeriod(text, { today });
  const period = detected
    || contextPeriod(context, today)
    || defaultPeriod({ today });

  const channel = resolveChannel(text);
  const category = categoryHint(text);
  const limit = limitOf(text);

  const baseFilters = {
    company: context?.filters?.companyId || '',
    branch: context?.filters?.branchId || '',
    channel,
  };

  const plan = (type, extra = {}) => ({
    questionType: type,
    tools: [{
      name: TOOL_BY_TYPE[type],
      args: {
        /* Explicit dates rather than the preset: the tool schema accepts a
           fixed enum of presets for the model, and an internally-derived
           preset such as "month" or "custom" is not in it. Dates are
           unambiguous and get the same period either way. */
        startDate: period.start,
        endDate: period.end,
        ...(extra.channel ? { channel: extra.channel } : {}),
        ...(category && extra.category !== false ? { category } : {}),
        ...(limit && extra.limit !== false ? { limit } : {}),
        ...(extra.args || {}),
      },
    }],
    period,
    category,
    limit,
    filters: baseFilters,
    followUp,
  });

  if (!text) return clarificationReply();

  /* ------------------------------------------------------------- help ---- */
  if (has(lower, /\b(what can you (do|answer)|who are you|help me|how do i use you|what do you know)\b/)) {
    return { questionType: 'help', tools: [], period, filters: baseFilters };
  }

  /* ------------------------------------------------------- website first -- */
  if (has(lower, /\b(visitor|visitors|traffic|page ?views?|sessions?|conversion|converted|bounce|funnel|website analytics|logged[- ]in|sign ?ups?|registrations?)\b/)) {
    return plan('website_analytics', { channel: 'website' });
  }

  if (has(lower, /\b(e-?commerce|ecom|online order|online orders|website order|website orders|storefront|pending order|pending orders|online sales order)\b/)) {
    return plan('ecommerce_orders', { channel: 'website' });
  }

  /* ------------------------------------------------ stock before sales ---- */
  if (has(lower, /\b(low stock|running low|run out|out of stock|reorder|re-order|restock|replenish|stock alert|stock alerts|shortage)\b/)) {
    return plan('low_stock', { category: true, limit: true });
  }

  if (has(lower, /\b(high stock|slow[- ]moving|slow moving|dead stock|not selling|product performance|which products (have|are) (high stock|not selling))\b/)) {
    return plan('product_performance', { args: { highStockOnly: true } });
  }

  /* ------------------------------------------------------- channel -------- */
  /* One named channel without the word "channel" is a filtered sales answer,
     not a channel comparison: "show sales from Instagram" asks for those
     bills, not for the split. */
  const namedChannel = /\binstagram\b|\binsta\b/.test(lower)
    ? 'instagram'
    : /\b(website|online)\b/.test(lower)
      ? 'website'
      : /\boffline\b/.test(lower)
        ? 'offline'
        : '';
  if (namedChannel
    && !/\bchannels?\b/.test(lower)
    && !/\b(compare|compared|versus|vs)\b/.test(lower)) {
    return plan('sales_summary', { channel: namedChannel });
  }

  if (has(lower, /\b(channel|channels|instagram|insta|website sales|online sales|offline sales|online vs offline|website vs offline|offline vs website)\b/)) {
    return plan('sales_by_channel', { channel: 'all' });
  }

  /* -------------------------------------------------------- branch -------- */
  if (has(lower, /\b(branch|branches|boutique|boutiques|store performance|which store|which branch)\b/)) {
    return plan('sales_by_branch');
  }

  /* ---------------------------------------------------- products ---------- */
  if (has(lower, /\b(top|best[- ]?sell|best[- ]?selling|most sold|most selling|popular|highest selling|which products are selling|which products sell)\b/)) {
    return plan('top_products', { limit: true, category: true });
  }

  /* --------------------------------------------------- outstanding -------- */
  if (has(lower, /\b(outstanding|dues?|owe|owed|payable|payables|receivable|receivables|pending payment|pending payments|unpaid|balance due)\b/)) {
    /* "pending purchases and outstanding payments" is two questions. Answer
       both rather than picking one and leaving half the question out. */
    const tools = [];
    if (has(lower, /\b(purchase|purchases|supplier|suppliers)\b/)) {
      tools.push({ name: 'getPurchaseSummary', args: { startDate: period.start, endDate: period.end } });
    }
    tools.push({ name: 'getOutstandingBalances', args: {} });
    return {
      questionType: 'outstanding_balances',
      tools,
      period,
      category,
      limit,
      filters: baseFilters,
      followUp,
    };
  }

  /* ------------------------------------------------------ purchases -------- */
  if (has(lower, /\b(purchase|purchases|purchasing|procurement|supplier|suppliers|goods receipt|grc)\b/)) {
    return plan('purchase_summary');
  }

  /* ------------------------------------------------------ customers -------- */
  if (has(lower, /\b(customer|customers|buyer|buyers|repeat|retention|loyal|new customer|new customers|average spend)\b/)) {
    return plan('customer_analytics');
  }

  /* ------------------------------------------------------ inventory -------- */
  if (has(lower, /\b(inventory|stock on hand|stock value|stock valuation|how much stock|total stock)\b/)) {
    return plan('inventory_summary', { category: true });
  }

  /* --------------------------------------------------------- report -------- */
  if (has(lower, /\b(report|business summary|business overview|overall summary|how is (the )?business|business performance|full summary)\b/)) {
    return plan('business_report');
  }

  /* ---------------------------------------------------------- sales -------- */
  if (has(lower, /\b(sales?|revenue|turnover|sold|sell|selling|income)\b/)
    || has(lower, /\b(compare|comparison|growth|declining|decline|increase|decrease|trend)\b/)) {
    return plan('sales_summary', { channel: channel !== 'all' ? channel : undefined });
  }

  /* A follow-up with no new domain keeps the previous one. */
  if (followUp && inheritedType) {
    if (has(lower, /\b(branch|branches)\b/)) return plan('sales_by_branch');
    if (has(lower, /\b(product|products|item|items)\b/)) return plan('top_products', { limit: true, category: true });
    if (has(lower, /\b(stock|inventory)\b/)) return plan('inventory_summary', { category: true });
    if (has(lower, /\b(online|website|instagram|channel|channels)\b/)) return plan('sales_by_channel', { channel: 'all' });
    if (inheritedType === 'outstanding_balances') return plan('outstanding_balances');
    return plan(inheritedType === 'customer_analytics' ? 'customer_analytics' : inheritedType);
  }

  return {
    ...clarificationReply(),
    period,
    filters: baseFilters,
    category,
    limit,
    followUp,
  };
}

/* Convert one validated AI tool call into a plan entry, using this turn's
   default period and filters for anything the model left out. */
export function planFromToolCall(call, { period, filters }) {
  return {
    name: call.name,
    args: {
      startDate: period.start,
      endDate: period.end,
      company: filters.companyId || undefined,
      branch: filters.branchId || undefined,
      ...call.args,
    },
  };
}

export function toolNameForType(type) {
  return TOOL_BY_TYPE[type] || 'getSalesSummary';
}

export function suggestionForQuestion(question) {
  const plan = classify(question);
  return plan.questionType;
}
