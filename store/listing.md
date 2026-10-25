# Chrome Web Store listing — Release Radar

## Name
Release Radar

## Summary (≤132 chars)
See at a glance which video release plays perfectly on your TV, player and sound system — Dolby Vision, HDR, Atmos and more.

## Category
Tools

## Description
Release names like `Movie.2024.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265` pack a lot of format detail — but whether a given file actually plays well depends on your own gear. A streaming box that can't bitstream TrueHD loses Atmos; a TV without Dolby Vision shows wrong colours on DV-only files; some players can't handle Dolby Vision profile 7 at all.

Release Radar reads release names on any web page and colour-codes them against a profile of your setup:

● Green — every format is a perfect fit
● Yellow — plays, but something isn't ideal (1080p on a 4K screen, no Atmos, codec not stated…)
● Red — won't play properly (stereo only, unsupported codec, interlaced, 3D, disc image…)
★ BEST — the top-rated release of each title on the page

Hover a name for a per-category breakdown (resolution, source, codec, HDR, audio, language, risks).

FEATURES
• Setup wizard with presets: DD+-Atmos-only streaming boxes (Google TV, Apple TV, Roku, Fire TV), LG and Samsung TV apps, full-passthrough players (Shield, CoreELEC, HTPC + receiver), 1080p + 5.1, stereo
• Fully editable rules with a simple pattern syntax, live test box
• Preferred audio languages, release groups to prefer or avoid
• Multiple profiles (e.g. one per room), switch from the toolbar
• Best release per title, with an explanation when nothing is a perfect match
• Works on any layout: tables, lists, grids — nothing is inserted into the page

PRIVACY
No data collection, no network requests, no account. Sites are only read when you scan them or enable auto-scan for them; access is requested per site and can be revoked any time. Open source (MIT).

## Single purpose
Rates video release names shown on web pages against the user's own playback setup and colour-codes them.

## Permission justifications
- **storage**: Saves the user's profiles, rules, site list and display options locally.
- **activeTab**: Lets the user scan the current page from the toolbar button without granting broad access.
- **scripting**: Injects the rating script and styles into the current page when the user clicks "Scan", and registers auto-scan for sites the user enabled.
- **Host permissions (optional, `*://*/*`)**: Requested at runtime for one site at a time, only when the user turns on "Always scan <site>". Needed so those pages are rated automatically on load. Nothing is requested at install.
- **Remote code**: None. All code ships in the package.

## Data usage (tick in dashboard)
Does not collect any user data. Certify: not sold to third parties; not used for unrelated purposes; not used for creditworthiness/lending.

## Privacy policy URL
https://github.com/micskeil/release-radar/blob/main/store/PRIVACY.md

## Assets checklist
- [x] Icon 128×128 — icons/icon128.png
- [x] Screenshots 1280×800 — store/screenshots/1-page.png, 2-tooltip.png, 3-setup.png (rendered from store/demo.html)
- [ ] Small promo tile 440×280 (optional)
- Wording: keep screenshots and text neutral; no tracker/site names.
