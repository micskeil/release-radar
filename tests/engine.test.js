const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const D = require('../src/defaults.js');

// The author's setup: DD+ Atmos-only streamer, Hungarian dubs preferred.
const living = D.buildProfile(Object.assign({}, D.presetAnswers('ddp-atmos-streamer'), { av1: true, langs: ['HUN'] }));
const shield = D.buildProfile(D.presetAnswers('full-passthrough'));
const v = (name, p = living) => E.evaluate(name, p).verdict;

test('keyword separators and boundaries', () => {
  const m = E.compilePattern('WEB-DL, H.265');
  assert.ok(m('Foo.2024.WEBDL.x'));
  assert.ok(m('Foo 2024 WEB DL'));
  assert.ok(m('Foo.H265-GRP'));
  assert.equal(E.compilePattern('DV')('Movie.DVDRip'), null);
  assert.ok(E.compilePattern('2.0')('Movie.AAC2.0-GRP'));
  assert.equal(E.compilePattern('2.0')('Blade.Runner.2049'), null);
  assert.ok(E.compilePattern('HDR')('Movie.HDR10.x265'));
  assert.ok(E.compilePattern('REMUX & DV')('X.2160p.UHD.BluRay.REMUX.DV.HDR'));
  assert.equal(E.compilePattern('2.0 & !5.1')('X.DDP5.1.AAC2.0'), null);
  assert.ok(E.compilePattern('/ddp?5\\.1/')('x.DDP5.1.y'));
  assert.ok(E.patternError('/(/'));
});

test('living-room profile verdicts', () => {
  const cases = [
    ['Dune.Part.Two.2024.2160p.MA.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265.HUN.ENG-PTHD', 'perfect'],
    ['Dune.Part.Two.2024.2160p.MA.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX', 'perfect'],
    ['Oppenheimer.2023.2160p.UHD.BluRay.x265.10bit.HDR.DDP5.1.Atmos-GRP', 'perfect'],
    ['Andor.S02.2160p.DSNP.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX', 'perfect'],
    ['Dune.Part.Two.2024.1080p.WEB-DL.DDP5.1.Atmos.H.264-FLUX', 'ok'],
    ['Dune.Part.Two.2024.2160p.UHD.BluRay.REMUX.DV.HDR10.HEVC.TrueHD.7.1.Atmos-FraMeSToR', 'bad'],
    ['Dune.Part.Two.2024.2160p.UHD.BluRay.x265.HDR.TrueHD.7.1.Atmos-GRP', 'ok'],
    ['Dune Part Two (2024) (1080p BluRay x265 HEVC 10bit AAC 7.1 Tigole)', 'bad'],
    ['Dune.Part.Two.2024.1080p.WEBRip.x264.AAC5.1-YTS.MX', 'bad'],
    ['Dune.Part.Two.2024.720p.WEB-DL.DDP5.1.H.264', 'bad'],
    ['Dune.Part.Two.2024.HDCAM.x264-GRP', 'bad'],
    ['Old.Film.1999.1080p.BluRay.DTS.x264-GRP', 'ok'],
    ['Old.Film.1999.1080p.BluRay.DD2.0.x264-GRP', 'bad'],
    ['Anime.S01.1080p.BluRay.x264.10bit.FLAC', 'bad'],
    ['Show.S01.1080i.HDTV.AC3.MPEG2', 'bad'],
  ];
  for (const [name, want] of cases) assert.equal(v(name), want, name + ' -> ' + JSON.stringify(E.evaluate(name, living).results.map(r => [r.category, r.label, r.rating])));
});

test('shield profile accepts TrueHD Atmos remux', () => {
  assert.equal(v('Dune.Part.Two.2024.2160p.UHD.BluRay.REMUX.DV.HDR10.HEVC.TrueHD.7.1.Atmos-FraMeSToR', shield), 'perfect');
});

test('HUN scores higher than non-HUN', () => {
  const a = E.evaluate('Dune.2021.2160p.MA.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265.HUN.ENG-PTHD', living).score;
  const b = E.evaluate('Dune.2021.2160p.MA.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX', living).score;
  assert.ok(a > b);
});

test('looksLikeRelease', () => {
  for (const t of ['Dune.Part.Two.2024.2160p.WEB-DL.DDP5.1.Atmos', 'Dune Part Two 2024 1080p WEBRip x264', 'Show.S01E02.Title.HDTV', 'Movie (2024) 2160p'])
    assert.ok(E.looksLikeRelease(t), t);
  for (const t of ['Super.Mario.Galaxy.1&2.WII.for.PC.REPACK-KaOs', 'Mario.Kart.7.3DS.for.PC-KaOs', 'Artist - Album (2020) [FLAC]', 'Download torrents', 'Browse movies on the web today', 'Uploaded 2024-03-01 by someone', 'Home'])
    assert.ok(!E.looksLikeRelease(t), t);
});

