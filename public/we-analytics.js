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

   It can also install the GA4 tag once, using the measurement ID published by
   the ERP at /api/website-analytics/config. The tag is only installed when the
   page has no existing gtag/GTM tag; if one exists, this script steps aside so
   the storefront's own container remains the single source of tracking.

   Design notes:
     - No cookies for the first-party feed. A random id in localStorage
       identifies a browser, not a person; the dashboard says so.
     - GA4 may set its own _ga cookies. It is loaded with analytics consent
       settings and advertising signals disabled.
     - The query string is never sent to the first-party endpoint, so reset
       tokens and email parameters cannot reach the database. GA4 page_view
       parameters use the pathname only.
     - `we_analytics_optout = '1'` in localStorage, or Global Privacy Control,
       silences both the first-party tracker and GA4.
     - A failed beacon or tag is swallowed: analytics can never break checkout.
   ========================================================================== */
(function () {
  'use strict';

  var script = document.currentScript;
  var endpoint = (script && script.getAttribute('data-endpoint'))
    || ((script && script.src) ? script.src.replace(/\/we-analytics\.js.*$/, '') + '/api/website-analytics/collect'
      : '/api/website-analytics/collect');
  var configEndpoint = (script && script.getAttribute('data-ga4-config'))
    || (endpoint.replace(/\/collect(?:\?.*)?$/, '/config'));
  var measurementOverride = (script && script.getAttribute('data-ga4-measurement-id')) || '';
  var allowLocalGa4 = Boolean(script && script.getAttribute('data-ga4-allow-local') === 'true');

  var ga4 = {
    ready: false,
    existing: false,
    queue: [],
    measurementId: '',
    lastPath: '',
    lastPathAt: 0
  };

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

  /* --------------------------------------------------------------- GA4 tag -- */

  function ga4MeasurementIdValid(id) {
    return /^G-[A-Z0-9]{4,}$/i.test(String(id || ''));
  }

  function ga4Queue(name, params) {
    if (optedOut()) return;
    var safe = { name: name, params: params || {} };
    if (ga4.existing) return;
    if (ga4.ready && typeof window.gtag === 'function') {
      window.gtag('event', safe.name, safe.params);
      return;
    }
    /* The config request and the first page view race each other. Hold a small
       number of events until the tag is ready; never grow without bound. */
    if (ga4.queue.length < 50) ga4.queue.push(safe);
  }

  function ga4Flush() {
    if (!ga4.ready || ga4.existing || typeof window.gtag !== 'function') return;
    var pending = ga4.queue.splice(0, ga4.queue.length);
    pending.forEach(function (entry) {
      try { window.gtag('event', entry.name, entry.params); } catch (error) { /* ignore */ }
    });
  }

  function setupGa4(measurementId, consentDefault) {
    if (optedOut() || ga4.ready || ga4.existing) return;
    if (!ga4MeasurementIdValid(measurementId)) return;
    if (window.__weGa4Installed) {
      /* Another copy of this script, or the site itself, already owns gtag. */
      ga4.existing = true;
      return;
    }

    var hasExisting = typeof window.gtag === 'function'
      || document.querySelector('script[src*="googletagmanager.com/gtag/js"]')
      || document.querySelector('script[src*="googletagmanager.com/gtm.js"]');
    if (hasExisting) {
      ga4.existing = true;
      window.__weGa4Installed = 'existing';
      return;
    }

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    var analyticsStorage = 'granted';
    if (consentDefault === 'denied' && store('we_consent') !== 'granted') analyticsStorage = 'denied';

    window.gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: analyticsStorage
    });
    window.gtag('js', new Date());
    window.gtag('config', measurementId, {
      send_page_view: false,
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });

    var tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
    tag.setAttribute('data-we-ga4', '1');
    (document.head || document.documentElement).appendChild(tag);

    window.__weGa4Installed = 'we-analytics';
    ga4.measurementId = measurementId;
    ga4.ready = true;
    ga4Flush();
  }

  function loadGa4Config() {
    if (optedOut()) return;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      if (!allowLocalGa4) return;
    }
    if (measurementOverride) {
      setupGa4(measurementOverride, 'granted');
      return;
    }
    try {
      fetch(configEndpoint, { credentials: 'omit', cache: 'no-store' })
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(function (config) {
          if (!config || !config.enabled || !config.measurementId) {
            ga4.queue.length = 0;
            return;
          }
          setupGa4(config.measurementId, config.consentDefault);
        })
        .catch(function () {
          /* GA4 is optional; clear the bounded queue and never affect the storefront. */
          ga4.queue.length = 0;
        });
    } catch (error) { /* ignore */ }
  }

  function ga4Items(details) {
    var source = details && Array.isArray(details.items) ? details.items : null;
    var products = source || (details && details.product ? [details.product] : []);
    return products.slice(0, 50).map(function (item) {
      if (!item || typeof item !== 'object') return null;
      var out = {};
      var id = String(item.id || item.item_id || item.itemCode || '').slice(0, 100);
      var name = String(item.name || item.item_name || item.itemCode || '').slice(0, 100);
      var category = String(item.category || item.item_category || '').slice(0, 100);
      if (id) out.item_id = id;
      if (name) out.item_name = name;
      if (category) out.item_category = category;
      var price = Number(item.price);
      if (Number.isFinite(price) && price >= 0) out.price = price;
      var quantity = Number(item.quantity);
      if (Number.isFinite(quantity) && quantity > 0) out.quantity = quantity;
      return Object.keys(out).length ? out : null;
    }).filter(Boolean);
  }

  function ga4Forward(name, details, path) {
    if (optedOut() || ga4.existing) return;
    var items = ga4Items(details);
    var params = {};

    if (name === 'page_view') {
      var now = Date.now();
      if (path === ga4.lastPath && now - ga4.lastPathAt < 1000) return;
      ga4.lastPath = path;
      ga4.lastPathAt = now;
      params = {
        page_location: window.location.origin + path,
        page_title: String(document.title || '').slice(0, 300),
        page_referrer: String(document.referrer || '').slice(0, 500)
      };
      ga4Queue('page_view', params);
      return;
    }

    if (name === 'product_list_view') {
      if (items.length) ga4Queue('view_item_list', { items: items });
      return;
    }
    if (name === 'product_view') {
      if (items.length) ga4Queue('view_item', { items: items });
      return;
    }
    if (name === 'search') {
      var term = String(details.query || details.term || '').slice(0, 100);
      ga4Queue('search', term ? { search_term: term } : {});
      return;
    }
    if (name === 'login_success') {
      ga4Queue('login', {});
      return;
    }
    if (name === 'sign_up_success') {
      ga4Queue('sign_up', {});
      return;
    }
    if (name === 'add_to_cart' || name === 'remove_from_cart' || name === 'view_cart'
      || name === 'begin_checkout' || name === 'add_shipping_info' || name === 'add_payment_info') {
      params = {};
      if (items.length) params.items = items;
      var cartValue = Number(details.value);
      if (Number.isFinite(cartValue) && cartValue >= 0) {
        params.value = cartValue;
        params.currency = 'INR';
      }
      ga4Queue(name, params);
      return;
    }
    if (name === 'purchase') {
      params = { currency: 'INR' };
      if (details.orderId) params.transaction_id = String(details.orderId).slice(0, 100);
      var purchaseValue = Number(details.value);
      if (Number.isFinite(purchaseValue) && purchaseValue >= 0) params.value = purchaseValue;
      if (items.length) params.items = items;
      ga4Queue('purchase', params);
      return;
    }
    if (name === 'refund') {
      params = {};
      if (details.orderId) params.transaction_id = String(details.orderId).slice(0, 100);
      var refundValue = Number(details.value);
      if (Number.isFinite(refundValue) && refundValue >= 0) {
        params.value = refundValue;
        params.currency = 'INR';
      }
      ga4Queue('refund', params);
    }
  }

  window.weGa4Track = function (name, params) {
    if (!name) return;
    ga4Queue(String(name).slice(0, 40), params && typeof params === 'object' ? params : {});
  };
  window.weGa4Consent = function (granted) {
    if (optedOut() && granted) return;
    try {
      if (typeof window.gtag === 'function') {
        window.gtag('consent', 'update', {
          analytics_storage: granted ? 'granted' : 'denied',
          ad_storage: 'denied',
          ad_user_data: 'denied',
          ad_personalization: 'denied'
        });
      }
    } catch (error) { /* ignore */ }
  };

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

    ga4Forward(name, details, path);

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

  loadGa4Config();

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
