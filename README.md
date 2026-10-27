# PlayFit

Chrome / Brave / Edge extension (Manifest V3) that colour-codes video release names on any web page
according to what **your** playback chain can actually play.

Nothing is inserted into the page. The title text itself is coloured and a coloured dot is drawn in
front of it with CSS, so it works on any layout (tables, floated columns, no-wrap titles, long rutracker titles).

| Mark | Meaning |
|------|---------|
| green text, ● green | Every rule category is a perfect fit |
| amber text, ● yellow | Plays, but something isn't ideal (1080p, no Atmos, audio not stated…) |
| red text, ● red | Don't download (CAM, stereo-only, AAC re-encode group, Dolby Vision disc remux on a player that can't do profile 7…) |
| ★ instead of ● | Highest-scoring non-red release on the page |

Hover a marked title to see the per-category breakdown.
Display options (text colour, dot, star, row tint, fading red rows) are under *Settings → Display*.

## Install (unpacked)

1. Open `chrome://extensions` (or `brave://extensions`, `edge://extensions`).
2. Turn on **Developer mode**.
3. **Load unpacked** → select this folder.
4. The setup page opens on first install. Pick the preset closest to your player, adjust the answers
   (languages, groups…), then **Create profile**.

| Preset | For |
|--------|-----|
| Streaming box, DD+ Atmos only | Google TV Streamer, Chromecast, Apple TV 4K, Roku, Fire TV stock player |
| LG TV app | Jellyfin / Plex on webOS: Dolby Vision OK, DD+ Atmos over eARC |
| Samsung TV app | HDR10/HDR10+, no Dolby Vision |
| Full passthrough | Nvidia Shield, Ugoos/CoreELEC, HTPC + AV receiver: TrueHD/DTS:X, DV profile 7 |
| 1080p TV + 5.1 | No HDR, no Atmos |
| Stereo | TV speakers, laptop, headphones |

After pulling changes, press the reload icon on the extension card.

## Use

- On any page: toolbar icon → **Scan this page**.
- Toggle **Always scan <site>** in the popup (or add sites under *Settings → Sites*) to scan automatically.
  Chrome asks for read permission per site; nothing is requested up front.
- To auto-scan only some pages of a site, open one of them, turn on **Always scan** and pick **Only pages like this one**,
  then tick which parts of the address must match (e.g. `/torrents.php` and `action=details`). Other pages on that
  site are only rated when you press **Scan**.
- The popup lists the best releases on the page; click one to scroll to it.
- Switch profiles from the popup (e.g. one per room, or one per preferred dub language).

## Customising

*Settings → Setup* builds a profile from a few questions: screen, HDR / Dolby Vision support, whether the player
handles DV profile 7, sound system (DD+ Atmos only / full passthrough / 5.1 / stereo), AV1 and H.264 10-bit
decoding, REMUX preference, preferred languages, release groups to avoid or trust.

*Settings → Rules* edits every rule. Inside a category the **first matching rule wins**; reorder with ↑ ↓.

| Pattern | Meaning |
|---------|---------|
| `DDP5.1 Atmos, DDPA5.1` | comma = alternatives |
| `REMUX & DV` | `&` = all terms present |
| `2.0 & !5.1` | `!` = term absent |
| `WEB-DL` | separators are loose: matches `WEBDL`, `WEB.DL`, `WEB DL` |
| `/ddp?5\.1/` | raw case-insensitive regex |

Verdict = red if any category is red, green if every rated category is green, else yellow.
*If not found* per category decides whether a missing tag is ignored, yellow or red.

*Settings → Test names* rates pasted names live while you edit rules.
*Settings → Backup* exports a single profile (to share) or all settings.

## Layout

```
manifest.json
src/engine.js      rule engine + release-name detection (pure, no DOM)
src/defaults.js    presets and the setup-wizard profile builder
src/settings.js    chrome.storage helpers, site permissions
src/content.js     page scanner: marks titles with data attributes, hover tooltip
src/content.css    colours, dot, star and row tint keyed on those attributes
src/background.js  auto-scan registration per allowed site, toolbar counter
src/auto.js        flags the auto-scan script so content.js honours page scopes
popup/  options/   UI
tests/             node --test tests/
```

## Tests

```
node --test tests/
```

## Packaging

```
scripts/package.sh      # runs the tests, writes dist/release-radar-<version>.zip
```

Store listing text, permission justifications and the privacy policy are in `store/`;
`store/demo.html` is a neutral page for screenshots.

## Privacy

No data collection and no network requests; settings stay in `chrome.storage.local`. See [store/PRIVACY.md](store/PRIVACY.md).

## License

MIT