test('long descriptive titles (rutracker) are detected only in loose mode', () => {
  const ru = 'Супер Марио: Галактическое кино / The Super Mario Galaxy Movie (Аарон Хорват, Майкл Елник / Aaron Horvath, Michael Jelenic) [2026, США, Япония, мультфильм, фэнтези, комедия, приключения, семейный, WEB-DL 2160p, HDR10, Dolby Vision] Dub + Original (Eng) + Sub (Rus, Eng)';
  assert.ok(E.looksLikeRelease(ru, { loose: true }));
  assert.ok(!E.looksLikeRelease(ru));
  const rus = D.buildProfile(Object.assign({}, D.presetAnswers('ddp-atmos-streamer'), { langs: ['RUS'] }));
  const r = E.evaluate(ru, rus);
  const by = Object.fromEntries(r.results.map((x) => [x.categoryId, x.label]));
  assert.equal(by.resolution, '2160p / 4K');
  assert.equal(by.source, 'WEB-DL');
  assert.equal(by.hdr, 'DV + HDR10');
  assert.equal(by.language, 'Russian');
  assert.equal(E.evaluate('Movie (2026) WEB-DLRip 1080p | Dub', rus).results.find((x) => x.categoryId === 'source').label, 'WEBRip / WEB-DLRip');
});

test('rutracker: disc remux with Dolby Vision is red, NTSC DVD is red, games/music ignored', () => {
  const rus = D.buildProfile(Object.assign({}, D.presetAnswers('ddp-atmos-streamer'), { langs: ['RUS'] }));
  const pre = 'Супер Марио: Галактическое кино / The Super Mario Galaxy Movie (Аарон Хорват / Aaron Horvath) [2026, Япония, США, мультфильм, ';
  assert.equal(E.evaluate(pre + 'UHD BDRemux 2160p, HDR10, HDR10+, Dolby Vision] [Hybrid] Dub + 2x MVO + Original (Eng)', rus).verdict, 'bad');
  const dvd = pre + 'DTS-HD MA, NTSC] Dub (ПроДубляж)';
  assert.ok(E.looksLikeRelease(dvd, { loose: true }));
  assert.equal(E.evaluate(dvd, rus).verdict, 'bad');
  for (const t of ['Super Mario Galaxy 1+2 [NSZ][RUS (Mod.)/ENG]', 'Super Mario Galaxy [PAL][MULTI5]', 'Super Mario Galaxy 2 [NTSC]',
    'Mario Galaxy Orchestra - Super Mario Galaxy: Original Sound Track (Mahito Yokota) - 2008 / 2010, MP3, 320 kbps'])
    assert.ok(!E.looksLikeRelease(t, { loose: true }), t);
});

test('full disc BD50 is its own source and a DV disc risk', () => {
  const r = E.evaluate('The.Hobbit.An.Unexpected.Journey.2012.Extended.UHD.BD50.HDR10+DV.Atmos.7.1.HUN.x265-TRiNiTY', living);
  assert.equal(r.results.find((c) => c.categoryId === 'source').label, 'Full disc');
  assert.equal(r.results.find((c) => c.categoryId === 'risks').label, 'REMUX + Dolby Vision');
  assert.equal(r.verdict, 'bad');
  assert.equal(E.evaluate('Movie.2020.1080p.BluRay.x264-GRP', living).results.find((c) => c.categoryId === 'source').label, 'BluRay encode');
});

test('titleOf groups releases of the same title', () => {
  const hobbit = 'the hobbit an unexpected journey';
  assert.equal(E.titleOf('The.Hobbit.An.Unexpected.Journey.2012.Extended.2160p.MA.WEB-DL.TrueHD.Atmos.7.1.H.265.HuN-GOODWILL'), hobbit);
  assert.equal(E.titleOf('The.Hobbit.An.Unexpected.Journey.Extended.Edition.2012.1080p.CEE.BluRay.AVC.DTS-HD.MA.7.1-DVDSEED'), hobbit);
  assert.equal(E.titleOf('The.Hobbit.An.Unexpected.Journey.2012.EE.RPCK.2160p.UHD.BluRay.REMUX'), hobbit);
  assert.equal(E.titleOf('Severance.S02E05.2160p.ATVP.WEB-DL.DDP5.1.Atmos-FLUX'), 'severance s02');
  assert.equal(E.titleOf('Severance S02 1080p WEB-DL'), 'severance s02');
  assert.equal(E.titleOf('1917.2019.2160p.WEB-DL'), '1917');
  assert.equal(E.titleOf('Хоббит / The Hobbit (Питер Джексон) [2012, WEB-DL 2160p]'), 'хоббит the hobbit');
});

test('presets are generic and build valid profiles', () => {
  for (const p of D.PRESETS) {
    assert.deepEqual(p.answers.langs, [], p.key);
    const prof = D.buildProfile(p.answers);
    for (const c of prof.categories) for (const o of c.options) assert.equal(E.patternError(o.pattern), null, `${p.key}/${c.id}/${o.label}`);
  }
  const samsung = D.buildProfile(D.presetAnswers('samsung-tv-app'));
  assert.equal(E.evaluate('Movie.2024.2160p.WEB-DL.DDP5.1.Atmos.DV.H.265-GRP', samsung).verdict, 'bad');
  assert.equal(D.defaultSettings().profiles.length, 1);
});
