# FUT Snipe — iOS app (no Mac needed)

A native iPhone app that opens the **EA SPORTS FC Ultimate Team web app** full-screen,
keeps you signed in, and **auto-injects the FUT Snipe panel** on top of it — the same
engine as the userscript (auto price from the live market + EA price range, markup
re-listing, profit tracking, human pacing, stop-on-captcha/soft-ban). This is the
"open the app → it's the web app + the sniper" experience, as a real app.

It talks to **no third-party server**. All pricing is EA's own live market data,
computed on-device. (fut.gg / Futbin are not used — they sit behind Cloudflare bot
protection and their terms forbid automated access.)

> **Risk.** Automating the FUT transfer market breaks EA's User Agreement — accounts
> get transfer-banned, coin-wiped, or permanently banned. Your account, your risk. The
> app paces itself and **stops (never bypasses)** on captcha / soft-ban. Not affiliated
> with EA or FUT Simple Trader.

---

## How it's built (no Mac required)

You never touch a Mac. A free **GitHub Actions** macOS runner compiles the app in the
cloud into an **unsigned `.ipa`**, and you install that from your **Windows PC** with a
free tool and a free Apple ID.

### 1. Build the .ipa in the cloud
1. This folder and `.github/workflows/build-ios.yml` are already in this repo.
2. On GitHub: **Actions** tab → **Build FUT Snipe iOS (unsigned IPA)** → **Run workflow**.
3. Wait ~3–5 min. Open the finished run → **Artifacts** → download **`FUTSnipe-unsigned-ipa`**.
4. Unzip it → you get `FUTSnipe-unsigned.ipa`.

### 2. Install it on your iPhone from Windows
Use **Sideloadly** (free, Windows): <https://sideloadly.io>
1. Install iTunes + iCloud (the non-Store versions Sideloadly links) so Windows can see your iPhone.
2. Plug in your iPhone, open Sideloadly, drag in `FUTSnipe-unsigned.ipa`.
3. Enter your **Apple ID** (a free one is fine; make a throwaway if you prefer). Click **Start**.
4. On the iPhone: **Settings → General → VPN & Device Management → [your Apple ID] → Trust**.
5. Open **FUT Snipe**, sign into EA, go to the Transfer Market.

> **Free Apple ID limits:** the app stops opening after **7 days** — just re-run Sideloadly
> to refresh it (your EA login and settings stay). Max 3 sideloaded apps at once.
> A paid Apple Developer account ($99/yr) extends it to 1 year.
>
> **AltStore** (<https://altstore.io>, also Windows) can auto-refresh every 7 days over
> Wi-Fi so you don't have to re-plug — optional.

---

## How to use
1. In the app, sign into EA and open **Transfer Market → Search**.
2. Set your player/filter and tap **Search** once (so it captures a real search).
3. Tap the floating **⚡** button → the full-screen FUT Snipe panel opens.
4. Leave **Auto price** on (it reads the live market itself) or set Snipe-under / Sell-at.
5. Tap **Start sniping**. Tap **✕** to close the panel back to the market.

## Files
| File | What it is |
|---|---|
| `project.yml` | XcodeGen spec — the runner turns this into the Xcode project (no checked-in `.xcodeproj`). |
| `Sources/AppDelegate.swift` | App entry; shows the web view full-screen. |
| `Sources/WebViewController.swift` | `WKWebView` that loads the EA web app, stays logged in, injects `engine.js`. |
| `Resources/engine.js` | The sniper + panel, injected into the page. Same logic as the userscript. |
| `../.github/workflows/build-ios.yml` | Cloud build → unsigned `.ipa` artifact. |

## Updating the sniper later
Edit `Resources/engine.js`, push, and run the workflow again for a fresh `.ipa`.
