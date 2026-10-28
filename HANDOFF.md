# FUT Snipe: handoff for a new session

Start a new chat and say: "Read HANDOFF.md in ammkamk-jpg/Amk and continue. Don't code until I say go."

## Status (v3.2.0 "TangaTolga Sniper", branch `fut-snipe-one-button`)
- Done: script split into `fut-snipe/src/*.js`; `npm run build:fut-snipe` joins them into `fut-snipe.user.js` (never edit that file by hand). One Start button with price check (binary search, stale-outlier safe), snipe point, buy-all, relist with duration setting, periodic re-check, on-screen + console steps, closest() button fix, reset on Start, price tags on cards (EA prices only).
- v2.6.0: re-check slider 30-120, randomised gaps/breaks/re-checks, live feed (one line per search, clears after ~20 with a short pause), relists expired transfer-list cards via EA's Re-list all.
- v2.7.0: real web-app diag showed cards are drawn on <canvas> with no player id in the DOM, but each `li.listFUTItem` row has a hidden `.ut-item-view--stats` row "AVG <coins>". Price tags now show that value on every card (Club too), no searches. Search-based club pricing and the per-id price cache were removed. ⚡ button is draggable (position saved). Diag now lists all `services` keys and Item methods (check for `relistExpiredAuctions` / `requestTransferItems`).
- v2.8.0: AVG is EA's own (added this year, visible on PS5). Tag sits on `.rowContent`, positioned by measuring the card canvas (EA scales the card and clips inside it). Search gap = base +2..30% (never below base) + 7% longer pauses; price-check searches 35% slower. Price check starts at the last price (re-check) or the cheapest listing seen, steps ~12% then halves (`nextProbe`). ⚡ glides to the nearest side with momentum. Diag confirmed `relistExpiredAuctions` + `requestTransferItems` exist.
- v3.0.0: renamed TangaTolga Sniper (@name/@namespace changed, @downloadURL/@updateURL added; same localStorage keys). If an old FUT Snipe loaded first it shows a delete-the-old-one warning and exits. New look (styles.js tokens), snipe celebration in fx.js (canvas burst, SNIPED!, shake), WebAudio sounds (Off/Coins/Arcade/Boom, unlocked on Start tap), vibration (navigator.vibrate or iOS 18 switch-checkbox haptic). Min profit/card + EA step shown after price check. 'few' now needs 2 fresh listings.
- v3.1.0: gaps base x (1.03 + 0.55 r^1.8) x tempo mood 1.0-1.2 (re-rolled every 8-25 searches) + 6% 1.5-6s pauses: Normal = 2.6-4.3s, median ~3.3s. Feed keeps 200 lines, scrollable (lock screen lets touchmove through inside .fs-feed), no auto-clear.
- v3.2.0: Hub tab (hub.js): transfer list counts, real profit from a ledger (`futSnipe.ledger.v1`: bot buys + pack pulls at 0, sales booked once by item id, sale = _auction.currentBid), Book & clear sold (clearSoldItems), re-price expired before relisting (price check per card via withCard: maskedDefId=base, defId=[exact], matchId filter), list pack pulls worth >= packMin from requestUnassignedItems. Hub jobs run with mode='job' and the lock screen. During sniping hubPass() books sales, clears sold, re-prices up to 2 expired per pass.
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
