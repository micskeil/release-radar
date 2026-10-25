/* Release Radar — service worker: auto-scan registrations, toolbar counts, first-run setup. */
importScripts('engine.js', 'defaults.js', 'settings.js');
const RR = globalThis.ReleaseRadar;
const SCRIPT_ID = 'rr-auto';
const FILES = ['src/engine.js', 'src/defaults.js', 'src/settings.js', 'src/content.js'];

async function syncRegistrations() {
  const hosts = await RR.autoHosts();
  const matches = hosts.flatMap((h) => RR.hostPatterns(h) || []);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  if (!matches.length) return;
  await chrome.scripting.registerContentScripts([{
    id: SCRIPT_ID, matches, js: FILES, css: ['src/content.css'], runAt: 'document_idle', allFrames: false, persistAcrossSessions: true,
  }]);
}

async function injectInto(tabId) {
  await chrome.scripting.insertCSS({ target: { tabId }, files: ['src/content.css'] });
  await chrome.scripting.executeScript({ target: { tabId }, files: FILES });
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const s = await RR.loadSettings();
  await syncRegistrations();
  if (reason === 'install' && !s.setupDone) chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(syncRegistrations);

chrome.permissions.onAdded.addListener(async ({ origins = [] }) => {
  await syncRegistrations();
  if (!origins.length) return;
  // Scan already-open tabs on the newly allowed site right away.
  const tabs = await chrome.tabs.query({ url: origins });
  for (const t of tabs) {
    try {
      const alive = await chrome.tabs.sendMessage(t.id, { type: 'rr:ping' }).catch(() => null);
      if (!alive) await injectInto(t.id);
    } catch (_) { /* tab not scriptable */ }
  }
});
chrome.permissions.onRemoved.addListener(syncRegistrations);

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'rr:counts' && sender.tab) {
    const { perfect, ok, bad } = msg.counts;
    const total = perfect + ok + bad;
    const text = total ? String(perfect || ok || 0) : '';
    const color = perfect ? '#16a34a' : ok ? '#ca8a04' : '#dc2626';
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: total && (perfect || ok) ? text : total ? '0' : '' });
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color });
    chrome.action.setTitle({ tabId: sender.tab.id, title: `Release Radar: ${perfect} best, ${ok} ok, ${bad} skip` });
  } else if (msg.type === 'rr:inject') {
    injectInto(msg.tabId).then(() => reply({ ok: true }), (e) => reply({ ok: false, error: e.message }));
    return true;
  }
});
