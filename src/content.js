/*
 * PlayFit — content script.
 * Finds release-name text on the page and rates it with the active profile.
 *
 * It never inserts elements into the page's layout. It only sets data attributes on
 * existing elements; content.css then colours the title text and draws a coloured dot
 * in front of it with ::before. Hovering a marked title shows a details tooltip, which
 * lives in a fixed-position shadow-DOM host outside the page flow.
 *
 *   data-rr="perfect|ok|bad"     on the link (or text parent)  → text colour, hover target
 *   data-rr-dot="perfect|ok|bad" on the element holding the first title text → ::before dot
 *   data-rr-best                 on the same element when it is the best release on the page → ★
 *   data-rr-row="perfect|ok|bad" on the surrounding table row / list item → tint
 *   <html data-rr-color data-rr-dotmode …> switches display options on and off
 *
 * Safe to inject more than once: a second injection just rescans.
 * On auto-scan sites with page scopes, pages outside the scopes are left alone until the user scans.
 */
(function () {
  'use strict';
  if (window.__releaseRadar) { window.__releaseRadar.rescan(); return; }

  const RR = globalThis.ReleaseRadar;
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'TITLE', 'HEAD', 'CODE', 'PRE', 'svg', 'SVG', 'IFRAME', 'BUTTON']);
  const VERDICT_TEXT = { perfect: 'Perfect match', ok: 'Acceptable', bad: "Don't download" };

  let settings = null;
  let profile = null;
  const seenText = new WeakSet();
  /** @type {{name:string, container:Element, dotEl:Element, row:Element|null, result:any}[]} */
  const entries = [];
  const entryOf = new WeakMap(); // container → entry
  // Auto-scan (registered script, flagged by auto.js) only rates pages inside the site's scopes;
  // a scan the user starts from the toolbar always runs.
  let manual = !globalThis.__rrAuto;
  const active = () => manual || RR.inScope(location.href, RR.scopesFor(settings, location.hostname));

  // ---------------------------------------------------------------- tooltip (shadow DOM, immune to site CSS)
  const tipHost = document.createElement('div');
  tipHost.style.cssText = 'all:initial;position:fixed;z-index:2147483647;top:0;left:0;pointer-events:none;display:none';
  const tipRoot = tipHost.attachShadow({ mode: 'closed' });
  tipRoot.innerHTML = `
    <style>
      .tip { font: 12px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #e7e5e4; background: #1c1917;
             border: 1px solid #44403c; border-radius: 8px; padding: 10px 12px; width: max-content; max-width: min(460px, 90vw);
             box-shadow: 0 8px 24px rgba(0,0,0,.35); }
      .head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
      .chip { font-weight: 700; font-size: 11px; padding: 1px 7px; border-radius: 4px; }
      .perfect { background: #16a34a; color: #fff; } .ok { background: #facc15; color: #1c1917; } .bad { background: #dc2626; color: #fff; }
      .score { color: #a8a29e; font-size: 11px; margin-left: auto; }
      .name { font-family: ui-monospace, "JetBrains Mono", monospace; font-size: 11px; color: #d6d3d1; word-break: break-word; margin-bottom: 8px; }
      table { border-collapse: collapse; width: 100%; }
      td { padding: 2px 6px 2px 0; vertical-align: top; }
      td.cat { color: #a8a29e; white-space: nowrap; }
      .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: 1px; }
      .dot.perfect { background: #22c55e; } .dot.ok { background: #facc15; } .dot.bad { background: #ef4444; }
      .note { color: #a8a29e; font-size: 11px; }
      .missing { font-style: italic; color: #a8a29e; }
      .profile { color: #78716c; font-size: 10.5px; margin-top: 8px; }
    </style>
    <div class="tip"></div>`;
  const tipEl = tipRoot.querySelector('.tip');
  let tipEntry = null;
  let tipTimer = 0;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function showTip(entry) {
    tipEntry = entry;
    const r = entry.result;
    const rows = r.results.map((x) => `
      <tr><td class="cat"><span class="dot ${x.rating}"></span>${esc(x.category)}</td>
          <td><span class="${x.missing ? 'missing' : ''}">${esc(x.label)}</span>${x.note ? `<div class="note">${esc(x.note)}</div>` : ''}</td></tr>`).join('');
    tipEl.innerHTML = `
      <div class="head"><span class="chip ${r.verdict}">${VERDICT_TEXT[r.verdict]}</span>${entry.dotEl.hasAttribute('data-rr-best') ? '<span>★ best of this title</span>' : ''}<span class="score">score ${r.score}</span></div>
      <div class="name">${esc(entry.name)}</div>
      <table>${rows || '<tr><td class="missing">No rule matched</td></tr>'}</table>
      <div class="profile">Profile: ${esc(profile.name)}</div>`;
    if (!tipHost.isConnected) document.documentElement.appendChild(tipHost);
    tipHost.style.display = 'block';
    const rects = entry.container.getClientRects();
    const b = rects[0] || entry.container.getBoundingClientRect();
    const bottom = rects.length ? rects[rects.length - 1].bottom : b.bottom;
    const t = tipEl.getBoundingClientRect();
    let top = bottom + 6;
    if (top + t.height > innerHeight - 8) top = Math.max(8, b.top - t.height - 6);
    const left = Math.min(Math.max(8, b.left), innerWidth - t.width - 8);
    tipHost.style.top = top + 'px';
    tipHost.style.left = left + 'px';
  }

  function hideTip() {
    clearTimeout(tipTimer);
    tipEntry = null;
    tipHost.style.display = 'none';
  }

  // One delegated listener pair for all marked titles.
  document.addEventListener('mouseover', (e) => {
    const c = e.target.closest && e.target.closest('[data-rr]');
    const entry = c && entryOf.get(c);
    if (!entry || entry === tipEntry) return;
    clearTimeout(tipTimer);
    // Hide the site's own title-attribute tooltip while ours is showing.
    if (c.hasAttribute('title')) { c.setAttribute('data-rr-title', c.getAttribute('title')); c.removeAttribute('title'); }
    tipTimer = setTimeout(() => showTip(entry), 120);
  }, true);
  document.addEventListener('mouseout', (e) => {
    const c = e.target.closest && e.target.closest('[data-rr]');
    if (!c || (e.relatedTarget && c.contains(e.relatedTarget))) return;
    if (c.hasAttribute('data-rr-title')) { c.setAttribute('title', c.getAttribute('data-rr-title')); c.removeAttribute('data-rr-title'); }
    hideTip();
  }, true);
  addEventListener('scroll', hideTip, { passive: true, capture: true });

  // ---------------------------------------------------------------- detection
  function candidateFor(textNode) {
    const parent = textNode.parentElement;
    if (!parent || parent.closest('[data-rr], [contenteditable=""], [contenteditable="true"]')) return null;
    for (let el = parent; el && el !== document.body; el = el.parentElement) if (SKIP_TAGS.has(el.tagName)) return null;
    let text = textNode.nodeValue.trim();
    const link = parent.closest('a');
    // Names split across elements inside a link (search highlighting, <wbr>) → use the whole link text.
    if (link) {
      const full = link.textContent.replace(/\s+/g, ' ').trim();
      if (full.length <= 600 && full.length > text.length) text = full;
    }
    // Truncated link text ("Dune.Part.Two.2024.2160p.WEB-D...") → use the title attribute.
    // Compare without the ellipsis: nCore cuts "…-SPARKS" to "…-SPARK..." (same length as the title).
    const title = ((link && link.getAttribute('title')) || parent.getAttribute('title') || '').trim();
    const cut = text.replace(/(\.\.\.|…)$/, '');
    if (title && title.length > cut.length && RR.looksLikeRelease(title, { loose: true }) &&
        (cut !== text || title.startsWith(cut.slice(0, 10)))) text = title;
    // Links and headings may carry long descriptive titles (rutracker); plain text must look like a bare release name.
    const loose = !!link || /^H[1-3]$/.test(parent.tagName);
    if (!RR.looksLikeRelease(text, { loose })) return null;
    const container = link && link.textContent.length <= 650 ? link : parent;
    return { text, container, textNode };
  }

  function rowFor(el) {
    const row = el.closest('tr, li, [role="row"]') || repeatedBlock(el);
    if (!row) return null;
    if (row.matches('li') && row.textContent.length > 800) return null;
    return row;
  }

  // Div-based lists (nCore's div.box_torrent): the nearest ancestor that repeats as a sibling
  // with the same tag and class, e.g. one of 3+ "div.box_torrent" under the result list.
  function repeatedBlock(el) {
    let p = el.parentElement;
    for (let depth = 0; p && p.parentElement && p !== document.body && depth < 8; depth++, p = p.parentElement) {
      if (!p.className || typeof p.className !== 'string' || p.textContent.length > 800) continue;
      const same = [...p.parentElement.children].filter((c) => c.tagName === p.tagName && c.className === p.className);
      if (same.length >= 3) return p;
    }
    return null;
  }

  function paint(entry) {
    const v = entry.result.verdict;
    entry.container.setAttribute('data-rr', v);
    entry.dotEl.setAttribute('data-rr-dot', v);
    if (entry.row) {
      entry.row.setAttribute('data-rr-row', v);
      entry.row.toggleAttribute('data-rr-dim', !!settings.display.dimBad && v === 'bad');
    }
  }

  function applyDisplay() {
    const d = settings.display;
    const html = document.documentElement;
    html.toggleAttribute('data-rr-color', !!d.colorText);
    html.toggleAttribute('data-rr-dotmode', !!d.showDot);
    html.toggleAttribute('data-rr-tint', !!d.tintRows);
  }

  /** Live (non-red, on-page) entries grouped by movie / show title. */
  function titleGroups() {
    const groups = new Map();
    for (const e of entries) {
      if (!e.container.isConnected || e.result.verdict === 'bad') continue;
      const key = e.title || e.name;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    return groups;
  }

  /** Top-scoring entries of a group (ties included). */
  function bestOf(group) {
    const max = Math.max(...group.map((e) => e.result.score));
    return group.filter((e) => e.result.score === max);
  }

  // Best release per title, only where a title has something to compare against.
  function markBest() {
    for (const e of entries) {
      e.dotEl.removeAttribute('data-rr-best');
      if (e.row) e.row.removeAttribute('data-rr-row-best');
    }
    if (!settings.display.markBest) return;
    // A browse list mixes many titles with only a release or two each, so "best" means little there.
    // Star only titles that make up a real share of the page (search results, other versions of one film).
    const live = new Set(entries.filter((e) => e.container.isConnected).map((e) => e.name)).size;
    for (const group of titleGroups().values()) {
      const n = new Set(group.map((e) => e.name)).size;
      if (n < 2 || n < live * 0.25) continue;
      for (const e of bestOf(group)) {
        e.dotEl.setAttribute('data-rr-best', '');
        if (e.row) e.row.setAttribute('data-rr-row-best', '');
      }
    }
  }

  function scan(root) {
    if (!profile || !active()) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const len = n.nodeValue.length;
        // Skip whitespace-only nodes: the dot must sit right in front of visible title text.
        return len >= 3 && len <= 700 && !seenText.has(n) && /\S\S/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const found = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      seenText.add(n);
      const c = candidateFor(n);
      if (c) found.push(c);
    }
    let added = 0;
    for (const c of found) {
      if (c.container.hasAttribute('data-rr') || entryOf.has(c.container)) continue;
      const entry = { name: c.text, container: c.container, dotEl: c.textNode.parentElement, row: rowFor(c.container), title: RR.titleOf(c.text), result: RR.evaluate(c.text, profile) };
      entryOf.set(c.container, entry);
      paint(entry);
      entries.push(entry);
      added++;
    }
    if (added) { markBest(); reportCounts(); }
  }

  function reevaluate() {
    applyDisplay();
    for (const e of entries) { e.result = RR.evaluate(e.name, profile); paint(e); }
    markBest();
    reportCounts();
    if (tipEntry) showTip(tipEntry);
  }

  function counts() {
    const c = { perfect: 0, ok: 0, bad: 0 };
    for (const e of entries) if (e.container.isConnected) c[e.result.verdict]++;
    return c;
  }

  function reportCounts() {
    try { chrome.runtime.sendMessage({ type: 'rr:counts', counts: counts() }).catch(() => {}); } catch (_) { /* extension reloaded */ }
  }

  // ---------------------------------------------------------------- dynamic pages
  let pending = [];
  let timer = 0;
  const observer = new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n === tipHost) continue;
      if (n.nodeType === 1) pending.push(n);
      else if (n.nodeType === 3 && n.parentNode) pending.push(n.parentNode);
    }
    if (pending.length && !timer) {
      timer = setTimeout(() => {
        const nodes = pending; pending = []; timer = 0;
        for (const n of nodes) if (n && n.isConnected) scan(n);
      }, 250);
    }
  });

  // ---------------------------------------------------------------- messaging
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type === 'rr:summary') {
      const uniq = new Map();
      entries.forEach((e, i) => {
        if (e.container.isConnected && !uniq.has(e.name)) uniq.set(e.name, { name: e.name, verdict: e.result.verdict, score: e.result.score, idx: i });
      });
      const top = [...uniq.values()].sort((a, b) => b.score - a.score).slice(0, 8);
      // Per title: the best release and why it isn't green (shown when nothing on the page is green).
      const titles = [...titleGroups().values()].map((group) => {
        const e = bestOf(group)[0];
        const issues = e.result.results.filter((r) => r.rating !== 'perfect').map((r) => `${r.category}: ${r.label}`);
        return { title: e.title, count: new Set(group.map((g) => g.name)).size, name: e.name, verdict: e.result.verdict, score: e.result.score, issues, idx: entries.indexOf(e) };
      }).sort((a, b) => b.count - a.count || b.score - a.score).slice(0, 5);
      reply({ counts: counts(), total: uniq.size, top, titles, profile: profile && profile.name, paused: !active() });
    } else if (msg.type === 'rr:scrollTo') {
      const e = entries[msg.idx];
      if (e) {
        const el = e.row || e.container;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.removeAttribute('data-rr-flash'); void el.offsetWidth; el.setAttribute('data-rr-flash', '');
        setTimeout(() => el.removeAttribute('data-rr-flash'), 2000);
      }
      reply({ ok: true });
    } else if (msg.type === 'rr:ping') {
      reply({ ok: true });
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    settings = changes.settings.newValue;
    settings.display = Object.assign({}, RR.DEFAULT_DISPLAY, settings.display || {});
    profile = RR.activeProfile(settings);
    reevaluate();
    scan(document.body);
  });

  window.__releaseRadar = { rescan: () => { manual = true; scan(document.body); } };

  RR.loadSettings().then((s) => {
    settings = s;
    profile = RR.activeProfile(s);
    applyDisplay();
    scan(document.body);
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
