/* PlayFit — settings persistence (chrome.storage.local). */
(function (root) {
  'use strict';
  const RR = root.ReleaseRadar;

  async function loadSettings() {
    const { settings } = await chrome.storage.local.get('settings');
    if (settings && Array.isArray(settings.profiles) && settings.profiles.length) {
      settings.display = Object.assign({}, RR.DEFAULT_DISPLAY, settings.display || {});
      if (!settings.profiles.some((p) => p.id === settings.activeProfileId)) settings.activeProfileId = settings.profiles[0].id;
      if ((settings.rulesVersion || 1) < RR.RULES_VERSION) {
        // Rule set improved: rebuild profiles the user never hand-edited from their setup answers.
        settings.profiles = settings.profiles.map((p) =>
          p.answers && !p.edited ? RR.buildProfile(Object.assign({}, p.answers, { id: p.id, name: p.name })) : p);
        settings.rulesVersion = RR.RULES_VERSION;
        await chrome.storage.local.set({ settings });
      }
      return settings;
    }
    const fresh = RR.defaultSettings();
    await chrome.storage.local.set({ settings: fresh });
    return fresh;
  }

  function saveSettings(settings) {
    return chrome.storage.local.set({ settings });
  }

  function activeProfile(settings) {
    return settings.profiles.find((p) => p.id === settings.activeProfileId) || settings.profiles[0];
  }

  /** Host → match patterns for the host and its subdomains. */
  function hostPatterns(host) {
    const h = String(host).trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[\/:].*$/, '').replace(/^www\./, '');
    if (!/^[a-z0-9.-]+\.[a-z0-9-]+$/.test(h)) return null;
    return [`*://${h}/*`, `*://*.${h}/*`];
  }

  /** Granted optional origins → list of hosts. */
  async function autoHosts() {
    const { origins = [] } = await chrome.permissions.getAll();
    const hosts = new Set();
    for (const o of origins) {
      const m = /^\*:\/\/(?:\*\.)?([^/]+)\/\*$/.exec(o);
      if (m) hosts.add(m[1]);
    }
    return [...hosts].sort();
  }

  Object.assign(RR, { loadSettings, saveSettings, activeProfile, hostPatterns, autoHosts });
})(globalThis);
