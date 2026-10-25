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
    $('statusText').textContent = 'Release Radar works on regular web pages only.';
    return;
  }

  // Auto-scan toggle for this site (stored as an optional host permission)
  const host = url.hostname.replace(/^www\./, '');
  const patterns = RR.hostPatterns(host);
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
      }
    });
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
    $('statusText').textContent = s.total ? `${s.total} release name${s.total === 1 ? '' : 's'} on this page. Best first:` : 'No release names found on this page.';
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
