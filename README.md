# Zielscheibe

Ein Idle Game ohne Klicken: ein Bogen schießt von selbst auf eine zehnringige
Scheibe. Anfangs streuen die Pfeile stark, mit gekauften Upgrades werden sie
präziser und schneller.

Jeder Treffer bringt gleich viel ein – den aktuellen Stand von
**punkteProTreffer** – und hebt diesen Zähler anschließend um den Zuwachs des
getroffenen Rings (Gold 89, Außenring 1, dazwischen die Fibonacci-Reihe). Ein
guter Treffer wirkt damit dauerhaft auf jeden folgenden. Weil der Zähler
mitwächst, wachsen die Punkte über die Zeit quadratisch – die geschlossene
Form dafür steht in `Logik.ertragUeberZeit` und trägt sowohl den
Offline-Fortschritt als auch die angezeigten Wartezeiten.

`index.html` im Browser öffnen – kein Build-Schritt, keine Abhängigkeiten,
keine Server.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | Gerüst der Seite, bindet die Skripte in fester Reihenfolge ein |
| `css/style.css` | gesamte Darstellung |
| `js/data.js` | **alle** Balancing-Zahlen – die einzige Stelle, an der sie stehen dürfen |
| `js/state.js` | Spielstand, gleitende Trefferverteilung, Speichern/Laden/Import |
| `js/logic.js` | Formeln, Wahrscheinlichkeiten, Upgrade-Katalog, Zahlformatierung |
| `js/target.js` | Zeichnen der Scheibe und der Einschläge auf Canvas |
| `js/ui.js` | Oberfläche und Overlay |
| `js/main.js` | Startpunkt und Spielschleife |

Die Skripte laufen als klassische `<script>`-Dateien, nicht als ES-Module:
Module scheitern über `file://` an der Same-Origin-Regel, und das Spiel soll
sich per Doppelklick öffnen lassen.

Gespeichert wird ausschließlich roher Fortschritt. Streuung, Schussintervall,
Punkte pro Sekunde und die Trefferverteilung entstehen beim Laden neu aus
`js/data.js` – geänderte Balancing-Zahlen greifen damit auch für alte Stände.

## Balancing nachrechnen

`werkzeuge/balancing.html` spielt den Verlauf zweier Spielertypen über 30 Tage
durch, ohne Zufall, direkt aus `js/data.js`. Nach jeder Änderung an den
Konstanten lohnt ein Blick darauf.

Die Datei bindet `js/data.js` genauso als klassisches Skript ein wie das Spiel
selbst und öffnet sich damit ebenfalls per Doppelklick.

## Stand

Demo-Fassung: eine Ebene, kein Reset- oder Prestige-Layer. Sie endet an den
Grundpreisen der inneren Ringe – Ring 7 bis 10 sind in einem Durchgang nicht
zu bezahlen, und die Zielgenauigkeit bleibt weit unter ihrem Maximum. Sobald
längere Zeit gar nichts mehr bezahlbar ist, weist das Spiel selbst darauf hin.
