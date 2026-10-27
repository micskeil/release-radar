/*
 * PlayFit — default profiles and the setup-wizard profile builder.
 * buildProfile(answers) turns a handful of "what can your gear play" answers
 * into a full rule profile, which the user can then fine-tune in the editor.
 */
(function (root) {
  'use strict';

  const LANGUAGES = {
    HUN: { name: 'Hungarian', keywords: 'HUN, Hungarian, Magyar' },
    ENG: { name: 'English', keywords: 'ENG, English' },
    RUS: { name: 'Russian', keywords: 'RUS, Russian, Dub, MVO, DVO' },
    UKR: { name: 'Ukrainian', keywords: 'UKR, Ukrainian' },
    GER: { name: 'German', keywords: 'GER, German, Deutsch' },
    FRE: { name: 'French', keywords: 'FRE, French, TrueFrench, VFF, VFQ' },
    SPA: { name: 'Spanish', keywords: 'SPA, Spanish, Castellano, Latino' },
    ITA: { name: 'Italian', keywords: 'ITA, Italian' },
    POL: { name: 'Polish', keywords: 'POL, Polish, PLDUB' },
    CZE: { name: 'Czech', keywords: 'CZE, Czech, CZ' },
    SLO: { name: 'Slovak', keywords: 'SLO, Slovak, SK' },
    ROM: { name: 'Romanian', keywords: 'ROM, RUM, Romanian' },
    DUT: { name: 'Dutch', keywords: 'DUT, Dutch, NL' },
    POR: { name: 'Portuguese', keywords: 'POR, Portuguese, PT-BR, Dublado' },
    TUR: { name: 'Turkish', keywords: 'TUR, Turkish' },
    JPN: { name: 'Japanese', keywords: 'JPN, Japanese' },
    KOR: { name: 'Korean', keywords: 'KOR, Korean' },
    HIN: { name: 'Hindi', keywords: 'HIN, Hindi' },
  };

  const DEFAULT_AVOID_GROUPS = 'QxR, Tigole, YTS, YIFY, PSA, MeGusta, GalaxyRG, GalaxyTV, RARBG, ION10, EVO, AFG';

  const DDP_ATMOS =
    'DDP5.1 Atmos, DDP7.1 Atmos, DDP Atmos, DDPA5.1, DDPA, DD+5.1 Atmos, DD+7.1 Atmos, DD+ Atmos, ' +
    'EAC3 Atmos, EAC3 5.1 Atmos, E-AC3 Atmos, E-AC-3 Atmos, Atmos DDP5.1, Atmos DDP, Atmos DD+, Atmos EAC3';
  const TRUEHD_ATMOS = 'TrueHD & Atmos';
  const TRUEHD = 'TrueHD';
  const DTSX = 'DTS:X, DTS-X, DTSX';
  const DTSHD = 'DTS-HD MA, DTS-HD, DTSHD, DTS-MA, DTS MA';
  const DDP = 'DDP5.1, DDP7.1, DDP2.0 & !5.1, DDP, DD+5.1, DD+7.1, DD+, EAC3, E-AC3, E-AC-3';
  const AC3 = 'DD5.1, DD 5.1, AC3, AC-3, DD';
  const DTS = 'DTS';
  const LOSSLESS_MC = 'FLAC & 5.1, FLAC & 7.1, LPCM, PCM';
  const LOSSY_OTHER = 'AAC, Opus, MP3, Vorbis, FLAC';

  function opt(label, pattern, rating, note) {
    return note ? { label, pattern, rating, note } : { label, pattern, rating };
  }

  function audioOptions(mode) {
    switch (mode) {
      case 'full-atmos':
        return [
          opt('DD+ Atmos', DDP_ATMOS, 'perfect', 'Real Atmos (lossy, small)'),
          opt('TrueHD Atmos', TRUEHD_ATMOS, 'perfect', 'Lossless Atmos, passed through by your player'),
          opt('DTS:X', DTSX, 'perfect', 'Object audio, passed through by your player'),
          opt('TrueHD', TRUEHD, 'ok', 'Lossless 5.1/7.1, no Atmos'),
          opt('DTS-HD MA', DTSHD, 'ok', 'Lossless 5.1/7.1'),
          opt('Atmos (codec not stated)', 'Atmos', 'perfect', 'Atmos tagged, codec unknown'),
          opt('DD+ 5.1/7.1', DDP, 'ok', 'Surround, no Atmos'),
          opt('Dolby Digital / AC3', AC3, 'ok', 'Baseline 5.1 surround'),
          opt('DTS', DTS, 'ok', 'DTS 5.1'),
          opt('Lossless multichannel', LOSSLESS_MC, 'ok', 'PCM over HDMI, large'),
          opt('AAC / Opus / MP3 / FLAC', LOSSY_OTHER, 'bad', 'Re-encoded, often stereo'),
        ];
      case 'surround':
        return [
          opt('DD+ Atmos', DDP_ATMOS, 'perfect', 'Plays as DD+ 5.1/7.1'),
          opt('TrueHD', TRUEHD, 'ok', 'Lossless, large; plays as 5.1/7.1'),
          opt('DTS:X / DTS-HD', DTSX + ', ' + DTSHD, 'ok', 'Lossless, large; DTS core plays'),
          opt('Atmos (codec not stated)', 'Atmos', 'perfect', 'Plays as 5.1/7.1'),
          opt('DD+ 5.1/7.1', DDP, 'perfect', 'Surround'),
          opt('Dolby Digital / AC3', AC3, 'perfect', 'Surround'),
          opt('DTS', DTS, 'perfect', 'Surround'),
          opt('Lossless multichannel', LOSSLESS_MC, 'ok', 'Large'),
          opt('AAC 5.1', 'AAC & 5.1, AAC5.1', 'ok', 'Surround, re-encoded'),
          opt('AAC / Opus / MP3', LOSSY_OTHER, 'bad', 'Usually stereo'),
        ];
      case 'stereo':
        return [
          opt('AAC / Opus', 'AAC, Opus', 'perfect', 'Small, plays everywhere'),
          opt('Dolby / DTS', [DDP_ATMOS, DDP, AC3, DTS].join(', '), 'perfect', 'Downmixed by your device'),
          opt('Lossless / TrueHD / DTS-HD', [TRUEHD, DTSX, DTSHD, LOSSLESS_MC].join(', '), 'ok', 'Huge for stereo playback'),
        ];
      case 'ddp-atmos':
      default:
        return [
          opt('DD+ Atmos', DDP_ATMOS, 'perfect', 'The only Atmos your player bitstreams (E-AC3 JOC)'),
          opt('TrueHD (Atmos)', TRUEHD, 'ok', 'Player cannot bitstream TrueHD: decoded to PCM, Atmos height lost. Only if nothing else'),
          opt('DTS:X', DTSX, 'ok', 'Only the lossy DTS 5.1 core reaches the receiver / soundbar'),
          opt('DTS-HD MA', DTSHD, 'ok', 'Only the lossy DTS 5.1 core reaches the receiver / soundbar'),
          opt('Atmos (codec not stated)', 'Atmos', 'perfect', 'Probably DD+ Atmos; verify E-AC-3 JOC in MediaInfo'),
          opt('DD+ 5.1/7.1', DDP, 'ok', 'Proper surround, no Atmos'),
          opt('Dolby Digital / AC3', AC3, 'ok', 'Baseline 5.1 surround'),
          opt('DTS', DTS, 'ok', 'DTS 5.1 passes as core'),
          opt('Lossless multichannel', LOSSLESS_MC, 'ok', 'Lossless but 3x size, no Atmos'),
          opt('AAC / Opus / MP3 / FLAC', LOSSY_OTHER, 'bad', 'No Dolby bitstream, often 2.0 downmix'),
        ];
    }
  }

  function hdrOptions(hdr, server) {
    const DVHDR = 'DV & HDR, DoVi & HDR, Dolby Vision & HDR, DV & HDR10, DV & HLG';
    const DV = 'DV, DoVi, Dolby Vision, DOVI';
    const HDR10P = 'HDR10+, HDR10Plus, HDR10P';
    const HDR = 'HDR10, HDR, HDR10Bit, UHD BluRay & !SDR';
    if (hdr === 'sdr') {
      return [
        opt('Dolby Vision only', 'DV & !HDR, DoVi & !HDR, Dolby Vision & !HDR', 'bad', 'Wrong colours on non-HDR screens'),
        opt('HDR / DV+HDR', [DVHDR, HDR10P, HDR, 'HLG'].join(', '), 'ok', 'Needs HDR to SDR tone-mapping (server transcode)'),
        opt('SDR', 'SDR', 'perfect'),
      ];
    }
    if (hdr === 'hdr10') {
      return [
        opt('DV + HDR10', DVHDR, 'perfect', 'Plays as HDR10 on your screen'),
        opt('HDR10+', HDR10P, 'perfect', 'HDR10 base layer'),
        opt('HDR10', HDR, 'perfect'),
        opt('Dolby Vision only', DV, 'bad', 'No HDR10 base: green/purple picture without DV support'),
        opt('HLG', 'HLG', 'ok'),
        opt('SDR', 'SDR', 'ok', 'No HDR'),
      ];
    }
    return [
      opt('DV + HDR10', DVHDR, 'perfect', 'Dolby Vision with HDR10 fallback (P8.1 in WEB/encodes)'),
      opt('HDR10+', HDR10P, 'perfect', 'HDR10+ dynamic metadata may be ignored; HDR10 still works'),
      opt('HDR10', HDR, 'perfect'),
      server === 'direct'
        ? opt('Dolby Vision only', DV, 'perfect', 'WEB = profile 5: plays natively, your server direct-plays it')
        : opt('Dolby Vision only', DV, 'ok', 'WEB = profile 5: fine natively, but no HDR10 fallback if the server transcodes'),
      opt('HLG', 'HLG', 'ok'),
      opt('SDR', 'SDR', 'ok', 'No HDR'),
    ];
  }

  function splitList(s) {
    return String(s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  }

  /**
   * answers = {
   *   name, maxRes: '2160p'|'1080p', hdr: 'dv'|'hdr10'|'sdr', dvP7: bool,
   *   server: 'direct'|'transcode' (Jellyfin/Plex/Emby direct-plays to this player, or may transcode),
   *   audio: 'ddp-atmos'|'full-atmos'|'surround'|'stereo',
   *   av1: bool, hi10: bool, langs: ['HUN', ...], requireLang: bool,
   *   remux: 'perfect'|'ok'|'bad', avoidGroups: 'A, B', preferGroups: 'C, D'
   * }
   */
  function buildProfile(answers) {
    const a = Object.assign({}, PRESETS[0].answers, answers || {});
    const is4k = a.maxRes !== '1080p';
    const cats = [];

    cats.push({
      id: 'resolution', name: 'Resolution', whenMissing: 'ok', missingNote: 'Resolution not in name',
      options: is4k
        ? [
            opt('2160p / 4K', '2160p, 4K, UHD', 'perfect'),
            opt('1080p', '1080p', 'ok', 'Full HD, not 4K'),
            opt('720p', '720p', 'bad', 'Soft on a big 4K screen'),
            opt('SD', '480p, 576p, 360p, SD, DVDRip, XviD, DivX', 'bad', 'Standard definition'),
          ]
        : [
            opt('1080p', '1080p', 'perfect'),
            opt('2160p / 4K', '2160p, 4K, UHD', 'ok', 'More than your screen shows; large, may transcode'),
            opt('720p', '720p', 'ok'),
            opt('SD', '480p, 576p, 360p, SD, DVDRip, XviD, DivX', 'bad', 'Standard definition'),
          ],
    });

    cats.push({
      id: 'source', name: 'Source', whenMissing: 'ok', missingNote: 'Source not in name',
      options: [
        opt('CAM / TS / Screener', 'CAM, HDCAM, TS, HDTS, TELESYNC, TC, HDTC, TELECINE, SCR, SCREENER, DVDSCR, PDVD', 'bad', 'Recorded in a cinema or pre-release copy'),
        opt('Full disc', 'BD25, BD50, BD66, BD100, BDMV, COMPLETE BLURAY, COMPLETE UHD BLURAY, ISO', a.remux === 'perfect' ? 'ok' : 'bad', 'Whole disc image (ISO / BDMV folder): most TV players cannot direct-play it'),
        opt('REMUX', 'REMUX, BDRemux, BD Remux', ['perfect', 'ok', 'bad'].includes(a.remux) ? a.remux : 'ok', 'Untouched disc: 30–90 GB, lossless audio'),
        opt('WEBRip / WEB-DLRip', 'WEBRip, WEB-Rip, WEB-DLRip, HDRip', 'ok', 'Re-encoded stream capture'),
        opt('WEB-DL', 'WEB-DL, WEBDL, WEB', 'perfect', 'Streaming-service master'),
        opt('BRRip', 'BRRip, BDRip', 'ok', 'Re-encode of a BluRay, quality varies'),
        opt('BluRay encode', 'BluRay, Blu-Ray, UHD BluRay', 'perfect'),
        opt('HDTV', 'HDTV, PDTV, DSR', 'ok', 'Broadcast capture'),
        opt('DVD', 'DVDRip, DVD, DVD5, DVD9, DVD-5, DVD-9, NTSC, PAL', 'bad', 'Standard definition'),
      ],
    });

    const codecOpts = [];
    codecOpts.push(opt('H.264 10-bit', 'x264 & 10bit, H264 & 10bit, AVC & 10bit, Hi10P, Hi10', a.hi10 ? 'ok' : 'bad', 'No hardware decode on most TV players: transcode'));
    codecOpts.push(opt('HEVC / H.265', 'x265, H265, H.265, HEVC', 'perfect'));
    codecOpts.push(opt('AV1', 'AV1', a.av1 ? 'ok' : 'bad', a.av1 ? 'Decodes, less battle-tested than HEVC' : 'Your player has no AV1 decoder'));
    codecOpts.push(opt('H.264', 'x264, H264, H.264, AVC', 'ok', is4k ? 'Fine for 1080p, no HDR' : 'Plays everywhere'));
    codecOpts.push(opt('Old codecs', 'VC-1, VC1, MPEG-2, MPEG2, XviD, DivX, WMV', 'bad', 'Forces a server transcode'));
    if (!is4k) codecOpts[1] = opt('HEVC / H.265', 'x265, H265, H.265, HEVC', 'perfect', 'Smaller than H.264');
    if (!is4k) codecOpts[3] = opt('H.264', 'x264, H264, H.264, AVC', 'perfect');
    cats.push({ id: 'codec', name: 'Video codec', whenMissing: 'ignore', options: codecOpts });

    cats.push({
      id: 'hdr', name: 'HDR', whenMissing: a.hdr === 'sdr' ? 'ignore' : 'ok', missingNote: 'No HDR tag: SDR',
      options: hdrOptions(a.hdr, a.server),
    });

    cats.push({
      id: 'audio', name: 'Audio', whenMissing: a.audio === 'stereo' ? 'ignore' : 'ok',
      missingNote: 'Audio codec not in name: check MediaInfo/NFO',
      options: audioOptions(a.audio),
    });

    const langs = (a.langs || []).filter((l) => LANGUAGES[l] || l);
    if (langs.length) {
      const langOpts = [];
      if (langs.includes('HUN')) langOpts.push(opt('Hungarian subs only', 'HUNSUB, HUN SUB', 'ok', 'Subtitles, not a dub'));
      for (const code of langs) {
        const L = LANGUAGES[code];
        langOpts.push(opt(L ? L.name : code, L ? L.keywords : code, 'perfect', 'Preferred language'));
      }
      langOpts.push(opt('Multi / Dual audio', 'MULTi, Dual Audio, DUAL', 'ok', 'Several audio tracks: check which'));
      cats.push({
        id: 'language', name: 'Language', whenMissing: a.requireLang ? 'ok' : 'ignore',
        missingNote: 'No preferred language in name', options: langOpts,
      });
    }

    const groupOpts = [];
    const avoid = splitList(a.avoidGroups);
    const prefer = splitList(a.preferGroups);
    if (avoid.length) groupOpts.push(opt('Avoided group', avoid.join(', '), 'bad', 'Known for small re-encodes with AAC/stereo audio'));
    if (prefer.length) groupOpts.push(opt('Trusted group', prefer.join(', '), 'perfect'));
    if (groupOpts.length) cats.push({ id: 'group', name: 'Release group', whenMissing: 'ignore', options: groupOpts });

    const risks = [];
    if (!a.dvP7 && a.hdr !== 'sdr') {
      risks.push(opt('REMUX + Dolby Vision', 'REMUX & DV, REMUX & DoVi, REMUX & Dolby Vision, BDRemux & DV, BDRemux & DoVi, BDRemux & Dolby Vision, BDMV & DV, BDMV & Dolby Vision, BD25 & DV, BD25 & DoVi, BD25 & Dolby Vision, BD50 & DV, BD50 & DoVi, BD50 & Dolby Vision, BD66 & DV, BD66 & DoVi, BD66 & Dolby Vision, BD100 & DV, BD100 & DoVi, BD100 & Dolby Vision', 'bad',
        'UHD BluRay DV is profile 7: black screen / no HDR10 fallback on most TV players'));
    }
    if (a.audio !== 'stereo') {
      risks.push(opt('Stereo only', '2.0 & !5.1 & !7.1, Stereo & !5.1 & !7.1, 2ch & !5.1 & !7.1', 'bad', 'No surround'));
    }
    risks.push(opt('Interlaced', '1080i, 576i, 480i, Interlaced', 'bad', 'Deinterlace transcode'));
    risks.push(opt('3D', '3D, SBS, HSBS, Half-SBS, Half-OU, MVC', 'bad', '3D version'));
    risks.push(opt('High frame rate', 'HFR, 120fps, 100fps, 96fps', 'bad', 'Above 60 fps: most TV players cannot output it'));
    risks.push(opt('Bad container', '.avi, .wmv, AVI', 'bad', 'Old container: remux/transcode'));
    cats.push({ id: 'risks', name: 'Risks', whenMissing: 'ignore', options: risks });

    return {
      id: a.id || 'p-' + Math.random().toString(36).slice(2, 9),
      name: a.name || 'My setup',
      answers: a,
      categories: cats,
    };
  }

  // Setup types by what the player chain can pass through, not by brand: pick the closest, then adjust.
  // Languages are left empty; the wizard asks for them.
  const PRESETS = [
    {
      key: 'ddp-atmos-streamer',
      title: 'Streaming box, DD+ Atmos only',
      description: 'Google TV Streamer, Chromecast, Apple TV 4K, Roku, Fire TV with the stock player. Real Atmos only from DD+; TrueHD and DTS-HD are downgraded.',
      answers: {
        name: 'Streaming box', maxRes: '2160p', hdr: 'dv', dvP7: false, server: 'transcode', audio: 'ddp-atmos',
        av1: false, hi10: false, langs: [], requireLang: false, remux: 'ok',
        avoidGroups: DEFAULT_AVOID_GROUPS, preferGroups: '',
      },
    },
    {
      key: 'lg-tv-app',
      title: 'LG TV app (Jellyfin / Plex on webOS)',
      description: 'Dolby Vision and HDR10 play natively; DD+ Atmos goes to the soundbar over eARC. TrueHD is not bitstreamed from TV apps.',
      answers: {
        name: 'LG TV', maxRes: '2160p', hdr: 'dv', dvP7: false, server: 'transcode', audio: 'ddp-atmos',
        av1: true, hi10: false, langs: [], requireLang: false, remux: 'ok',
        avoidGroups: DEFAULT_AVOID_GROUPS, preferGroups: '',
      },
    },
    {
      key: 'samsung-tv-app',
      title: 'Samsung TV app (Tizen)',
      description: 'HDR10 and HDR10+, no Dolby Vision: DV-only files show wrong colours. DD+ Atmos over eARC.',
      answers: {
        name: 'Samsung TV', maxRes: '2160p', hdr: 'hdr10', dvP7: false, server: 'transcode', audio: 'ddp-atmos',
        av1: true, hi10: false, langs: [], requireLang: false, remux: 'ok',
        avoidGroups: DEFAULT_AVOID_GROUPS, preferGroups: '',
      },
    },
    {
      key: 'full-passthrough',
      title: 'Full passthrough: Shield, Ugoos/CoreELEC, HTPC + AV receiver',
      description: 'TrueHD Atmos, DTS:X and Dolby Vision profile 7 all play. REMUX is welcome.',
      answers: {
        name: 'Full passthrough', maxRes: '2160p', hdr: 'dv', dvP7: true, server: 'direct', audio: 'full-atmos',
        av1: false, hi10: false, langs: [], requireLang: false, remux: 'perfect',
        avoidGroups: DEFAULT_AVOID_GROUPS, preferGroups: '',
      },
    },
    {
      key: '1080-surround',
      title: '1080p TV + 5.1 system',
      description: 'No HDR, no Atmos. Small, compatible files.',
      answers: {
        name: '1080p + 5.1', maxRes: '1080p', hdr: 'sdr', dvP7: false, server: 'transcode', audio: 'surround',
        av1: false, hi10: false, langs: [], requireLang: false, remux: 'bad',
        avoidGroups: 'YTS, YIFY, GalaxyRG', preferGroups: '',
      },
    },
    {
      key: 'stereo',
      title: 'TV speakers / laptop / headphones (stereo)',
      description: 'Audio format barely matters; favours small files.',
      answers: {
        name: 'Stereo', maxRes: '1080p', hdr: 'hdr10', dvP7: false, server: 'transcode', audio: 'stereo',
        av1: true, hi10: false, langs: [], requireLang: false, remux: 'bad',
        avoidGroups: '', preferGroups: '',
      },
    },
  ];

  const DEFAULT_DISPLAY = { colorText: true, showDot: true, tintRows: true, dimBad: true, markBest: true };

  // Bump when buildProfile() output changes; unedited profiles are rebuilt from their answers on load.
  const RULES_VERSION = 4;

  function defaultSettings() {
    const p1 = buildProfile(Object.assign({ id: 'p-default' }, PRESETS[0].answers, { name: 'My setup' }));
    return { version: 1, rulesVersion: RULES_VERSION, activeProfileId: p1.id, profiles: [p1], sites: [], scopes: {}, display: Object.assign({}, DEFAULT_DISPLAY), setupDone: false };
  }

  const presetAnswers = (key) => (PRESETS.find((p) => p.key === key) || PRESETS[0]).answers;

  const api = { LANGUAGES, PRESETS, presetAnswers, DEFAULT_AVOID_GROUPS, DEFAULT_DISPLAY, RULES_VERSION, buildProfile, defaultSettings };
  root.ReleaseRadar = Object.assign(root.ReleaseRadar || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
