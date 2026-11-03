# Haus-Panel

Ganz einfach: **Fußbodenheizung (Shelly)** und **Lampen (Govee)** vom Handy aus bedienen. Läuft im Heimnetz, kein Cloud-Konto, keine Schlüssel, keine Abhängigkeiten.

## Starten

Auf einem Rechner, der immer läuft (Raspberry Pi, Mac, PC, NAS) mit Node 18 oder neuer:

```bash
cp home/config.example.json home/config.json   # IP-Adressen eintragen
node home/server.js
```

Dann auf dem Handy im selben WLAN `http://<IP-des-Rechners>:8080` öffnen. In Safari: Teilen → „Zum Home-Bildschirm“.

## Einrichten

**Shelly** (Gen1, Plus und Pro werden automatisch erkannt): IP-Adresse unter `heating.host` eintragen. Feste IP im Router vergeben, damit sie sich nicht ändert.
- `channel`: Relais-Nummer (meist 0).
- `tempSensor`: Nummer des Temperaturfühlers (Plus Add-on: meist 100, Gen1 Add-on: 0). Mit Fühler gibt es **Auto** (hält die Zieltemperatur), ohne Fühler nur **Ein/Aus**. Ohne Messwert bleibt Auto aus, nie an.
- `hysteresis`: Toleranz in °C (0.5 = heizt unter Ziel minus 0,5, aus bei Ziel).
- `autoOffHours`: bei „Ein“ nach so vielen Stunden von selbst wieder aus (0 = nie). Praktisch, falls man es vergisst.

**Govee**: in der Govee-App beim Gerät **„LAN-Steuerung“ einschalten** (nicht jedes Modell kann das). Die IP der Lampe unter `lamps` eintragen. Die IPs findest du mit `http://<IP>:8080/api/scan`.

## Hinweise

- Das Panel hat **kein Passwort**. Nur im Heimnetz betreiben, nicht aus dem Internet erreichbar machen.
- Die Govee-LAN-Steuerung nutzt die UDP-Ports 4001 bis 4003. Läuft auf dem Rechner schon Home Assistant, ist Port 4002 evtl. belegt (das Panel meldet das dann).
- Der Zustand der Heizung (Modus, Ziel) wird in `home/state.json` gespeichert.
- Tests: `node --test test/home.test.js` (mit simulierten Shelly- und Govee-Geräten).
