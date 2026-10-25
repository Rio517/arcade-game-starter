/* Mockup shelf notes: a floating Notes button, annotate mode and numbered pins.
   Injected into every HTML page the shelf serves. All UI lives in one fixed overlay
   (shadow DOM), so it never moves the page's layout or picks up its styles. */
(function () {
  'use strict';

  // ---- selector building (also loaded by the tests with a fake DOM) ----
  function cssEscape(s) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
    return String(s).replace(/^\d/, function (d) { return '\\3' + d + ' '; }).replace(/[^A-Za-z0-9_-]/g, function (c) { return '\\' + c; });
  }
  var DATA_PREFER = ['data-testid', 'data-test', 'data-id', 'data-name', 'data-key', 'data-role', 'data-option', 'data-screen', 'data-section'];
  function dataAttr(el) {
    var attrs = el.attributes ? Array.prototype.slice.call(el.attributes) : [];
    var cands = attrs.filter(function (a) { return /^data-/.test(a.name) && a.value && a.value.length <= 60 && !/^data-(bs|browser-sync)/.test(a.name); });
    for (var i = 0; i < DATA_PREFER.length; i++) {
      var hit = cands.filter(function (a) { return a.name === DATA_PREFER[i]; })[0];
      if (hit) return hit;
    }
    return cands[0] || null;
  }
  function nthOfType(el) {
    var p = el.parentElement, n = 0, i = 0;
    if (!p) return '';
    for (var k = 0; k < p.children.length; k++) {
      if (p.children[k].tagName === el.tagName) { n++; if (p.children[k] === el) i = n; }
    }
    return ':nth-of-type(' + i + ')';
  }
  // A selector that finds this element again: an id, else a data attribute, else a tag:nth-of-type path.
  function buildSelector(el, doc) {
    var unique = function (sel) {
      if (!doc) return true;
      try { return doc.querySelectorAll(sel).length === 1; } catch (e) { return false; }
    };
    var parts = [];
    var cur = el;
    while (cur && cur.nodeType === 1) {
      var tag = cur.tagName.toLowerCase();
      if (tag === 'html') { parts.unshift('html'); break; }
      if (cur.id) {
        var idSel = '#' + cssEscape(cur.id);
        if (unique(idSel)) { parts.unshift(idSel); break; }
      }
      var da = dataAttr(cur);
      if (da) {
        var daSel = tag + '[' + da.name + '="' + da.value.replace(/["\\]/g, '\\$&') + '"]';
        if (unique(daSel)) { parts.unshift(daSel); break; }
      }
      parts.unshift(tag === 'body' ? 'body' : tag + nthOfType(cur));
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }
  function elementText(el) {
    return String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  }

  if (typeof module !== 'undefined' && module.exports) { module.exports = { buildSelector: buildSelector, elementText: elementText, cssEscape: cssEscape }; return; }
  if (window.__shelfNotes || window.top !== window) return;
  if (/[?&]__notes=off\b/.test(location.search)) return; // the crop capture asks for a clean page
  window.__shelfNotes = true;

  // ---- state ----
  var page = location.pathname;
  var notes = [];
  var annotating = false;
  var hoverEl = null;
  var lockedEl = null;       // element the open popover is about
  var openPin = null;        // note id whose detail card is open
  var flash = '';            // a short confirmation in the hint ("2 notes sent")
  var API = '/__notes';

  // ---- overlay ----
  var host = document.createElement('div');
  host.setAttribute('data-shelf-notes', '');
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML = [
    '<style>',
    ':host{all:initial}',
    '*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;font-size:13px;line-height:1.4;letter-spacing:0}',
    '.ui{pointer-events:auto}',
    '#bar{position:fixed;right:16px;bottom:16px;display:flex;gap:8px;align-items:center}',
    '#send{height:34px;padding:0 14px;border:1px solid #3b5bdb;border-radius:17px;background:#3b5bdb;color:#fff;box-shadow:0 2px 8px rgba(20,24,36,.16);cursor:pointer;font-weight:600}',
    '#send:hover{background:#334fc4}',
    '#send[hidden]{display:none}',
    '#btn{display:flex;align-items:center;gap:8px;height:34px;padding:0 12px;border:1px solid #d0d3d9;border-radius:17px;background:#fff;color:#1f2430;box-shadow:0 2px 8px rgba(20,24,36,.16);cursor:pointer;font-weight:500}',
    '#btn:hover{background:#f5f6f8}',
    '#btn.on{background:#3b5bdb;border-color:#3b5bdb;color:#fff}',
    '#count{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#e9ebf0;color:#394150;font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center}',
    '#btn.on #count{background:rgba(255,255,255,.25);color:#fff}',
    '#count.zero{opacity:.55}',
    '#hint{position:fixed;right:16px;bottom:58px;max-width:260px;padding:6px 10px;border-radius:8px;background:#1f2430;color:#fff;font-size:12px;display:none}',
    '#hint.show{display:block}',
    '#outline{position:fixed;display:none;border:2px solid #3b5bdb;background:rgba(59,91,219,.08);border-radius:2px;pointer-events:none}',
    '#outline.locked{background:rgba(59,91,219,.14)}',
    '.pin{position:fixed;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:#3b5bdb;color:#fff;border:2px solid #fff;box-shadow:0 1px 5px rgba(20,24,36,.35);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}',
    '.pin.done{background:#8a909c}',
    '.pin.draft{background:#fff;color:#3b5bdb;border:2px dashed #3b5bdb}',
    '.pin.lost{border-style:dashed;border-color:#ffd8a8}',
    '.card{position:fixed;width:300px;padding:12px;border:1px solid #d0d3d9;border-radius:10px;background:#fff;color:#1f2430;box-shadow:0 8px 28px rgba(20,24,36,.22)}',
    '.card h4{margin:0 0 6px;font-size:12px;font-weight:600;color:#5b6270}',
    '.card textarea{display:block;width:100%;height:92px;resize:vertical;padding:8px;border:1px solid #c5c9d2;border-radius:6px;background:#fff;color:#1f2430;outline:none}',
    '.card textarea:focus{border-color:#3b5bdb;box-shadow:0 0 0 2px rgba(59,91,219,.18)}',
    '.row{display:flex;align-items:center;gap:8px;margin-top:10px}',
    '.row .sp{flex:1;color:#7a808c;font-size:11px}',
    'button.b{height:28px;padding:0 12px;border-radius:6px;border:1px solid #c5c9d2;background:#fff;color:#1f2430;cursor:pointer;font-weight:500}',
    'button.b:hover{background:#f5f6f8}',
    'button.b.primary{background:#3b5bdb;border-color:#3b5bdb;color:#fff}',
    'button.b.primary:hover{background:#334fc4}',
    '.err{margin-top:6px;color:#c92a2a;font-size:12px}',
    '.body{white-space:pre-wrap;word-break:break-word;max-height:180px;overflow:auto}',
    '.el{margin:0 0 8px;padding:5px 8px;border-radius:6px;background:#f1f3f6;color:#5b6270;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.reply{margin-top:8px;padding:6px 8px;border-left:3px solid #3b5bdb;background:#eef1fd;white-space:pre-wrap;word-break:break-word}',
    '.tag{display:inline-block;padding:0 6px;border-radius:8px;background:#e9ebf0;font-size:11px;font-weight:600;margin-left:6px}',
    '.tag.open{background:#dbe4ff;color:#364fc7}.tag.done{background:#d3f9d8;color:#2b8a3e}.tag.draft{background:#fff3bf;color:#8a6d00}',
    '@media (prefers-color-scheme:dark){#btn,.card{background:#242832;color:#e8eaf0;border-color:#3b404d}#btn:hover,button.b:hover{background:#2e3340}#count{background:#3b404d;color:#e8eaf0}.card textarea{background:#1b1e26;color:#e8eaf0;border-color:#464c5a}button.b{background:#242832;color:#e8eaf0;border-color:#464c5a}.el{background:#1b1e26;color:#a9afbd}.reply{background:#232a45}.card h4{color:#a9afbd}}',
    '</style>',
    '<div id="outline"></div>',
    '<div id="pins"></div>',
    '<div id="cardbox"></div>',
    '<div id="hint" class="ui"></div>',
    '<div id="bar" class="ui"><button id="send" type="button" hidden title="Send your drafts to the session"></button>' +
    '<button id="btn" type="button" title="Notes (Alt+N)"><span>Notes</span><span id="count" class="zero">0</span></button></div>'
  ].join('');
  var $ = function (id) { return root.getElementById ? root.getElementById(id) : root.querySelector('#' + id); };
  var btn = $('btn'), sendBtn = $('send'), countEl = $('count'), outline = $('outline'), pinsEl = $('pins'), cardbox = $('cardbox'), hint = $('hint');

  function mount() {
    if (!host.isConnected) (document.body || document.documentElement).appendChild(host);
  }

  // ---- api ----
  function api(method, url, body) {
    return fetch(url, { method: method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); });
  }
  function load() {
    return api('GET', API + '?page=' + encodeURIComponent(page)).then(function (j) { notes = j.notes || []; render(); }).catch(function () { render(); });
  }

  // ---- the note being written, kept in the browser so a live reload mid-write loses nothing ----
  var DRAFT_KEY = 'shelf-notes-writing:' + page;
  function keepWriting(selector, text) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ selector: selector, text: text })); } catch (e) {} }
  function dropWriting() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} }
  function readWriting() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { return null; } }

  // ---- helpers ----
  function isOurs(e) { var p = e.composedPath ? e.composedPath() : [e.target]; return p.indexOf(host) >= 0; }
  function findEl(n) {
    try { var el = document.querySelector(n.selector); return el && el !== host ? el : null; } catch (e) { return null; }
  }
  function rectOf(el) { var r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
  function openCount() { return notes.filter(function (n) { return n.status !== 'done'; }).length; }
  function draftCount() { return notes.filter(function (n) { return n.status === 'draft'; }).length; }
  function stateOf(n) { return n.status === 'done' ? 'done' : n.status === 'draft' ? 'draft' : 'open'; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ---- render ----
  function render() {
    mount();
    countEl.textContent = String(openCount());
    countEl.className = openCount() ? '' : 'zero';
    btn.classList.toggle('on', annotating);
    var d = draftCount();
    sendBtn.hidden = !d;
    sendBtn.textContent = d === 1 ? 'Send 1 note' : 'Send ' + d + ' notes';
    hint.textContent = flash || (annotating ? 'Annotate: click an element. Esc or Alt+N to stop.' : '');
    hint.classList.toggle('show', !!flash || (annotating && !lockedEl));
    pinsEl.innerHTML = '';
    notes.forEach(function (n, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pin ui ' + stateOf(n);
      b.textContent = n.status === 'done' ? '\u2713' : String(i + 1);
      b.title = 'Note ' + (i + 1) + ' (' + stateOf(n) + ')';
      b.setAttribute('data-id', String(n.id));
      b.addEventListener('click', function (ev) { ev.stopPropagation(); showNote(n.id); });
      pinsEl.appendChild(b);
    });
    placePins();
    if (openPin) showNote(openPin, true);
  }
  function pinPos(n) {
    var el = findEl(n);
    if (el) { var r = el.getBoundingClientRect(); return { x: r.left + Math.min(r.width, 14), y: r.top, found: true }; }
    var s = n.scroll || { x: 0, y: 0 }, r0 = n.rect || { x: 0, y: 0 };
    return { x: r0.x + s.x - window.scrollX + 10, y: r0.y + s.y - window.scrollY, found: false };
  }
  function placePins() {
    var kids = pinsEl.children;
    for (var i = 0; i < kids.length; i++) {
      var n = notes[i];
      var p = pinPos(n);
      kids[i].style.left = Math.round(p.x) + 'px';
      kids[i].style.top = Math.round(p.y) + 'px';
      kids[i].classList.toggle('lost', !p.found);
      if (!p.found) kids[i].title += ' - element not found, shown at its saved position';
    }
    if (hoverEl || lockedEl) drawOutline(lockedEl || hoverEl, !!lockedEl);
  }
  function drawOutline(el, locked) {
    if (!el || !el.isConnected) { outline.style.display = 'none'; return; }
    var r = el.getBoundingClientRect();
    outline.style.cssText = 'display:block;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
    outline.className = locked ? 'locked' : '';
  }
  function placeCard(card, r) {
    var w = 300, h = card.offsetHeight || 180, vw = window.innerWidth, vh = window.innerHeight;
    var left = Math.max(8, Math.min(vw - w - 8, r.left));
    var top = r.bottom + 8;
    if (top + h > vh - 8) top = r.top - h - 8;
    if (top < 8) top = Math.max(8, Math.min(vh - h - 8, r.top + 8));
    card.style.left = left + 'px';
    card.style.top = top + 'px';
  }
  function closeCard() { cardbox.innerHTML = ''; lockedEl = null; openPin = null; outline.style.display = 'none'; hoverEl = null; render(); }

  // ---- popover to write a note ----
  function openEditor(el, startText) {
    lockedEl = el;
    openPin = null;
    drawOutline(el, true);
    cardbox.innerHTML = '';
    var card = document.createElement('div');
    card.className = 'card ui';
    card.innerHTML = '<h4>Note on <code>' + esc(el.tagName.toLowerCase()) + '</code></h4><div class="el">' + esc(elementText(el) || buildSelector(el, document)) + '</div>' +
      '<textarea placeholder="What should change here?"></textarea><div class="err" hidden></div>' +
      '<div class="row"><span class="sp">\u2318\u21A9 save as draft \u00B7 Esc cancel</span><button class="b" data-a="cancel" type="button">Cancel</button><button class="b primary" data-a="save" type="button">Save</button></div>';
    cardbox.appendChild(card);
    placeCard(card, el.getBoundingClientRect());
    var ta = card.querySelector('textarea');
    var err = card.querySelector('.err');
    var sel = buildSelector(el, document);
    if (startText) ta.value = startText;
    ta.addEventListener('input', function () { keepWriting(sel, ta.value); });
    var saving = false;
    function save() {
      var text = ta.value.trim();
      if (!text || saving) return;
      saving = true;
      var rect = rectOf(el);
      api('POST', API, {
        page: page, selector: buildSelector(el, document), text: elementText(el), note: text,
        viewport: { w: window.innerWidth, h: window.innerHeight }, rect: rect, scroll: { x: window.scrollX, y: window.scrollY }
      }).then(function (j) { notes.push(j.note); dropWriting(); closeCard(); }).catch(function (e) { saving = false; err.hidden = false; err.textContent = 'Not saved: ' + e.message; });
    }
    card.querySelector('[data-a=cancel]').addEventListener('click', function () { dropWriting(); closeCard(); });
    card.querySelector('[data-a=save]').addEventListener('click', save);
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
    });
    hint.classList.remove('show');
    ta.focus();
    setTimeout(function () { ta.focus(); }, 0);
  }

  // ---- card to read a note ----
  function showNote(id, keepPosition) {
    var i = notes.findIndex(function (n) { return n.id === id; });
    if (i < 0) return;
    var n = notes[i];
    var st = stateOf(n);
    openPin = id;
    lockedEl = null;
    cardbox.innerHTML = '';
    var card = document.createElement('div');
    card.className = 'card ui';
    card.innerHTML = '<h4>Note ' + (i + 1) + '<span class="tag ' + st + '">' + st + '</span></h4>' +
      (n.text ? '<div class="el">' + esc(n.text) + '</div>' : '') +
      '<div class="body">' + esc(n.note) + '</div>' +
      (n.reply ? '<div class="reply"><b>Reply</b><br>' + esc(n.reply) + '</div>' : '') +
      (st === 'draft'
        ? '<div class="row"><span class="sp">Sent with the others</span><button class="b" data-a="close" type="button">Close</button><button class="b" data-a="discard" type="button">Discard</button></div>'
        : '<div class="row"><span class="sp"></span><button class="b" data-a="close" type="button">Close</button><button class="b primary" data-a="toggle" type="button">' + (st === 'done' ? 'Reopen' : 'Mark done') + '</button></div>');
    cardbox.appendChild(card);
    var pin = pinsEl.children[i];
    var pr = pin ? pin.getBoundingClientRect() : { left: 20, top: 20, bottom: 40 };
    placeCard(card, { left: pr.left - 10, top: pr.top, bottom: pr.bottom });
    card.querySelector('[data-a=close]').addEventListener('click', function () { cardbox.innerHTML = ''; openPin = null; });
    if (st === 'draft') {
      card.querySelector('[data-a=discard]').addEventListener('click', function () {
        api('POST', API + '/' + n.id, { discard: true }).then(function () { notes.splice(i, 1); cardbox.innerHTML = ''; openPin = null; render(); });
      });
      return;
    }
    card.querySelector('[data-a=toggle]').addEventListener('click', function () {
      api('POST', API + '/' + n.id, { status: st === 'done' ? 'open' : 'done' }).then(function (j) { notes[i] = j.note; render(); });
    });
  }

  // ---- annotate mode ----
  function setAnnotating(on) {
    annotating = on;
    if (!on) { lockedEl = null; hoverEl = null; outline.style.display = 'none'; cardbox.innerHTML = openPin ? cardbox.innerHTML : ''; }
    document.documentElement.style.cursor = on ? 'crosshair' : '';
    render();
  }
  var SUPPRESS = ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick', 'contextmenu', 'touchstart', 'touchend', 'submit', 'keyup', 'keypress', 'dragstart', 'focusin'];
  SUPPRESS.forEach(function (type) {
    window.addEventListener(type, function (e) {
      if (!annotating || isOurs(e)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (type === 'click' && !lockedEl && e.target && e.target.nodeType === 1 && e.target !== document.documentElement) openEditor(e.target);
      else if (type === 'click' && !lockedEl && e.target === document.documentElement) openEditor(document.body || e.target);
    }, true);
  });
  window.addEventListener('mousemove', function (e) {
    if (!annotating || lockedEl || isOurs(e)) return;
    var el = e.target;
    if (!el || el.nodeType !== 1) return;
    hoverEl = el;
    drawOutline(el, false);
  }, true);
  window.addEventListener('keydown', function (e) {
    if (e.altKey && e.code === 'KeyN') { e.preventDefault(); e.stopImmediatePropagation(); setAnnotating(!annotating); return; }
    if (e.key === 'Escape' && (annotating || openPin)) {
      if (lockedEl || openPin) { e.preventDefault(); e.stopImmediatePropagation(); if (lockedEl) dropWriting(); closeCard(); }
      else { e.preventDefault(); e.stopImmediatePropagation(); setAnnotating(false); }
      return;
    }
    if (annotating && !isOurs(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  btn.addEventListener('click', function (e) { e.stopPropagation(); setAnnotating(!annotating); });
  sendBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    sendBtn.disabled = true;
    api('POST', API + '/send', { page: page }).then(function (j) {
      sendBtn.disabled = false;
      flash = j.sent === 1 ? '1 note sent' : j.sent + ' notes sent';
      setTimeout(function () { flash = ''; render(); }, 2500);
      return load();
    }).catch(function () { sendBtn.disabled = false; });
  });

  // ---- keep pins on their elements ----
  var raf = 0;
  function schedule() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; placePins(); }); }
  window.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  setInterval(schedule, 1000);

  function start() {
    mount();
    load().then(function () {
      var w = readWriting();
      if (!w || !w.text) return;
      var el = null;
      try { el = document.querySelector(w.selector); } catch (e) {}
      if (!el) return;
      annotating = true;
      document.documentElement.style.cursor = 'crosshair';
      render();
      openEditor(el, w.text);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
