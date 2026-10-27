/*
 * PlayFit — rule engine.
 * Pure functions, no DOM. Loaded as a classic script in content scripts,
 * popup and options page, and via require() in Node tests.
 *
 * Profile shape:
 * {
 *   id, name,
 *   categories: [{
 *     id, name,
 *     whenMissing: 'ignore' | 'ok' | 'bad',
 *     missingNote?: string,
 *     options: [{ label, pattern, rating: 'perfect' | 'ok' | 'bad', note? }]
 *   }]
 * }
 *
 * Pattern syntax (per option):
 *   - Comma separated alternatives:            "DDP5.1 Atmos, DDPA5.1, EAC3 Atmos"
 *   - '&' = all terms must be present:         "REMUX & DV"
 *   - '!' prefix = term must NOT be present:   "2.0 & !5.1 & !7.1"
 *   - Separators inside a keyword are loose:   "WEB-DL" matches WEB-DL, WEBDL, WEB.DL, WEB DL
 *   - Whole pattern wrapped in /.../ is a raw case-insensitive regex.
 *
 * Within a category the FIRST matching option wins, so put specific options
 * (e.g. "DDP5.1 Atmos") above general ones (e.g. "DDP5.1").
 *
 * Verdict: any category rated 'bad' -> bad (red).
 *          every non-ignored category 'perfect' -> perfect (green).
 *          otherwise -> ok (yellow).
 */
