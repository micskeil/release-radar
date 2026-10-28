(async function () {
  'use strict';
  const RR = globalThis.ReleaseRadar;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k in el && k !== 'list') el[k] = v;
      else el.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null) el.append(c);
    return el;
  }

  let settings = await RR.loadSettings();
  let lastWritten = '';
  let saveTimer = 0;
  const profile = () => RR.activeProfile(settings);

  function save(immediate) {
    clearTimeout(saveTimer);
    const run = async () => {
      lastWritten = JSON.stringify(settings);
      await RR.saveSettings(settings);
      const s = $('#saved');
      s.textContent = 'Saved';
      clearTimeout(s._t);
      s._t = setTimeout(() => (s.textContent = ''), 1500);
    };
    if (immediate) return run();
    saveTimer = setTimeout(run, 350);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    if (JSON.stringify(changes.settings.newValue) === lastWritten) return;
    settings = changes.settings.newValue;
    renderAll();
  });

  // ------------------------------------------------------------------ tabs
  function showTab(name) {
    for (const a of $$('.nav nav a')) a.classList.toggle('active', a.dataset.tab === name);
    for (const s of $$('.tab')) s.hidden = s.id !== 'tab-' + name;
    if (name === 'test') renderTest();
    if (name === 'sites') renderSites();
    history.replaceState(null, '', '#' + name);
  }
  for (const a of $$('.nav nav a')) a.addEventListener('click', () => showTab(a.dataset.tab));

  // ------------------------------------------------------------------ active profile selector
  function renderProfileSelect() {
    const sel = $('#activeProfile');
    sel.replaceChildren(...settings.profiles.map((p) => new Option(p.name, p.id, false, p.id === settings.activeProfileId)));
  }
  $('#activeProfile').addEventListener('change', (e) => {
    settings.activeProfileId = e.target.value;
    save(true);
    renderAll();
  });

  // ------------------------------------------------------------------ setup wizard
  const langBox = $('#w-langs');
  for (const [code, L] of Object.entries(RR.LANGUAGES)) {
    langBox.append(h('label', { class: 'check' }, h('input', { type: 'checkbox', value: code }), ` ${L.name}`));
  }

  function fillWizard(a) {
    $('#w-name').value = a.name || '';
    for (const key of ['maxRes', 'hdr', 'server', 'audio', 'remux']) {
      for (const r of $$(`input[name=${key}]`)) r.checked = r.value === a[key];
    }
    $('#w-dvP7').checked = !!a.dvP7;
    $('#w-av1').checked = !!a.av1;
    $('#w-hi10').checked = !!a.hi10;
    $('#w-requireLang').checked = !!a.requireLang;
    for (const c of $$('input', langBox)) c.checked = (a.langs || []).includes(c.value);
    $('#w-avoid').value = a.avoidGroups || '';
    $('#w-prefer').value = a.preferGroups || '';
  }

  function readWizard() {
    const radio = (n) => ($(`input[name=${n}]:checked`) || {}).value;
    return {
      name: $('#w-name').value.trim() || 'My setup',
      maxRes: radio('maxRes'), hdr: radio('hdr'), server: radio('server') || 'transcode', audio: radio('audio'), remux: radio('remux'),
      dvP7: $('#w-dvP7').checked, av1: $('#w-av1').checked, hi10: $('#w-hi10').checked,
      requireLang: $('#w-requireLang').checked,
      langs: $$('input:checked', langBox).map((c) => c.value),
      avoidGroups: $('#w-avoid').value, preferGroups: $('#w-prefer').value,
    };
  }

  function renderPresets() {
    const box = $('#presets');
    const cards = RR.PRESETS.map((p) => h('button', {
      type: 'button', class: 'preset card',
      onclick: (e) => { fillWizard(p.answers); $$('.preset').forEach((x) => x.classList.remove('selected')); e.currentTarget.classList.add('selected'); },
    }, h('b', {}, p.title), h('span', {}, p.description)));
    box.replaceChildren(...cards);
  }

  $('#wizard').addEventListener('submit', (e) => {
    e.preventDefault();
    const p = RR.buildProfile(readWizard());
    settings.profiles.push(p);
    settings.activeProfileId = p.id;
    settings.setupDone = true;
    save(true);
    renderAll();
    flash(`Profile “${p.name}” created and activated. Try it in Test names.`);
  });
  $('#w-rebuild').addEventListener('click', () => {
    const cur = profile();
    if (!confirm(`Rebuild “${cur.name}” from these answers? Manual rule edits in this profile will be lost.`)) return;
    const p = RR.buildProfile(Object.assign(readWizard(), { id: cur.id }));
    settings.profiles[settings.profiles.indexOf(cur)] = p;
    settings.setupDone = true;
    save(true);
    renderAll();
    flash(`Profile “${p.name}” rebuilt.`);
  });

  function flash(msg) {
    const s = $('#saved');
    s.textContent = msg;
    clearTimeout(s._t);
    s._t = setTimeout(() => (s.textContent = ''), 4000);
  }

  // ------------------------------------------------------------------ rules editor
  const RATING_LABEL = { perfect: 'Green', ok: 'Yellow', bad: 'Red' };
  const MISSING_LABEL = { ignore: 'Ignore', ok: 'Yellow', bad: 'Red' };

  function move(arr, i, d) {
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  function ratingSelect(value, onchange, labels = RATING_LABEL) {
    const sel = h('select', { class: 'rating-' + value, onchange: (e) => { e.target.className = 'rating-' + e.target.value; onchange(e.target.value); } });
    for (const [v, l] of Object.entries(labels)) sel.add(new Option(l, v, false, v === value));
    return sel;
  }

  function renderRules() {
    const p = profile();
    $('#r-name').textContent = p.name;
    const box = $('#categories');
    box.replaceChildren(...p.categories.map((cat, ci) => {
      const rows = cat.options.map((o, oi) => {
        const pat = h('input', {
          class: 'pattern', value: o.pattern, spellcheck: false,
          oninput: (e) => {
            o.pattern = e.target.value;
            const err = RR.patternError(o.pattern);
            e.target.classList.toggle('invalid', !!err);
            e.target.title = err || '';
            if (!err) save();
          },
        });
        return h('tr', {},
          h('td', { class: 'label' }, h('input', { value: o.label, oninput: (e) => { o.label = e.target.value; save(); } })),
          h('td', {}, pat),
          h('td', { class: 'rating' }, ratingSelect(o.rating, (v) => { o.rating = v; save(); })),
          h('td', { class: 'note' }, h('input', { value: o.note || '', placeholder: 'shown in tooltip', oninput: (e) => { o.note = e.target.value; save(); } })),
          h('td', { class: 'move' },
            h('button', { class: 'iconbtn', title: 'Move up', disabled: oi === 0, onclick: () => { move(cat.options, oi, -1); save(); renderRules(); } }, '↑'),
            h('button', { class: 'iconbtn', title: 'Move down', disabled: oi === cat.options.length - 1, onclick: () => { move(cat.options, oi, 1); save(); renderRules(); } }, '↓'),
            h('button', { class: 'iconbtn', title: 'Delete rule', onclick: () => { cat.options.splice(oi, 1); save(); renderRules(); } }, '✕')));
      });
      return h('div', { class: 'category card' },
        h('div', { class: 'cat-head' },
          h('input', { class: 'cat-name', value: cat.name, oninput: (e) => { cat.name = e.target.value; save(); } }),
          h('label', {}, 'If not found', ratingSelect(cat.whenMissing || 'ignore', (v) => { cat.whenMissing = v; save(); }, MISSING_LABEL)),
          h('span', { class: 'spacer' }),
          h('button', { class: 'iconbtn', title: 'Move category up', disabled: ci === 0, onclick: () => { move(p.categories, ci, -1); save(); renderRules(); } }, '↑'),
          h('button', { class: 'iconbtn', title: 'Move category down', disabled: ci === p.categories.length - 1, onclick: () => { move(p.categories, ci, 1); save(); renderRules(); } }, '↓'),
          h('button', { class: 'iconbtn', title: 'Delete category', onclick: () => { if (confirm(`Delete category “${cat.name}”?`)) { p.categories.splice(ci, 1); save(); renderRules(); } } }, '✕')),
        h('table', { class: 'rules' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Label'), h('th', {}, 'Pattern'), h('th', {}, 'Rating'), h('th', {}, 'Note'), h('th', {}))),
          h('tbody', {}, rows)),
        h('button', { class: 'btn small add-rule', onclick: () => { cat.options.push({ label: 'New rule', pattern: '', rating: 'ok', note: '' }); save(); renderRules(); } }, '+ Add rule'));
    }));
  }

  // ------------------------------------------------------------------ profiles
  const newId = () => 'p-' + Math.random().toString(36).slice(2, 9);
  function renderProfiles() {
    $('#p-list').replaceChildren(...settings.profiles.map((p) => {
      const active = p.id === settings.activeProfileId;
      const use = () => { settings.activeProfileId = p.id; save(true); renderAll(); };
      return h('li', { class: 'card' + (active ? ' active' : '') },
        h('input', { class: 'pname', value: p.name, title: 'Rename', oninput: (e) => { p.name = e.target.value; save(true); renderProfileSelect(); } }),
        active ? h('span', { class: 'badge' }, 'Active') : h('button', { class: 'btn small', onclick: use }, 'Use'),
        h('button', { class: 'btn small', onclick: () => { if (!active) use(); showTab('rules'); } }, 'Edit rules'),
        h('button', { class: 'btn small', onclick: () => {
          if (!active) use();
          fillWizard(p.answers || RR.PRESETS[0].answers);
          showTab('setup');
        } }, 'Edit setup'),
        h('button', { class: 'btn small', onclick: () => {
          const copy = structuredClone(p);
          copy.id = newId();
          copy.name += ' (copy)';
          settings.profiles.push(copy);
          save(true); renderAll();
        } }, 'Duplicate'),
        h('button', { class: 'btn small', onclick: () => download({ releaseRadarProfile: 1, profile: p }, `playfit-${slug(p.name)}.json`) }, 'Export'),
        h('button', { class: 'btn small danger', disabled: settings.profiles.length < 2, onclick: () => {
          if (!confirm(`Delete profile “${p.name}”?`)) return;
          settings.profiles = settings.profiles.filter((x) => x !== p);
          if (active) settings.activeProfileId = settings.profiles[0].id;
          save(true); renderAll();
        } }, 'Delete'));
    }));
  }
  $('#p-new').addEventListener('click', () => {
    fillWizard(Object.assign({}, RR.PRESETS[0].answers, { name: 'New setup' }));
    showTab('setup');
    $('#w-name').focus();
  });
  $('#r-addcat').addEventListener('click', () => {
    profile().categories.push({ id: 'c-' + Math.random().toString(36).slice(2, 7), name: 'New category', whenMissing: 'ignore', options: [] });
    save(); renderRules();
  });

  // ------------------------------------------------------------------ test names
  const SAMPLES = [
    'Dune.Part.Two.2024.2160p.MA.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265.HUN.ENG-PTHD',
    'Dune.Part.Two.2024.2160p.MA.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX',
    'Dune.Part.Two.2024.1080p.WEB-DL.DDP5.1.Atmos.H.264-FLUX',
    'Dune.Part.Two.2024.2160p.UHD.BluRay.x265.10bit.HDR.TrueHD.7.1.Atmos-GRP',
    'Dune.Part.Two.2024.2160p.UHD.BluRay.REMUX.DV.HDR10.HEVC.TrueHD.7.1.Atmos-FraMeSToR',
    'Dune Part Two (2024) (1080p BluRay x265 HEVC 10bit AAC 7.1 Tigole)',
    'Dune.Part.Two.2024.1080p.WEBRip.x264.AAC5.1-YTS.MX',
    'Dune.Part.Two.2024.HDCAM.x264-GRP',
  ].join('\n');
  const tIn = $('#t-input');
  const storedTest = localStorage.getItem('rr-test');
  tIn.value = storedTest || SAMPLES;
  tIn.addEventListener('input', () => { try { localStorage.setItem('rr-test', tIn.value); } catch (_) {} renderTest(); });

  function renderTest() {
    const p = structuredClone(profile()); // fresh object → engine recompiles edited patterns
    const names = tIn.value.split('\n').map((s) => s.trim()).filter(Boolean);
    const results = names.map((n) => RR.evaluate(n, p)).sort((a, b) => b.score - a.score);
    const VERDICT = { perfect: 'Perfect match', ok: 'Acceptable', bad: "Don't download" };
    $('#t-results').replaceChildren(...results.map((r) => h('div', { class: 'result card ' + r.verdict },
      h('div', { class: 'row' }, h('span', { class: 'pill ' + r.verdict }, h('i', { class: 'dot ' + r.verdict }), VERDICT[r.verdict]), h('span', { class: 'muted small' }, 'score ' + r.score)),
      h('div', { class: 'name' }, r.name),
      h('div', { class: 'chips' }, r.results.map((x) => h('span', { class: 'chip ' + x.rating, title: x.note || '' }, h('i', {}, x.category + ': '), x.label))))));
  }

  // ------------------------------------------------------------------ sites
  async function renderSites() {
    const hosts = await RR.autoHosts();
    settings.scopes = settings.scopes || {};
    const list = $('#s-list');
    if (!hosts.length) { list.replaceChildren(h('li', { class: 'muted' }, 'No sites yet. Add one above, or use the toolbar popup on the site.')); return; }
    const setScopes = (host, scopes) => {
      if (scopes.length) settings.scopes[host] = scopes; else delete settings.scopes[host];
      save(true);
      renderSites();
    };
    list.replaceChildren(...hosts.map((host) => {
      const scopes = settings.scopes[host] || [];
      return h('li', { class: 'card' },
        h('div', { class: 'site' },
          h('span', {}, host),
          h('span', { class: 'scopes' }, scopes.length
            ? scopes.map((sc) => h('span', { class: 'chip', title: sc }, RR.describeScope(sc),
              h('button', { class: 'x', title: scopes.length > 1 ? 'Remove' : 'Remove (the whole site is scanned again)', onclick: () => setScopes(host, scopes.filter((x) => x !== sc)) }, '×')))
            : h('span', { class: 'muted small' }, 'All pages'))),
        h('button', { class: 'btn small danger', onclick: async () => {
          await chrome.permissions.remove({ origins: RR.hostPatterns(host) });
          delete settings.scopes[host];
          save(true);
          renderSites();
        } }, 'Remove'));
    }));
  }
  $('#s-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const site = RR.parseSite($('#s-host').value);
    if (!site) { flash('Enter a domain like example.org, optionally with a path or query'); return; }
    const ok = await chrome.permissions.request({ origins: RR.hostPatterns(site.host) });
    if (ok) {
      settings.scopes = settings.scopes || {};
      const scopes = settings.scopes[site.host] || [];
      // A bare domain means the whole site. A pasted page address is trimmed like the popup does it:
      // path + first parameter, item ids dropped.
      if (site.scope) site.scope = RR.scopeFromParts(RR.scopeParts('https://' + site.host + site.scope));
      if (!site.scope) delete settings.scopes[site.host];
      else if (!scopes.includes(site.scope)) settings.scopes[site.host] = [...scopes, site.scope];
      await save(true);
      $('#s-host').value = '';
    }
    renderSites();
  });

  // ------------------------------------------------------------------ display
  function renderDisplay() {
    for (const c of $$('[data-display]')) c.checked = !!settings.display[c.dataset.display];
  }
  for (const c of $$('[data-display]')) c.addEventListener('change', () => { settings.display[c.dataset.display] = c.checked; save(true); });

  // ------------------------------------------------------------------ backup
  function download(obj, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
    h('a', { href: url, download: filename }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'profile';
  $('#b-export-all').addEventListener('click', () => download({ releaseRadarSettings: 1, settings }, 'playfit-settings.json'));
  $('#b-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const msg = $('#b-msg');
    try {
      const data = JSON.parse(await file.text());
      const valid = (p) => p && typeof p.name === 'string' && Array.isArray(p.categories) && p.categories.every((c) => Array.isArray(c.options));
      if (data.releaseRadarSettings && data.settings && Array.isArray(data.settings.profiles) && data.settings.profiles.every(valid)) {
        if (!confirm('Replace all profiles and settings with this file?')) return;
        settings = Object.assign(RR.defaultSettings(), data.settings, { setupDone: true });
        msg.textContent = `Imported ${settings.profiles.length} profiles.`;
      } else if (data.releaseRadarProfile && valid(data.profile)) {
        const p = data.profile;
        p.id = newId();
        settings.profiles.push(p);
        settings.activeProfileId = p.id;
        msg.textContent = `Imported profile “${p.name}” and made it active.`;
      } else {
        throw new Error('not a PlayFit export');
      }
      save(true); renderAll();
    } catch (err) {
      msg.textContent = 'Import failed: ' + err.message;
    }
  });
  $('#b-reset').addEventListener('click', () => {
    if (!confirm('Delete all profiles and restore the defaults?')) return;
    settings = RR.defaultSettings();
    save(true); renderAll();
    $('#b-msg').textContent = 'Defaults restored.';
  });

  // ------------------------------------------------------------------ boot
  function renderAll() {
    renderProfileSelect();
    renderProfiles();
    renderRules();
    renderDisplay();
    if (!$('#tab-test').hidden) renderTest();
  }
  // Re-render the test tab whenever rules are saved.
  const origSave = save;
  save = function (imm) {
    // Hand-edited profiles are never auto-rebuilt when the built-in rule set is updated.
    // Rule edits call save() without arguments; profile switches, duplicate and delete pass true.
    if (!imm && !$('#tab-rules').hidden) profile().edited = true;
    const r = origSave(imm);
    if (!$('#tab-test').hidden) renderTest();
    return r;
  };

  $('#version').textContent = 'PlayFit v' + chrome.runtime.getManifest().version;
  renderPresets();
  fillWizard(profile().answers || RR.PRESETS[0].answers);
  renderAll();
  // #backup was the old home of export/import.
  const tabOf = (hash) => { const t = hash.slice(1) === 'backup' ? 'profiles' : hash.slice(1); return $('#tab-' + t) ? t : null; };
  showTab(tabOf(location.hash || '') || 'setup');
  addEventListener('hashchange', () => { const t = tabOf(location.hash); if (t) showTab(t); });
})();
