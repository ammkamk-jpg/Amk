# FUT Snipe: handoff for a new session

Start a new chat and say: "Read HANDOFF.md in ammkamk-jpg/Amk and continue. Don't code until I say go."

## Status (v4.4.0 "TangaTolga Sniper", branch `fut-snipe-one-button`)
- Done: script split into `fut-snipe/src/*.js`; `npm run build:fut-snipe` joins them into `fut-snipe.user.js` (never edit that file by hand). One Start button with price check (binary search, stale-outlier safe), snipe point, buy-all, relist with duration setting, periodic re-check, on-screen + console steps, closest() button fix, reset on Start, price tags on cards (EA prices only).
- v2.6.0: re-check slider 30-120, randomised gaps/breaks/re-checks, live feed (one line per search, clears after ~20 with a short pause), relists expired transfer-list cards via EA's Re-list all.
- v2.7.0: real web-app diag showed cards are drawn on <canvas> with no player id in the DOM, but each `li.listFUTItem` row has a hidden `.ut-item-view--stats` row "AVG <coins>". Price tags now show that value on every card (Club too), no searches. Search-based club pricing and the per-id price cache were removed. ⚡ button is draggable (position saved). Diag now lists all `services` keys and Item methods (check for `relistExpiredAuctions` / `requestTransferItems`).
- v2.8.0: AVG is EA's own (added this year, visible on PS5). Tag sits on `.rowContent`, positioned by measuring the card canvas (EA scales the card and clips inside it). Search gap = base +2..30% (never below base) + 7% longer pauses; price-check searches 35% slower. Price check starts at the last price (re-check) or the cheapest listing seen, steps ~12% then halves (`nextProbe`). ⚡ glides to the nearest side with momentum. Diag confirmed `relistExpiredAuctions` + `requestTransferItems` exist.
- v3.0.0: renamed TangaTolga Sniper (@name/@namespace changed, @downloadURL/@updateURL added; same localStorage keys). If an old FUT Snipe loaded first it shows a delete-the-old-one warning and exits. New look (styles.js tokens), snipe celebration in fx.js (canvas burst, SNIPED!, shake), WebAudio sounds (Off/Coins/Arcade/Boom, unlocked on Start tap), vibration (navigator.vibrate or iOS 18 switch-checkbox haptic). Min profit/card + EA step shown after price check. 'few' now needs 2 fresh listings.
- v3.1.0: gaps base x (1.03 + 0.55 r^1.8) x tempo mood 1.0-1.2 (re-rolled every 8-25 searches) + 6% 1.5-6s pauses: Normal = 2.6-4.3s, median ~3.3s. Feed keeps 200 lines, scrollable (lock screen lets touchmove through inside .fs-feed), no auto-clear.
- v3.2.0: Hub tab (hub.js): transfer list counts, real profit from a ledger (`futSnipe.ledger.v1`: bot buys + pack pulls at 0, sales booked once by item id, sale = _auction.currentBid), Book & clear sold (clearSoldItems), re-price expired before relisting (price check per card via withCard: maskedDefId=base, defId=[exact], matchId filter), list pack pulls worth >= packMin from requestUnassignedItems. Hub jobs run with mode='job' and the lock screen. During sniping hubPass() books sales, clears sold, re-prices up to 2 expired per pass.
- v3.3.0: Hub redesigned like the user's Simple Trader screenshot (own style, no branding): Profit card (realized + unrealized from ledger.buys[].list, vs yesterday, sparkline), Activity (sessions, life.searches, avg profit/card), Safety assistant (pricing.js safetyStatus: searches today vs ~1800/day estimate, 6h pause after captcha/429 = life.lastBlock), trade list All/Bought/Sold with initials avatars.
- v3.4.0: "After buy" = List (unchanged: price check + relist) / Transfer list (move, don't list) / Unassigned (leave). Keep modes skip the price check and use keepMax (required) + keepMin (optional, also sent as minBuy). Replaced the autoList switch.
- v3.5.0: real player name (search box value / repositories.Item.getStaticDataByDefId / requestItemByDefId / own search result, never a special version's name). Safety stops: too many results (10+ at the manual price, before buying), price range (requestMarketData + /pricelimits XHR cache; unknown range = not checked, said once), keep special versions (player search w/o rarity: defId != base -> kept unlisted + exact price check). Price check in List mode counts only the searched base card when no rarity filter. Clear sold: Off / When full (>=95) / Always.
- v3.6.0: varyMinBid (default on): snipe searches send a random min bid (0 or 150-1,000, < half the snipe point, never repeated) so every request is unique; price-check searches keep min bid 0.
- v3.6.1 (after first long real run): expired re-pricing never goes below break-even (known cost) or -10% of the old price (unknown cost) - repriceFloor; feed says '♻️ Expired X: re-pricing'. Start asks for confirmation within 6h of an EA captcha/429. Diag now has priceLimitsResponse (EA price range still null on the real app - investigate with the next diag), stopReason, hub, settings. EA serialises criteria.defId as `definitionId=` in the URL (works).
- v4.0.0: UI restructured like Simple Trader (layout ideas only, own branding): 4 top tiles Sniper / My Hub / Market / Settings. Sniper = target card + Start + run stats + feed + saved searches (old Filters tab). Hub = dashboard + sessions (old Stats tab). Market = gauge + per-card trends from the bot's own price checks (priceHist `futSnipe.priceHist.v1`, pricing.js cardTrends/marketIndex). Settings = sections with explanations (all settings moved off the Sniper view).
- v4.1.0: search gaps are a random value inside a range per speed (Normal 3.5-5.5s, Night 6.5-9.5s, Turbo 0.6-1.2s; tempo mood leans within it; price-check searches x1.35). Manual sell price (cfg.sellPrice, 0 = auto): lists there, snipe point = snipePoint(min(checked, manual)) (sellAndSnipe), editable on the Sniper card mid-run (applySell). Price check starts at the cheapest fresh listing.
- v4.2.0: look.js themes (Classic / Sakura default / Neon) via CSS variables --tt-a1/a2/g1/g2/bg; user-picked wallpaper (scaled to 1400px JPEG in `futSnipe.wall.v1`) behind panel + running screen with dim/blur and frosted cards; falling petals. Wallpaper shown via data: URL - if EA's CSP ever blocks it, nothing else breaks.
- v4.3.0: animated mascot (mascot.js). Assets in fut-snipe/assets/mascot/ (from the user's Gemini clip: idle = 8.6-10.0 s ping-pong, win = 1.75-4.9 s, sad = 5.0-8.0 s; chromakey 0x36DF34 sim .19 blend .04 + alpha cleanup, 240 px, 12 fps animated WebP; mp3 voice) are embedded by the build as MASCOT_ASSETS right after mascot.js (must come before ui.js boots). Idle replaces the radar on the running screen; celebrate() -> win reaction with bubble + voice; requestStop -> sad. Settings -> Look: Mascot, size, voice, test.
- v4.4.0: mascot assets moved to a separate pack script `tangatolga-mascot.user.js` (sets window.__ttMascot; built by build-fut-snipe.js; 720 px / 15 fps, ~6 MB) so the bot stays ~150 KB; bot picks the pack up even if it loads later. Bigger mascot (S/M/L/XL 200-400, height-capped at 40vh on the running screen). Price range: EA's requestMarketData reply is `{ marketData: ... }`; findLimits() walks it for min/max prices (diag shows the reply sample).
- Mascot pack 2.2.0 = 2.1.0 clips at 12 fps / q70 / 1.6 s idle (3.3 MB), written as ~1000-char lines joined at runtime (Safari could not open a 6 MB single-line file, so the Userscripts Install button never showed). Earlier, 2.1.0: second Gemini clip (pink floral bikini, same original character): idle = 8.0-10.0 s ping-pong, win = 2.0-3.7 s (+ voice), sad = 5.25-7.45 s (silent; sad.mp3 is optional in the build). Key colour 0x37DD36, 720 px / 15 fps.
- Pure price math is in `fut-snipe/src/pricing.js`, tested by `test/fut-snipe.test.js` (`npm test`).
- Not yet tested on the real EA web app (user was still on 2.4.1 when sending diag).
- fut.gg prices: user asked for them (2026-10-28); not done. Needs the user's decision (see Not wanted).

## Project
iOS Safari userscript (Userscripts app by quoid) for the EA FC Ultimate Team web app: a transfer-market sniper.
- Repo: ammkamk-jpg/Amk, branch master, file `fut-snipe.user.js` (v2.4.1, ~680 lines, single IIFE).
- Install URL: https://raw.githubusercontent.com/ammkamk-jpg/Amk/master/fut-snipe.user.js
- The iOS app idea was dropped. Per-card price badges are parked (`BADGES_ENABLED=false`).
- Read the file from the repo first; do not ask the user to paste it.

## How it works
- Uses EA's own services: `services.Item.searchTransferMarket / bid / move / list / requestMarketData`.
- Price steps: <1000:50, <10000:100, <50000:250, <100000:500, else 1000. EA tax 5%.
- Safety (keep): stop on captcha/429, human-like pacing, breaks, session/daily buy caps.

## What the user wants
One "Start" button after searching a player:
1. "Checking price...": search with NO max-buy (not the user's filter), start at the price ceiling, lower max-buy (binary/jump search, not one step at a time) until only a few listings remain (the ones with ~55-59 min left). That gives the market price (e.g. 15,000). Use the 2nd-3rd cheapest as the price so one outlier can't skew it.
2. Snipe point = floor(price*0.95) - target profit (e.g. 15,000, profit 500 -> 13,750).
3. Buy everything at or below the snipe point (no freshness requirement when buying; freshness is only for measuring the price).
4. Auto-relist after a short random delay at the checked price. Add a duration setting (1h/3h/6h/12h/1d/3d, default 1h).
5. Re-check the price periodically while running.
6. Show the steps on screen and in the console ("Checking...", "searching X - none found", "X sniped for Y").

## Known bugs to fix
- The old big blue "Start sniping" button skips the price check; remove it.
- Prices like 16,000/17,500 appeared because the bot reused the user's own search max-buy (16,750) and the median of filtered results as the "market price".
- Buttons are buggy: the click handler uses `e.target.id`, so tapping the subtitle `<span>` inside a button does nothing. Use `closest()`.
- Reset all state on every Start.

## Not wanted
- OmniRoute / token-pooling tools. Unrelated to this bot.
- Scraping Futbin/fut.gg (Cloudflare + ToS). Prices must come from EA's own market.

## Token saving
Don't re-push the whole file each time. First task after "go": split the script into a few small files so later changes only touch one. Then make small edits only.

## Suggested second message (after the new session replies)
> go. Answers: use the 2nd-cheapest fresh listing as the market price; buy anything at or below the snipe point; default relist duration 1h. First split the script into small files, then build the one-button flow.

## Animated mascot (done in v4.3.0; notes kept for new clips)
User wants a slot-machine-style animated anime character in the bot: idles in a corner (breathing, blinking, hair moving) and celebrates each snipe saying "uwuuu~". Must be an ORIGINAL character, clearly adult; Google's filters decide the outfit.
- If `GEMINI_API_KEY` is set in the environment: generate the still with the Gemini image model, then image-to-video with Veo (idle 4-8 s seamless loop; win 2-4 s with the "uwuuu~" voice; optional sad 2-3 s). Plain bright-green background, static camera. Veo via the API needs billing enabled: confirm cost with the user before generating video.
- Otherwise the user sends idle.mp4 / win.mp4 / sad.mp4 in the chat.
- Processing (ffmpeg, available in the container): chromakey the green -> transparent animated WebP (~360 px, ~15 fps, a few hundred KB each) + win audio clip; embed as data URLs (EA's CSP may block external media; img-src data: is what the wallpaper uses).
- In the bot: new mascot.js; idle loop in a corner of the running screen (and optionally the panel); on snipe swap to the win animation + audio + speech bubble ("uwuuu~ 💖", player + profit) alongside celebrate(); sad clip on stop/failed buy. Settings -> Look: Mascot on/off, size.
- Never ask the user to paste the API key in chat.