(function (root) {
  'use strict';

  const SEP = '[\\s._\\-]?';
  const RATING_SCORE = { perfect: 3, ok: 1, bad: -10 };
  const RATINGS = ['perfect', 'ok', 'bad'];

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  }

  /** Turn one keyword into a regex source with loose separators and smart boundaries. */
  function keywordSource(kw) {
    const parts = kw
      .split(/[\s._\-]+/)
      .filter(Boolean)
      .flatMap((p) => p.split(/(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])/i));
    if (!parts.length) return null;
    const body = parts.map(escapeRe).join(SEP);
    const first = kw.trim()[0];
    const last = kw.trim().slice(-1);
    // A keyword starting with a digit may follow letters ("AAC2.0"), but not digits.
    // A keyword starting with a letter may follow digits ("1080pHDR"), but not letters.
    const lead = /\d/.test(first) ? '(?<!\\d)' : /[a-z]/i.test(first) ? '(?<![a-z])' : '';
    const trail = /\d/.test(last) ? '(?!\\d)' : /[a-z]/i.test(last) ? '(?![a-z])' : '';
    return lead + body + trail;
  }

  /**
   * Compile a pattern string into a matcher: (name) => matchedText | null.
   * Throws on invalid regex so the options page can show the error.
   */
  function compilePattern(pattern) {
    const p = String(pattern || '').trim();
    if (!p) return () => null;

    const rx = /^\/(.+)\/([a-z]*)$/s.exec(p);
    if (rx) {
      const flags = rx[2].includes('i') ? rx[2] : rx[2] + 'i';
      const re = new RegExp(rx[1], flags.replace(/g/g, ''));
      return (name) => {
        const m = re.exec(name);
        return m ? (m[0] || name).trim() || name : null;
      };
    }

    const alternatives = p
      .split(',')
      .map((alt) => alt.trim())
      .filter(Boolean)
      .map((alt) => {
        const terms = alt
          .split('&')
          .map((t) => t.trim())
          .filter(Boolean)
          .map((t) => {
            const neg = t.startsWith('!');
            const src = keywordSource(neg ? t.slice(1) : t);
            return src ? { neg, re: new RegExp(src, 'i') } : null;
          })
          .filter(Boolean);
        return terms;
      })
      .filter((terms) => terms.length);

    return (name) => {
      for (const terms of alternatives) {
        let hit = null;
        let ok = true;
        for (const t of terms) {
          const m = t.re.exec(name);
          if (t.neg ? m : !m) { ok = false; break; }
          if (!t.neg && !hit) hit = m[0];
        }
        if (ok) return hit || name;
      }
      return null;
    };
  }

  /** Validate a pattern; returns null if fine, else an error message. */
  function patternError(pattern) {
    try { compilePattern(pattern); return null; } catch (e) { return e.message; }
  }

  const compiledCache = new WeakMap();

  function compileProfile(profile) {
    let c = compiledCache.get(profile);
    if (c) return c;
    c = (profile.categories || []).map((cat) => ({
      cat,
      options: (cat.options || []).map((opt) => {
        let match;
        try { match = compilePattern(opt.pattern); } catch (e) { match = () => null; }
        return { opt, match };
      }),
    }));
    compiledCache.set(profile, c);
    return c;
  }

  /** Rate one release name against a profile. */
  function evaluate(name, profile) {
    const results = [];
    let score = 0;
    let anyBad = false;
    let allPerfect = true;
    let counted = 0;

    for (const { cat, options } of compileProfile(profile)) {
      let found = null;
      for (const { opt, match } of options) {
        const m = match(name);
        if (m) { found = { opt, matched: m }; break; }
      }
      if (found) {
        const rating = RATINGS.includes(found.opt.rating) ? found.opt.rating : 'ok';
        results.push({
          categoryId: cat.id, category: cat.name, rating,
          label: found.opt.label, note: found.opt.note || '', matched: found.matched, missing: false,
        });
        score += RATING_SCORE[rating];
        counted++;
        if (rating === 'bad') anyBad = true;
        if (rating !== 'perfect') allPerfect = false;
      } else if (cat.whenMissing && cat.whenMissing !== 'ignore') {
        const rating = cat.whenMissing;
        results.push({
          categoryId: cat.id, category: cat.name, rating,
          label: 'not stated', note: cat.missingNote || '', matched: null, missing: true,
        });
        counted++;
        if (rating === 'bad') { anyBad = true; score += RATING_SCORE.bad; }
        allPerfect = false;
      }
    }

    const verdict = anyBad ? 'bad' : allPerfect && counted > 0 ? 'perfect' : 'ok';
    return { name, verdict, score, results };
  }

  // Tokens that only show up in release names. Two hits, or one hit plus a
  // dotted/underscored scene-style name, make a string "release-like".
  const HINT_RE = /(?<![a-z0-9])(2160p|1080p|1080i|720p|576p|480p|4k|uhd|web-?dlrip|hdrip|bdremux|dolby\s?vision|web-?dl|webrip|web|blu-?ray|bdrip|brrip|bd25|bd50|remux|hdtv|dvdrip|dvd9|dvd5|dvd-[59]|ntsc|pal|x26[45]|h\.?26[45]|hevc|avc|av1|xvid|divx|hdr10\+?|hdr|dv|dovi|ddp?\d|ddpa\d|e-?ac-?3|ac3|aac\d?|truehd|dts(?:-?hd)?|atmos|flac|opus|10bit|s\d{1,2}e\d{1,3}|s\d{1,2}|complete|proper|repack)(?![a-z0-9])/gi;

  const STRONG_RE = /^(2160p|1080p|1080i|720p|576p|480p|4k|uhd|web-?dlrip|hdrip|bdremux|web-?dl|webrip|blu-?ray|bdrip|brrip|bd25|bd50|remux|hdtv|dvdrip|dvd9|dvd5|x26[45]|h\.?26[45]|hevc|xvid|divx|s\d{1,2}e\d{1,3})$/;

  /**
   * Does this text look like a release name?
   * opts.loose: the text is a link or heading, so allow long descriptive titles such as
   * rutracker's "Title / Original (Director) [2026, ..., WEB-DL 2160p, HDR10, Dolby Vision] Dub + Original".
   */
  function looksLikeRelease(text, opts) {
    if (!text) return false;
    const loose = !!(opts && opts.loose);
    const t = text.trim();
    if (t.length < 12 || t.length > (loose ? 600 : 300)) return false;
    if ((t.match(/\s/g) || []).length > (loose ? 100 : 24)) return false;
    const hits = new Set((t.match(HINT_RE) || []).map((h) => h.toLowerCase()));
    if (hits.size >= 2) return true;
    if (hits.size === 1) {
      // A single tag only counts if it is clearly video (resolution, source, video codec, SxxEyy).
      // "REPACK", "WEB", "DV", "FLAC" alone are common in game and music names.
      const [only] = hits;
      if (!STRONG_RE.test(only)) return false;
      const dotted = (t.match(/[._]/g) || []).length >= 3 && !/\s/.test(t);
      const year = /(?<!\d)(19|20)\d{2}(?!\d)/.test(t);
      return dotted || year;
    }
    return false;
  }

  // Words between the title and the year that name a cut, not a different film.
  const EDITION_RE = /^(extended|edition|ee|directors?|cut|dc|unrated|uncut|remastered|theatrical|imax|special|ultimate|collectors?|anniversary|criterion|3d|rpck|repack|proper)$/i;

  /**
   * Movie / show title of a release name, for grouping releases of the same title.
   * "The.Hobbit.An.Unexpected.Journey.2012.Extended.2160p…" and
   * "The.Hobbit.An.Unexpected.Journey.Extended.Edition.2012.1080p…" → "the hobbit an unexpected journey".
   * Series keep their season: "Show.S02E05.1080p…" → "show s02". rutracker-style
   * "Title / Original (Director) [2026, …]" is cut at the first bracket.
   * Returns '' when no title can be found.
   */
  function titleOf(name) {
    const head = String(name || '').split(/[\[(]/)[0];
    const words = head.split(/[\s._]+/).filter(Boolean);
    const out = [];
    for (const w of words) {
      const lw = w.toLowerCase();
      const se = /^s(\d{1,2})(?:e\d{1,3})*$/i.exec(w);
      if (se) { if (out.length) out.push('s' + se[1].padStart(2, '0')); break; }
      if (out.length && /^(19|20)\d{2}$/.test(w)) break;
      if (STRONG_RE.test(lw) || (out.length && new RegExp('^' + HINT_RE.source + '$', 'i').test(w))) break;
      out.push(w);
    }
    while (out.length > 1 && EDITION_RE.test(out[out.length - 1])) out.pop();
    return out.join(' ').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Split a site entry typed by the user into host and optional page scope.
   * "www.example.org/browse?cat=movies" → { host: 'example.org', scope: '/browse?cat=movies' }.
   * "example.org" → { host: 'example.org', scope: '' }. Returns null for anything that isn't a domain.
   */
  function parseSite(input) {
    const m = /^([a-z0-9.-]+)(?::\d+)?([/?].*)?$/.exec(String(input || '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/#.*$/, ''));
    if (!m) return null;
    const host = m[1].replace(/^www\./, '');
    if (!/^[a-z0-9.-]+\.[a-z0-9-]+$/.test(host)) return null;
    let [path, query = ''] = (m[2] || '').split('?');
    path = path.replace(/\/+$/, '');
    query = query.split('&').filter(Boolean).join('&');
    return { host, scope: path + (query ? '?' + query : '') };
  }

  /**
   * Whether a URL falls inside any of a site's scopes. No scopes = the whole site.
   * Scope "/browse" matches /browse and anything below it (/browse/2), not /browser.
   * Scope "?cat" needs a cat parameter; "?cat=movies" needs that value. "/search?q" needs both.
   */
  function inScope(url, scopes) {
    if (!scopes || !scopes.length) return true;
    let u;
    try { u = new URL(url); } catch (_) { return false; }
    const path = u.pathname.toLowerCase().replace(/\/+$/, '');
    const params = [...u.searchParams].map(([k, v]) => [k.toLowerCase(), v.toLowerCase()]);
    return scopes.some((scope) => {
      const [p, q = ''] = scope.split('?');
      if (p && path !== p && !path.startsWith(p + '/')) return false;
      return q.split('&').filter(Boolean).every((pair) => {
        const i = pair.indexOf('=');
        if (i < 0) return params.some(([k]) => k === pair);
        return params.some(([k, v]) => k === pair.slice(0, i) && v === pair.slice(i + 1));
      });
    });
  }

  /**
   * A page URL as tickable scope parts, for building a scope from the page the user is on.
   * The path and the first parameter that isn't an item id start ticked.
   * "/torrents.php?action=details&id=4255192" →
   *   [{ part: '/torrents.php', on: true }, { part: 'action=details', on: true }, { part: 'id=4255192', on: false }]
   */
  function scopeParts(url) {
    const u = new URL(url);
    const out = [];
    const path = u.pathname.toLowerCase().replace(/\/+$/, '');
    if (path) out.push({ part: path, on: true });
    let picked = false;
    const seen = new Set();
    for (const [k, v] of u.searchParams) {
      const part = (v ? `${k}=${v}` : k).toLowerCase();
      if (!k || seen.has(part)) continue;
      seen.add(part);
      const idLike = /^[\d-]+$|^[0-9a-f]{12,}$/i.test(v);
      out.push({ part, on: !picked && !idLike });
      if (!idLike) picked = true;
    }
    return out;
  }

  /** Ticked scope parts → scope string ("/torrents.php?action=details"). */
  function scopeFromParts(parts) {
    const on = parts.filter((p) => p.on).map((p) => p.part);
    const path = on.find((p) => p.startsWith('/')) || '';
    const query = on.filter((p) => !p.startsWith('/')).join('&');
    return path + (query ? '?' + query : '');
  }

  /** Scope → plain words: "/torrents.php?action=details" → "torrents.php · action is details". */
  function describeScope(scope) {
    const [p, q = ''] = String(scope).split('?');
    const words = [];
    if (p) words.push(p.replace(/^\//, '') + (/\.\w+$/.test(p) ? '' : ' and below'));
    for (const pair of q.split('&').filter(Boolean)) {
      const i = pair.indexOf('=');
      words.push(i < 0 ? `has ${pair}` : `${pair.slice(0, i)} is ${pair.slice(i + 1)}`);
    }
    return words.join(' · ') || 'all pages';
  }

  const api = { evaluate, titleOf, compilePattern, patternError, keywordSource, looksLikeRelease, parseSite, inScope, scopeParts, scopeFromParts, describeScope, RATING_SCORE, RATINGS };
  root.ReleaseRadar = Object.assign(root.ReleaseRadar || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
