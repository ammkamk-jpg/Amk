# FUT Snipe: handoff for a new session

Start a new chat and say: "Read HANDOFF.md in ammkamk-jpg/Amk and continue. Don't code until I say go."

## Status (v2.6.0, branch `fut-snipe-one-button`)
- Done: script split into `fut-snipe/src/*.js`; `npm run build:fut-snipe` joins them into `fut-snipe.user.js` (never edit that file by hand). One Start button with price check (binary search, stale-outlier safe), snipe point, buy-all, relist with duration setting, periodic re-check, on-screen + console steps, closest() button fix, reset on Start, price tags on cards (EA prices only).
- v2.6.0: "Price club cards" button (price-checks unpriced cards on screen, exact card version via base id + definitionId match), re-check slider 30-120, randomised gaps/breaks/re-checks, live feed (one line per search, clears after ~20 with a short pause), relists expired transfer-list cards via EA's Re-list all.
- Pure price math is in `fut-snipe/src/pricing.js`, tested by `test/fut-snipe.test.js` (`npm test`).
- Not yet tested on the real EA web app; card-id reading for price tags is best-effort.
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
