# Chrome Web Store listing — PlayFit

## Name
PlayFit – Release Format Checker

## Summary (≤132 chars)
See at a glance whether a video release’s resolution, HDR and audio formats suit your TV, player and sound system.

## Category
Tools

## Description
Release names like 2160p.WEB-DL.DDP5.1.Atmos.DV.H.265 pack in a lot of format detail. Whether a file actually plays well depends on your own gear. A streaming box that can’t bitstream TrueHD loses Atmos, a TV without Dolby Vision shows wrong colours on DV-only files, and some players can’t handle DV profile 7 at all.

PlayFit reads release names on any page and colour-codes them against a profile of your setup:

🟢 Perfect fit: every format matches your gear
🟡 Plays, not ideal: for example 1080p on a 4K screen, no Atmos, or codec not stated
🔴 Won’t play properly: stereo only, unsupported codec, interlaced, 3D or a disc image
★ BEST: the top-rated release for each title on the page

Hover any name to see a breakdown by resolution, source, codec, HDR, audio, language and risks.

FEATURES
• Setup wizard with presets for Google TV, Apple TV, Roku, Fire TV, LG and Samsung TV apps, Shield, CoreELEC, HTPC with receiver, 1080p 5.1, and stereo
• Editable rules with a simple pattern syntax and a live test box
• Preferred audio languages, plus release groups to favour or avoid
• Multiple profiles, such as one per room, switchable from the toolbar
• Auto-scan whole sites or only the pages you pick, such as a site’s details pages
• Picks the best release per title and explains why when nothing is a perfect match
• Works on tables, lists and grids, and never inserts anything into the page

RELEASE NOTES
1.0.4
• New setup question: home server (Jellyfin, Plex, Emby) that direct-plays makes Dolby Vision-only releases a perfect fit

1.0.3
• Choose which pages of a site are scanned automatically. Open a page, click the toolbar icon, pick “Only pages like this one” and tick the parts of the address that must match
• See and remove a site’s page rules right in the toolbar popup

1.0.2
• New icon

1.0.1
• New name: PlayFit – Release Format Checker
• Clearer store description

1.0.0
• First release: colour-coding, per-title best release, setup wizard with presets, editable rules, multiple profiles

PRIVACY
No data collection, no network requests and no account. A site is read only when you scan it or turn on auto-scan for it. Access is requested per site and can be revoked at any time. Open source (MIT).

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
