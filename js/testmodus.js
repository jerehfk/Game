'use strict';

/**
 * Versteckter Testmodus mit Zeitraffer.
 *
 * WERKZEUG, KEIN SPIELINHALT. Diese Datei gehoert zum festen Bestand und wird
 * bei Aenderungen am Spiel nicht angetastet, auch wenn ein Auftrag sie nicht
 * erwaehnt.
 *
 * Alles Noetige liegt hier: Aktivierung, Leiste, Stil, Zeitfaktor. Die
 * Spielschleife greift den Faktor an genau einer Stelle ab -
 * Testmodus.zeitfaktor() -, und ohne Testmodus liefert der konstant 1. Damit
 * ist die Anbindung ein Einzeiler statt einer Verzweigung quer durch den Code.
 *
 * Auch der Stil steht hier und nicht in css/style.css: eine Ueberarbeitung des
 * Layouts wuerde ihn dort mitnehmen, und die Leiste stuende ohne Aussehen da.
 */
const Testmodus = {
  aktiv: false,
  faktor: 1,
  knoepfe: [],
  spielzeitFeld: null,

  /**
   * Der Zeitfaktor der Spielschleife - die eine Stelle, an der der Testmodus
   * ins Spiel greift. Ohne ihn immer 1.
   */
  zeitfaktor() {
    return this.aktiv ? this.faktor : 1;
  },

  initialisieren() {
    // Nur mit dem Parameter in der Adresse existiert der Modus ueberhaupt.
    let parameter = false;
    try {
      parameter = new URLSearchParams(window.location.search).has(DATA.TESTMODUS.PARAMETER);
    } catch (fehler) {
      parameter = false;
    }
    if (!parameter) return;

    this.aktiv = true;
    // Der Faktor wird bewusst nicht gespeichert: nach jedem Neuladen steht er
    // wieder auf 1, damit niemand versehentlich im Zeitraffer weiterspielt.
    this.faktor = DATA.TESTMODUS.FAKTOREN[0];

    this.stilEinsetzen();
    this.leisteBauen();

    // Die Leiste zieht sich selbst nach. Damit braucht die Spielschleife
    // keinen zweiten Einhaengepunkt fuer die Anzeige.
    setInterval(() => this.aktualisieren(), 1000 / DATA.TESTMODUS.ANZEIGE_HZ);
  },

  stilEinsetzen() {
    const stil = document.createElement('style');
    stil.textContent = `
      body { padding-bottom: 42px; }
      #testmodus {
        position: fixed;
        left: 0; right: 0; bottom: 0;
        display: flex;
        align-items: center;
        gap: 14px;
        height: 42px;
        padding: 0 14px;
        background: #1c1c1c;
        border-top: 2px solid ${DATA.TESTMODUS.RANDFARBE};
        color: #d8d8d8;
        font: 12px/1 Consolas, "SF Mono", ui-monospace, monospace;
        z-index: 20;
      }
      #testmodus .marke {
        color: ${DATA.TESTMODUS.RANDFARBE};
        font-weight: 700;
        letter-spacing: .12em;
      }
      #testmodus .stufen { display: flex; gap: 5px; }
      #testmodus button {
        padding: 4px 9px;
        background: #2e2e2e;
        border: 1px solid #4a4a4a;
        border-radius: 4px;
        color: #d8d8d8;
        font: inherit;
        cursor: pointer;
      }
      #testmodus button:hover { border-color: #7a7a7a; }
      #testmodus button.gewaehlt {
        background: ${DATA.TESTMODUS.RANDFARBE};
        border-color: ${DATA.TESTMODUS.RANDFARBE};
        color: #1c1c1c;
        font-weight: 700;
      }
      #testmodus .spielzeit { margin-left: auto; }
      #testmodus .spielzeit b { color: #fff; }
    `;
    document.head.appendChild(stil);
  },

  leisteBauen() {
    const leiste = document.createElement('div');
    leiste.id = 'testmodus';

    const marke = document.createElement('span');
    marke.className = 'marke';
    marke.textContent = 'TESTMODUS';

    const label = document.createElement('span');
    label.textContent = 'Zeit:';

    const stufen = document.createElement('span');
    stufen.className = 'stufen';
    for (const faktor of DATA.TESTMODUS.FAKTOREN) {
      const knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.textContent = '×' + faktor;
      knopf.addEventListener('click', () => {
        this.faktor = faktor;
        this.knoepfeAuffrischen();
      });
      stufen.appendChild(knopf);
      this.knoepfe.push({ faktor, knopf });
    }

    // Die simulierte Spielzeit: ohne sie verliert man beim Testen den Bezug,
    // weil sie von der echten Uhr abweicht.
    this.spielzeitFeld = document.createElement('span');
    this.spielzeitFeld.className = 'spielzeit';

    leiste.append(marke, label, stufen, this.spielzeitFeld);
    document.body.appendChild(leiste);

    this.knoepfeAuffrischen();
    this.aktualisieren();
  },

  knoepfeAuffrischen() {
    for (const e of this.knoepfe) {
      e.knopf.classList.toggle('gewaehlt', e.faktor === this.faktor);
    }
  },

  aktualisieren() {
    if (!this.spielzeitFeld) return;
    this.spielzeitFeld.textContent = '';
    this.spielzeitFeld.append(
      'Spielzeit: ',
      Object.assign(document.createElement('b'), {
        textContent: Logik.formatiereDauer(spiel.statistik.spielzeit)
      })
    );
  }
};
