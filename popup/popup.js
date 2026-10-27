(async function () {
  'use strict';
  const RR = globalThis.ReleaseRadar;
  const $ = (id) => document.getElementById(id);
  const FILES = ['src/engine.js', 'src/defaults.js', 'src/settings.js', 'src/content.js'];

  $('openOptions').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

  // Profile switcher
  let settings = await RR.loadSettings();
  const sel = $('profile');
  for (const p of settings.profiles) sel.add(new Option(p.name, p.id, false, p.id === settings.activeProfileId));
  sel.addEventListener('change', async () => {
    settings = await RR.loadSettings();
    settings.activeProfileId = sel.value;
    await RR.saveSettings(settings);
    setTimeout(refresh, 150);
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let url;
  try { url = new URL(tab.url); } catch (_) { url = null; }
  if (!url || !/^https?:$/.test(url.protocol)) {
    $('statusText').textContent = 'PlayFit works on regular web pages only.';
    return;
  }

  // Auto-scan toggle for this site (stored as an optional host permission)
  const host = url.hostname.replace(/^www\./, '');
  const patterns = RR.hostPatterns(host);

  // "Only pages like this one": the current URL split into tickable path / parameter parts.
  // `mine` is the saved scope this page edits, so ticking boxes replaces it rather than adding more.
  const parts = RR.scopeParts(url.href);
  let mine = (settings.scopes[host] || []).find((sc) => RR.inScope(url.href, [sc])) || '';
  if (mine) {
    const [path, query = ''] = mine.split('?');
    const pairs = query.split('&');
    for (const p of parts) p.on = p.part === path || pairs.includes(p.part);
  }
  function renderScope() {
    const scopes = settings.scopes[host] || [];
    $('scopeBox').hidden = !$('auto').checked || !parts.length;
    const only = scopes.length > 0;
    for (const r of document.querySelectorAll('input[name=scope]')) r.checked = r.value === (only ? 'only' : 'all');
    $('parts').hidden = !only;
    // Each part: tick to require it, edit the text to loosen or change it (e.g. "action=details" → "action").
    $('parts').replaceChildren(...parts.map((p) => {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = p.on;
      box.addEventListener('change', () => { p.on = box.checked; saveScope(false); });
      const text = document.createElement('input');
      text.type = 'text';
      text.value = p.part;
      text.addEventListener('change', () => {
        const v = text.value.trim().toLowerCase();
        if (!v || v.startsWith('/') !== p.part.startsWith('/')) { text.value = p.part; return; }
        p.part = v.replace(/\/+$/, '') || p.part;
        if (p.on) saveScope(false);
      });
      const row = document.createElement('div');
      row.className = 'part';
      row.append(box, text);
      return row;
    }));
    // All of this site's rules, so ones made on other pages can be removed from here too.
    $('rules').hidden = !only;
    $('rules').replaceChildren(...scopes.map((sc) => {
      const li = document.createElement('li');
      if (sc === mine) { li.className = 'current'; li.title = 'This page'; }
      const name = document.createElement('span');
      name.textContent = RR.describeScope(sc);
      const x = document.createElement('button');
      x.textContent = '×';
      x.title = scopes.length > 1 ? 'Remove' : 'Remove (the whole site is scanned again)';
      x.addEventListener('click', () => removeScope(sc));
      li.append(name, x);
      return li;
    }));
    $('scopeSummary').textContent = only ? (RR.inScope(url.href, scopes) ? 'This page is scanned.' : 'This page is not scanned.') : 'Every page on this site is scanned.';
  }
  async function removeScope(sc) {
    settings = await RR.loadSettings();
    const scopes = (settings.scopes[host] || []).filter((x) => x !== sc);
    if (scopes.length) settings.scopes[host] = scopes; else delete settings.scopes[host];
    if (sc === mine) { mine = ''; for (const p of parts) p.on = false; }
    await RR.saveSettings(settings);
    renderScope();
  }
  async function saveScope(all) {
    settings = await RR.loadSettings();
    const others = (settings.scopes[host] || []).filter((sc) => sc !== mine);
    mine = all ? '' : RR.scopeFromParts(parts);
    const scopes = all ? [] : [...others.filter((sc) => sc !== mine), ...(mine ? [mine] : [])];
    if (scopes.length) settings.scopes[host] = scopes; else delete settings.scopes[host];
    await RR.saveSettings(settings);
    renderScope();
  }
  for (const r of document.querySelectorAll('input[name=scope]')) r.addEventListener('change', () => {
    if (r.value === 'only' && !parts.some((p) => p.on)) RR.scopeParts(url.href).forEach((d, i) => Object.assign(parts[i], d));
    saveScope(r.value === 'all');
  });

  if (patterns) {
    $('host').textContent = host;
    $('autoRow').hidden = false;
    $('auto').checked = (await RR.autoHosts()).includes(host);
    $('auto').addEventListener('change', async (e) => {
      if (e.target.checked) {
        const ok = await chrome.permissions.request({ origins: patterns });
        e.target.checked = ok;
        if (ok) await scanNow();
      } else {
        await chrome.permissions.remove({ origins: patterns });
        settings = await RR.loadSettings();
        delete settings.scopes[host];
        await RR.saveSettings(settings);
      }
      renderScope();
    });
    renderScope();
  }

  async function summary() {
    try { return await chrome.tabs.sendMessage(tab.id, { type: 'rr:summary' }); } catch (_) { return null; }
  }

  async function scanNow() {
    $('statusText').textContent = 'Scanning…';
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['src/content.css'] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: FILES });
    } catch (e) {
      $('statusText').textContent = 'Cannot scan this page: ' + e.message;
      return;
    }
    setTimeout(refresh, 400);
  }
  $('scan').addEventListener('click', scanNow);

  async function refresh() {
    const s = await summary();
    if (!s) {
      $('statusText').textContent = 'Not scanned yet.';
      $('scan').hidden = false;
      return;
    }
    $('scan').hidden = false;
    $('scan').textContent = 'Rescan';
    $('scan').classList.remove('primary');
    $('counts').hidden = false;
    $('cPerfect').textContent = s.counts.perfect;
    $('cOk').textContent = s.counts.ok;
    $('cBad').textContent = s.counts.bad;
    $('statusText').textContent = s.total ? `${s.total} release name${s.total === 1 ? '' : 's'} on this page. Best first:`
      : s.paused ? 'Auto-scan is limited to other pages of this site. Press Scan to rate this one.' : 'No release names found on this page.';
    const noGreen = !s.counts.perfect && s.titles && s.titles.length;
    $('noGreen').hidden = !noGreen;
    const bt = $('bestTitles');
    bt.replaceChildren();
    if (noGreen) {
      for (const t of s.titles) {
        const li = document.createElement('li');
        li.title = 'Scroll to it';
        const title = document.createElement('span'); title.className = 'title';
        title.textContent = `★ ${t.title}` + (t.count > 1 ? ` (${t.count} releases)` : '');
        const name = document.createElement('span'); name.className = 'name'; name.textContent = t.name;
        const why = document.createElement('span'); why.className = 'why'; why.textContent = t.issues.join(' · ');
        li.append(title, name, why);
        li.addEventListener('click', () => chrome.tabs.sendMessage(tab.id, { type: 'rr:scrollTo', idx: t.idx }));
        bt.append(li);
      }
    }
    const ol = $('top');
    ol.replaceChildren();
    for (const r of s.top) {
      const li = document.createElement('li');
      li.title = 'Scroll to it';
      const dot = document.createElement('i'); dot.className = 'dot ' + r.verdict;
      const name = document.createElement('span'); name.className = 'name'; name.textContent = r.name;
      li.append(dot, name);
      li.addEventListener('click', () => chrome.tabs.sendMessage(tab.id, { type: 'rr:scrollTo', idx: r.idx }));
      ol.append(li);
    }
  }

  refresh();
})();
