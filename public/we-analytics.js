/* ==========================================================================
   Woven Essence — first-party website analytics tracker.

   Load it on the storefront with one tag, after the page is interactive:

     <script defer src="https://<erp-host>/we-analytics.js"></script>

   It records page views and session starts on its own, and exposes one global
   for the storefront code to call on the events only the site can know about:

     window.weTrack('product_view', { product: { id, itemCode, name } })
     window.weTrack('add_to_cart', { product: {...}, value: 185 })
     window.weTrack('login_success', { customerId })
     window.weTrack('purchase', { orderId: 'WE-TF0001-000021' })

   Design notes:
     - No cookies. A random id in localStorage identifies a browser, not a
       person; the dashboard says so.
     - The query string is never sent, so reset tokens and email parameters
       cannot reach the database.
     - `we_analytics_optout = '1'` in localStorage, or Global Privacy Control,
       silences the tracker completely.
     - A failed beacon is swallowed: analytics can never break checkout.
   ========================================================================== */
(function () {
  'use strict';

  var script = document.currentScript;
  var endpoint = (script && script.getAttribute('data-endpoint'))
    || ((script && script.src) ? script.src.replace(/\/we-analytics\.js.*$/, '') + '/api/website-analytics/collect'
      : '/api/website-analytics/collect');

  var EVENTS = {
    page_view: 1, session_start: 1, product_list_view: 1, product_view: 1, search: 1,
    login_success: 1, sign_up_success: 1, add_to_cart: 1, remove_from_cart: 1,
    view_cart: 1, begin_checkout: 1, add_shipping_info: 1, add_payment_info: 1,
    purchase: 1, refund: 1, logout: 1
  };
  var SESSION_IDLE_MS = 30 * 60 * 1000;
  var VISITOR_KEY = 'we_vid';
  var SESSION_KEY = 'we_sess';
  var SOURCE_KEY = 'we_src';

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
      return value;
    } catch (error) {
      return null;
    }
  }

  function randomId(prefix) {
    var bytes = new Uint8Array(12);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (var i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    var text = Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    return prefix + '_' + text;
  }

  function optedOut() {
    if (navigator.globalPrivacyControl === true) return true;
    return store('we_analytics_optout') === '1' || store('we_consent') === 'denied';
  }

  function visitorId() {
    var id = store(VISITOR_KEY);
    if (id && /^[A-Za-z0-9_-]{8,64}$/.test(id)) return id;
    id = randomId('v');
    store(VISITOR_KEY, id);
    return id;
  }

  function sessionId() {
    var now = Date.now();
    var raw = store(SESSION_KEY);
    var session = null;
    try { session = raw ? JSON.parse(raw) : null; } catch (error) { session = null; }
    if (session && session.id && now - Number(session.last || 0) < SESSION_IDLE_MS) {
      session.last = now;
      store(SESSION_KEY, JSON.stringify(session));
      return { id: session.id, started: false };
    }
    session = { id: randomId('s'), last: now };
    store(SESSION_KEY, JSON.stringify(session));
    return { id: session.id, started: true };
  }

  function classifySource() {
    var search = window.location.search || '';
    var params = {};
    search.replace(/^\?/, '').split('&').forEach(function (pair) {
      if (!pair) return;
      var parts = pair.split('=');
      try { params[decodeURIComponent(parts[0])] = decodeURIComponent(parts.slice(1).join('=') || ''); }
      catch (error) { /* malformed parameter: ignore it */ }
    });

    var utmSource = (params.utm_source || '').toLowerCase();
    var utmMedium = (params.utm_medium || '').toLowerCase();
    var campaign = params.utm_campaign || '';

    var source = 'direct';
    if (utmSource) {
      if (utmMedium === 'cpc' || utmMedium === 'paid' || utmMedium === 'ads' || utmMedium === 'ppc') source = 'paid';
      else if (utmSource.indexOf('instagram') >= 0) source = 'instagram';
      else if (utmSource.indexOf('facebook') >= 0 || utmSource.indexOf('meta') >= 0) source = 'facebook';
      else if (utmMedium === 'email' || utmSource.indexOf('newsletter') >= 0) source = 'email';
      else if (utmMedium === 'social') source = 'social';
      else if (utmMedium === 'organic') source = 'organic';
      else source = 'referral';
    } else if (document.referrer) {
      var referrer = document.referrer.toLowerCase();
      if (referrer.indexOf(window.location.host) >= 0) source = 'internal';
      else if (/(google|bing|yahoo|duckduckgo|ecosia)\./.test(referrer)) source = 'organic';
      else if (referrer.indexOf('instagram.') >= 0) source = 'instagram';
      else if (/(facebook|fb\.)/.test(referrer)) source = 'facebook';
      else if (/(mail|newsletter)/.test(referrer)) source = 'email';
      else if (/(t\.co|twitter|x\.com|linkedin|pinterest|youtube|whatsapp)/.test(referrer)) source = 'social';
      else source = 'referral';
    } else if (utmMedium) {
      source = 'referral';
    }

    if (source === 'internal') {
      var saved = store(SOURCE_KEY);
      if (saved) {
        try { return JSON.parse(saved); } catch (error) { /* fall through */ }
      }
      source = 'direct';
    }

    var attribution = {
      source: source,
      referrer: document.referrer ? String(document.referrer).slice(0, 300) : '',
      campaign: { source: utmSource, medium: utmMedium, name: campaign }
    };
    try { sessionStorage.setItem(SOURCE_KEY, JSON.stringify(attribution)); } catch (error) { /* ignore */ }
    store(SOURCE_KEY, JSON.stringify(attribution));
    return attribution;
  }

  function attributedSource() {
    var raw = store(SOURCE_KEY);
    if (raw) {
      try {
        var saved = JSON.parse(raw);
        if (saved && saved.source) return saved;
      } catch (error) { /* recompute below */ }
    }
    return classifySource();
  }

  function deviceType() {
    var ua = navigator.userAgent || '';
    if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
    if (/Mobi|Android|iPhone|iPod|Windows Phone/i.test(ua)) return 'mobile';
    if (/Macintosh|Windows|Linux|CrOS/i.test(ua)) return 'desktop';
    return 'unknown';
  }

  function pageTypeOf(path) {
    if (path === '/' || path === '') return 'home';
    if (/^\/(products?|collections?|shop|catalog|category|categories)/.test(path)) return 'catalog';
    if (/^\/product\//.test(path)) return 'product';
    if (/^\/(cart|basket)/.test(path)) return 'cart';
    if (/^\/(checkout|payment)/.test(path)) return 'checkout';
    if (/^\/(account|profile|orders|login|register|signup|sign-in|sign-up)/.test(path)) return 'account';
    return 'other';
  }

  function send(payload) {
    if (optedOut()) return;
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(endpoint, blob)) return;
      }
    } catch (error) { /* fall through to fetch */ }
    try {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
        credentials: 'omit'
      }).catch(function () { /* never surface analytics failures */ });
    } catch (error) { /* never surface analytics failures */ }
  }

  function track(name, props) {
    if (optedOut()) return;
    if (!EVENTS[name]) return;

    var details = props && typeof props === 'object' ? props : {};
    var session = sessionId();
    var source = attributedSource();
    var path = String(window.location.pathname || '/').slice(0, 512);

    send({
      event: name,
      ts: Date.now(),
      visitorId: visitorId(),
      sessionId: session.id,
      path: path,
      pageType: pageTypeOf(path),
      source: source.source || 'unknown',
      referrer: source.referrer || '',
      campaign: source.campaign || {},
      device: deviceType(),
      product: details.product || undefined,
      orderId: details.orderId || '',
      value: typeof details.value === 'number' ? details.value : undefined,
      customerId: details.customerId || '',
      consent: store('we_analytics_optout') === '1' ? 'denied' : 'granted'
    });

    if (name === 'page_view' && session.started) {
      send({
        event: 'session_start',
        ts: Date.now(),
        visitorId: visitorId(),
        sessionId: session.id,
        path: path,
        pageType: pageTypeOf(path),
        source: source.source || 'unknown',
        referrer: source.referrer || '',
        campaign: source.campaign || {},
        device: deviceType(),
        consent: 'granted'
      });
    }
  }

  window.weTrack = track;

  function pageView() {
    track('page_view');
  }

  if (document.readyState === 'complete') pageView();
  else window.addEventListener('load', pageView, { once: true });

  /* Single-page navigation: a route change is a page view, but the same
     session continues, which is what the session timeout is for. */
  ['pushState', 'replaceState'].forEach(function (method) {
    var original = window.history[method];
    if (typeof original !== 'function') return;
    window.history[method] = function () {
      var result = original.apply(window.history, arguments);
      pageView();
      return result;
    };
  });
  window.addEventListener('popstate', pageView);
}());
