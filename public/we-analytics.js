/* Woven Essence website analytics tracker.

   Drop this on the storefront:

     <script defer src="https://erp.example.com/we-analytics.js"
             data-business="<business _id>"
             data-location="<companyLocation _id>"
             data-endpoint="https://erp.example.com/api/website-analytics/collect"></script>

   Consent is denied by default. Nothing is sent until the visitor grants it:
     - window.weAnalytics.consent('granted')
     - or localStorage.we_analytics_consent = 'granted' before this loads
     - or data-consent="implied" where another lawful basis applies

   Do Not Track and Global Privacy Control always win. The tracker does not
   use cookies, does not read form fields, and does not send a full URL - only
   the pathname. Query strings, referrer paths, email addresses, phone numbers
   and card numbers are stripped again on the server.

   Attribution is kept for the life of the 30-minute session in sessionStorage,
   so a visitor who lands from a campaign and then opens a product page is
   still counted against that campaign. Nothing is stored before consent. */

(function () {
  'use strict';

  var script = document.currentScript;
  if (!script || window.__weAnalyticsLoaded) return;
  window.__weAnalyticsLoaded = true;

  var VERSION = '1.0.0';
  var CONSENT_KEY = 'we_analytics_consent';
  var VISITOR_KEY = 'we_analytics_visitor';
  var SESSION_KEY = 'we_analytics_session';
  var SESSION_AT_KEY = 'we_analytics_session_at';
  var ATTR_KEY = 'we_analytics_attribution';
  var SESSION_IDLE_MS = 30 * 60 * 1000;
  var MAX_BODY = 12000;

  var attr = function (name) {
    return String(script.getAttribute('data-' + name) || '').trim();
  };

  var origin = '';
  try { origin = new URL(script.src, location.href).origin; } catch (err) { origin = location.origin; }

  var endpoint = attr('endpoint')
    || (window.WE_ANALYTICS_ENDPOINT || '')
    || origin + '/api/website-analytics/collect';
  var businessId = attr('business') || window.WE_ANALYTICS_BUSINESS || '';
  var locationId = attr('location') || window.WE_ANALYTICS_LOCATION || '';
  var siteHost = attr('site') || location.hostname;
  var consentMode = (attr('consent') || 'required').toLowerCase();

  function dntEnabled() {
    return navigator.doNotTrack === '1'
      || window.doNotTrack === '1'
      || navigator.msDoNotTrack === '1'
      || navigator.globalPrivacyControl === true;
  }

  function storedConsent() {
    try {
      var value = localStorage.getItem(CONSENT_KEY);
      return value === 'granted' || value === 'denied' ? value : '';
    } catch (err) { return ''; }
  }

  function consentState() {
    if (dntEnabled()) return 'denied';
    var explicit = window.__WE_ANALYTICS_CONSENT__;
    if (explicit === true || explicit === 'granted') return 'granted';
    if (explicit === false || explicit === 'denied') return 'denied';
    var stored = storedConsent();
    if (stored) return stored;
    return consentMode === 'implied' ? 'implied' : 'pending';
  }

  function hasConsent() {
    var state = consentState();
    return state === 'granted' || state === 'implied';
  }

  function randomId(prefix) {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return prefix + window.crypto.randomUUID();
      }
    } catch (err) { /* fall through */ }
    var random = '';
    try {
      var bytes = new Uint8Array(12);
      window.crypto.getRandomValues(bytes);
      for (var i = 0; i < bytes.length; i += 1) random += bytes[i].toString(16).padStart(2, '0');
    } catch (err) {
      random = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
    return prefix + Date.now().toString(36) + random;
  }

  function clearIds() {
    try {
      localStorage.removeItem(VISITOR_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_AT_KEY);
      sessionStorage.removeItem(ATTR_KEY);
    } catch (err) { /* storage unavailable */ }
  }

  function visitorId() {
    try {
      var existing = localStorage.getItem(VISITOR_KEY);
      if (existing) return existing;
      var id = randomId('v_');
      localStorage.setItem(VISITOR_KEY, id);
      return id;
    } catch (err) { return randomId('v_'); }
  }

  function sessionId() {
    var now = Date.now();
    try {
      var existing = sessionStorage.getItem(SESSION_KEY);
      var last = Number(sessionStorage.getItem(SESSION_AT_KEY) || 0);
      if (existing && now - last < SESSION_IDLE_MS) {
        sessionStorage.setItem(SESSION_AT_KEY, String(now));
        return existing;
      }
      var id = randomId('s_');
      sessionStorage.setItem(SESSION_KEY, id);
      sessionStorage.setItem(SESSION_AT_KEY, String(now));
      /* A new session starts with no inherited campaign. */
      sessionStorage.removeItem(ATTR_KEY);
      return id;
    } catch (err) { return randomId('s_'); }
  }

  function hostOf(value) {
    if (!value) return '';
    try {
      var url = new URL(value, location.href);
      return String(url.hostname || '').toLowerCase().replace(/^www\./, '');
    } catch (err) { return ''; }
  }

  function searchParams() {
    try { return new URLSearchParams(location.search); } catch (err) { return null; }
  }

  function utm() {
    var params = searchParams();
    var get = function (key) { return params ? String(params.get(key) || '').trim().slice(0, 120) : ''; };
    return {
      source: get('utm_source'),
      medium: get('utm_medium'),
      campaign: get('utm_campaign'),
    };
  }

  function ownHost() {
    var host = hostOf(siteHost);
    if (host) return host;
    return String(location.hostname || '').toLowerCase().replace(/^www\./, '');
  }

  function externalReferrer() {
    var host = hostOf(document.referrer);
    var own = ownHost();
    if (!host) return '';
    /* Internal navigation is not acquisition. */
    if (own && (host === own || host.slice(-(own.length + 1)) === '.' + own)) return '';
    return host;
  }

  function readAttribution() {
    try {
      var raw = sessionStorage.getItem(ATTR_KEY);
      if (!raw) return null;
      var saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return null;
      var text = function (value) { return String(value || '').slice(0, 120); };
      return {
        source: text(saved.source),
        medium: text(saved.medium),
        campaign: text(saved.campaign),
        referrerHost: text(saved.referrerHost),
      };
    } catch (err) { return null; }
  }

  function writeAttribution(touch) {
    try { sessionStorage.setItem(ATTR_KEY, JSON.stringify(touch)); } catch (err) { /* storage unavailable */ }
  }

  function attribution() {
    var source = utm();
    var touch = {
      source: source.source,
      medium: source.medium,
      campaign: source.campaign,
      referrerHost: externalReferrer(),
    };
    var hasTouch = Boolean(touch.source || touch.medium || touch.referrerHost);
    if (hasTouch) {
      writeAttribution(touch);
      return touch;
    }
    return readAttribution() || { source: '', medium: '', campaign: '', referrerHost: '' };
  }

  function byteLength(text) {
    try { return new Blob([text]).size; } catch (err) { return text.length; }
  }

  function base() {
    var touch = attribution();
    return {
      businessId: businessId || undefined,
      locationId: locationId || undefined,
      sessionId: sessionId(),
      visitorId: visitorId(),
      path: location.pathname || '/',
      title: String(document.title || '').slice(0, 160),
      referrerHost: touch.referrerHost || undefined,
      source: touch.source || undefined,
      medium: touch.medium || undefined,
      campaign: touch.campaign || undefined,
      consent: true,
      currency: 'INR',
      dnt: false,
    };
  }

  function trimPayload(payload) {
    var body;
    try { body = JSON.stringify(payload); } catch (err) { return null; }
    if (byteLength(body) <= MAX_BODY) return body;

    var reduced = {};
    Object.keys(payload).forEach(function (key) {
      if (key === 'metadata') return;
      if (key === 'title') { reduced.title = String(payload.title || '').slice(0, 80); return; }
      if (key === 'searchQuery') { reduced.searchQuery = String(payload.searchQuery || '').slice(0, 80); return; }
      reduced[key] = payload[key];
    });
    reduced.truncatedClient = true;

    try { body = JSON.stringify(reduced); } catch (err) { return null; }
    return byteLength(body) <= MAX_BODY ? body : null;
  }

  function post(body) {
    if (!body) return false;
    try {
      if (navigator.sendBeacon) {
        var beacon = new Blob([body], { type: 'text/plain;charset=UTF-8' });
        if (navigator.sendBeacon(endpoint, beacon)) return true;
      }
    } catch (err) { /* fall through to fetch */ }

    try {
      fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: body,
      }).catch(function () {});
      return true;
    } catch (err) { return false; }
  }

  function send(type, data) {
    if (!hasConsent()) return false;

    var payload = base();
    payload.type = type;
    payload.eventId = randomId('e_');
    payload.occurredAt = new Date().toISOString();

    if (data && typeof data === 'object') {
      Object.keys(data).forEach(function (key) {
        if (data[key] !== undefined) payload[key] = data[key];
      });
    }

    if (type === 'purchase' && !payload.orderId) return false;

    return post(trimPayload(payload));
  }

  var lastPath = '';

  function pageview() {
    var path = location.pathname || '/';
    if (path === lastPath) return false;
    lastPath = path;
    return send('pageview', {});
  }

  function track(type, data) {
    if (!type) return false;
    return send(String(type), data);
  }

  function purchase(order) {
    order = order || {};
    if (!order.orderId) return false;
    return send('purchase', {
      orderId: String(order.orderId),
      value: Number(order.value) || 0,
      currency: order.currency || 'INR',
      productId: order.productId || undefined,
      productName: order.productName || undefined,
      quantity: Number(order.quantity) || undefined,
      path: order.path || location.pathname,
    });
  }

  function search(term) {
    if (!term) return false;
    return send('search', { searchQuery: String(term), query: String(term) });
  }

  function product(data) {
    data = data || {};
    if (!data.productId && !data.productName) return false;
    return send('product_view', {
      productId: data.productId || undefined,
      productName: data.productName || undefined,
      value: Number(data.value) || undefined,
      path: data.path || location.pathname,
    });
  }

  function addToCart(data) {
    data = data || {};
    return send('add_to_cart', {
      productId: data.productId || undefined,
      productName: data.productName || undefined,
      value: Number(data.value) || 0,
      quantity: Number(data.quantity) || undefined,
      path: data.path || location.pathname,
    });
  }

  function checkout(data) {
    data = data || {};
    return send('checkout_start', {
      value: Number(data.value) || 0,
      currency: data.currency || 'INR',
      path: data.path || location.pathname,
    });
  }

  function consent(value) {
    var next = value === true || value === 'granted' ? 'granted'
      : value === false || value === 'denied' ? 'denied'
      : '';
    if (!next) return hasConsent();
    try { localStorage.setItem(CONSENT_KEY, next); } catch (err) { /* ignore */ }
    window.__WE_ANALYTICS_CONSENT__ = next === 'granted';
    if (next === 'denied') {
      clearIds();
      lastPath = '';
      return false;
    }
    lastPath = '';
    pageview();
    return true;
  }

  function onReady() {
    if (hasConsent()) pageview();

    var push = history.pushState;
    var replace = history.replaceState;

    history.pushState = function () {
      var result = push.apply(history, arguments);
      setTimeout(function () { if (hasConsent()) pageview(); }, 0);
      return result;
    };

    history.replaceState = function () {
      var result = replace.apply(history, arguments);
      setTimeout(function () { if (hasConsent()) pageview(); }, 0);
      return result;
    };

    window.addEventListener('popstate', function () {
      if (hasConsent()) pageview();
    });
  }

  window.weAnalytics = {
    version: VERSION,
    endpoint: endpoint,
    get state() { return consentState(); },
    get granted() { return hasConsent(); },
    consent: consent,
    pageview: function () { lastPath = ''; return pageview(); },
    track: track,
    product: product,
    addToCart: addToCart,
    checkout: checkout,
    purchase: purchase,
    search: search,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
  } else {
    onReady();
  }
}());
