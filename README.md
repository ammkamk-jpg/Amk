# FUT Trader

Hilfe für **manuelles** Traden im EA FC Ultimate Team Transfermarkt. Die App handelt nicht selbst und verbindet sich nicht mit EA-Servern – Preise trägst du selbst ein.

## Funktionen

- **Rechner:** EA-Steuer (5 %), Erlös, Gewinn und Rendite; Break-even-Verkaufspreis und maximaler Kaufpreis für einen Wunschgewinn, gerundet auf gültige Preisstufen.
- **Watchlist:** Spieler mit Ziel-Kauf/-Verkauf, eigener Preisverlauf mit Mini-Chart und Hinweis „Kaufen“ / „Verkaufen“ / „Warten“.
- **Trades:** Käufe und Verkäufe eintragen, Gesamtgewinn und gebundenes Kapital, Export/Import als JSON.

Daten werden nur im Browser (localStorage) gespeichert.

## Benutzen

`index.html` im Browser öffnen – kein Server, keine Installation nötig.

## Tests

```
npm test
```

# damirtrade

Panel für die EA FC Web App (Userscript, läuft auch auf dem Handy). damirtrade **liest nur mit**: Es wertet deine eigenen Suchen, Käufe und die Transferliste aus. Suchen, kaufen und verkaufen machst du selbst.

- **Live:** Ergebnisse deiner letzten Suche mit erwartetem Gewinn, Treffer mit Ton und Hinweis, Session-Statistik (Suchen, Treffer-Quote, Käufe, Ausgaben, Gewinn, Gewinn pro Stunde), Coin-Stand.
- **Ziele:** Spielername, Wertung, „Kaufen bis“ und „Verkaufen für“ (oder Marktpreis aus deinen Suchen).
- **Trades:** Käufe werden automatisch eingetragen, Verkäufe erkannt, sobald du die Transferliste öffnest. Export für FUT Trader.
- **Optionen:** Mindestgewinn (Coins oder Prozent), Verkaufsprofil (Marge, Marktpreis minus Stufen, fester Preis), Budget, Kauf-Limit, Laufzeit-Limit, Pausen-Hinweis, Ton.
- Warnt bei Soft-Ban (429), Captcha und abgelaufener Sitzung.

## Installieren

- **Android:** Firefox installieren → Add-on „Tampermonkey“ hinzufügen → diesen Link öffnen und „Installieren“ tippen:
  https://raw.githubusercontent.com/ammkamk-jpg/Amk/master/damirtrade/damirtrade.user.js
- **iPhone:** App „Userscripts“ aus dem App Store → in Safari unter „aA“ → Erweiterungen aktivieren → den Link oben öffnen und installieren.
- **PC:** Tampermonkey in Chrome/Firefox → Link oben öffnen.

Danach die EA FC Web App öffnen. Unten rechts erscheint der Knopf „DT“.

## Entwickeln

```
npm run build:damirtrade   # baut damirtrade/damirtrade.user.js
npm test
```

# WerkBüro

Handwerker-Büro zum Ausprobieren (Browser und Handy, kein Server): Angebote und Rechnungen, inspiriert von Bosch OfficeOn. Startet mit Beispieldaten.

- **Übersicht:** Umsatz (bezahlt), offene Posten, überfällige Beträge, offene Angebote, letzte Dokumente.
- **Angebote / Rechnungen:** Positionen mit Menge, Einzelpreis und MwSt. (19/7/0 %), Netto, MwSt. je Satz und Brutto. Angebot per Klick in eine Rechnung umwandeln. Rechnungsvorschau.
- **Termine:** Kalender nach Tagen, mit Kunde, Mitarbeiter, Uhrzeit und Notiz. Aus einem Termin direkt die Arbeitszeit buchen.
- **Zeiten:** Stunden pro Tag erfassen (direkt oder aus Von/Bis mit Pause), Summe der Woche und offener abrechenbarer Stunden. Offene Zeiten je Kunde mit einem Klick in Rechnungen umwandeln.
- **Mitarbeiter:** einfache Liste, die in Terminen und Zeiten zur Auswahl steht.
- **Kunden & Katalog:** Kundenliste und ein Material-/Leistungskatalog; Katalog-Einträge füllen Positionen automatisch aus.
- **Mehr:** Firmendaten (erscheinen auf der Rechnung), Backup-Export/Import.

Beträge werden in Cent gerechnet, damit es keine Rundungsfehler gibt. Die Rechnungsvorlage ist ein Muster und ersetzt keine geprüfte Buchhaltung.

## Entwickeln

```
npm run build:werkbuero   # baut dist/werkbuero.html
npm test
```
