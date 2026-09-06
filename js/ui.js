'use strict';

/**
 * Oberflaeche.
 *
 * Die Knoten werden gebaut, wenn sich ihre Zahl aendert, und danach nur noch
 * mit neuen Werten befuellt - kein innerHTML im Takt der Schleife.
 */
const UI = {
  knoten: {},
  /** Ein Feld je Ring in der Kopfzeile, Index 0 = Ring 1. */
  kopfFelder: [],
  /** Aufgebaute Ring-Karten, Schluessel ist die Ringnummer. */
  ringZeilen: {},
  /** Bis zu welchem Ring zuletzt gebaut wurde - erst danach lohnt ein Neubau. */
  gebautBis: 0,

  initialisieren() {
    const k = this.knoten;
    k.kopf = document.getElementById('kopf');
    k.punkte = document.getElementById('anzeige-punkte');
    k.liste = document.getElementById('ringUpgrades');
    k.statPpt = document.getElementById('stat-ppt');
    k.statPps = document.getElementById('stat-pps');
    k.schuesse = document.getElementById('stat-schuesse');
    k.quote = document.getElementById('stat-quote');

    this.kopfBauen();
    this.listeBauen();
    this.speicherKnoepfeBinden();
  },

  // --- Kopfzeile ----------------------------------------------------------

  /**
   * Zehn feste Felder, eines je Ring. Sie werden einmal angelegt und behalten
   * ihren Platz: ein noch nie getroffener Ring zeigt ein Fragezeichen an
   * derselben Stelle, damit die Zeile nie springt.
   */
  kopfBauen() {
    for (let ring = 1; ring <= DATA.SCHEIBE.RINGE_GESAMT; ring++) {
      const feld = document.createElement('span');
      feld.title = 'Ring ' + ring;
      this.knoten.kopf.appendChild(feld);
      this.kopfFelder.push(feld);
    }
  },

  kopfAktualisieren() {
    for (let i = 0; i < this.kopfFelder.length; i++) {
      const feld = this.kopfFelder[i];
      // Getroffen heisst gesehen: erst dann verraet die Zeile den Zuwachs.
      //
      // Verglichen wird gegen einen ganzen Treffer, nicht gegen null. Die
      // Erwartungswert-Buchung fuer Offline-Zeit schreibt jedem Ring
      // Bruchteile gut - gegen null geprueft waeren nach dem ersten
      // Nachrechnen schlagartig alle zehn Felder aufgedeckt.
      const getroffen = spiel.statistik.ringTreffer[i] >= 1;

      if (!getroffen) {
        if (feld.textContent !== '?') {
          feld.textContent = '?';
          feld.className = 'unbekannt';
          feld.style.color = '';
        }
        continue;
      }

      const text = '+' + Logik.formatiereZahl(Logik.ringZuwachs(i + 1, spiel.ringLevel[i]));
      if (feld.textContent !== text) feld.textContent = text;
      if (feld.className !== '') {
        feld.className = '';
        feld.style.color = DATA.RINGE[i].farbe;
      }
    }
  },

  // --- Linke Spalte: Ring-Karten ------------------------------------------

  /**
   * Sichtbar sind die freigeschalteten Ringe von 1 nach 10 - und sonst
   * nichts. Neu gebaut wird nur, wenn ein Ring dazukommt.
   */
  listeBauen() {
    const hoechster = Logik.hoechsterFreierRing();
    if (hoechster === this.gebautBis) return;

    this.gebautBis = hoechster;
    this.ringZeilen = {};
    this.knoten.liste.textContent = '';

    for (let ring = 1; ring <= hoechster; ring++) {
      const karte = this.ringKarteBauen(ring);
      if (ring === 1) {
        // Der Mengenknopf steht neben Ring 1, nicht darin: sonst bricht deren
        // Text um und die Karte wird hoeher als alle anderen.
        const zeile = document.createElement('div');
        zeile.className = 'ersteZeile';

        const menge = document.createElement('button');
        menge.type = 'button';
        menge.id = 'menge';
        menge.addEventListener('click', () => {
          Upgrades.mengeWeiterschalten();
          this.aktualisieren();
        });
        this.knoten.menge = menge;

        zeile.append(karte, menge);
        this.knoten.liste.appendChild(zeile);
      } else {
        this.knoten.liste.appendChild(karte);
      }
    }
  },

  ringKarteBauen(ring) {
    const u = Upgrades.alle.find((e) => e.ring === ring);

    const karte = document.createElement('button');
    karte.type = 'button';
    karte.className = 'ring';
    karte.style.setProperty('--ringfarbe', DATA.RINGE[ring - 1].farbe);

    const oben = document.createElement('span');
    oben.className = 'oben';
    const unten = document.createElement('span');
    unten.className = 'unten';
    karte.append(oben, unten);

    karte.addEventListener('click', () => {
      // Am Maximallevel ist dieselbe Karte der Ascension-Knopf.
      const erfolg = Logik.ringAmMaximum(ring)
        ? Upgrades.ascension(ring)
        : Upgrades.kaufenMenge(u);
      if (erfolg) this.aktualisieren();
    });

    this.ringZeilen[ring] = { u, karte, oben, unten };
    return karte;
  },

  ringeAktualisieren() {
    this.listeBauen();

    const menge = Upgrades.menge();
    if (this.knoten.menge) {
      this.knoten.menge.textContent = menge === 'MAX' ? 'MAX' : '×' + menge;
    }

    for (const schluessel in this.ringZeilen) {
      const z = this.ringZeilen[schluessel];
      const ring = z.u.ring;
      const level = z.u.level();
      const maxLevel = Logik.ringMaxLevel(ring);
      const ascensions = spiel.ascensions[ring - 1];

      z.oben.textContent = 'Ring ' + ring + ' · Lvl ' + level + '/' + maxLevel
        + (ascensions > 0 ? ' · Asc ' + ascensions : '');

      let bezahlbar;
      if (Logik.ringAmMaximum(ring)) {
        // Am Maximum wird die Karte zum Ascension-Knopf und hebt sich ab.
        const preis = Logik.ascensionPreis(ring);
        z.unten.textContent = 'Ascension · ' + Logik.formatiereZahl(preis);
        bezahlbar = spiel.punkte >= preis;
      } else {
        const anzahl = Upgrades.anzahlFuer(z.u);
        const kosten = z.u.kostenFuer(Math.max(1, anzahl));
        z.unten.textContent = '+' + Logik.formatiereZahl(Logik.ringZuwachs(ring, level))
          + ' je Treffer · ' + Logik.formatiereZahl(kosten);
        bezahlbar = anzahl > 0 && spiel.punkte >= kosten;
      }

      z.karte.classList.toggle('ascension', Logik.ringAmMaximum(ring));
      // Arm heisst: der anstehende Kauf ist gerade nicht zu bezahlen.
      z.karte.classList.toggle('arm', !bezahlbar);
      z.karte.disabled = !bezahlbar;
    }
  },

  // --- Speicherstand ------------------------------------------------------

  speicherKnoepfeBinden() {
    document.getElementById('knopf-export').addEventListener('click', () => {
      Overlay.zeigen({
        titel: 'Spielstand exportieren',
        text: ['Der folgende Text enthält den vollständigen Fortschritt. Kopieren und aufbewahren.'],
        eingabe: { wert: Speicher.exportieren() },
        knoepfe: [{ beschriftung: 'Fertig' }]
      });
      document.getElementById('overlay-eingabe').select();
    });

    document.getElementById('knopf-import').addEventListener('click', () => {
      Overlay.zeigen({
        titel: 'Spielstand importieren',
        text: ['Exportierten Text einfügen. Der laufende Fortschritt wird dabei ersetzt.'],
        eingabe: { platzhalter: 'Hier den exportierten Text einfügen …' },
        knoepfe: [
          { beschriftung: 'Abbrechen' },
          {
            beschriftung: 'Übernehmen',
            aktion: (text) => {
              if (!Speicher.importieren(text)) {
                // false haelt das Overlay offen, damit der eingefuegte Text
                // nicht verloren geht.
                document.getElementById('overlay-titel').textContent =
                  'Text nicht lesbar – bitte prüfen';
                return false;
              }
              Spiel.nachLadenAufsetzen();
              return true;
            }
          }
        ]
      });
    });

    document.getElementById('knopf-reset').addEventListener('click', () => {
      Overlay.zeigen({
        titel: 'Wirklich zurücksetzen?',
        text: [
          'Punkte, alle Level und die Statistik gehen verloren.',
          'Es gibt in dieser Fassung noch kein Prestige - zurückgesetzt wird bei null, ohne Gegenleistung.'
        ],
        knoepfe: [
          { beschriftung: 'Abbrechen' },
          {
            beschriftung: 'Zurücksetzen',
            klasse: 'gefahr',
            aktion: () => {
              Speicher.loeschen();
              spiel = Zustand.neu();
              Spiel.nachLadenAufsetzen();
            }
          }
        ]
      });
    });
  },

  // --- Gesamtbild ---------------------------------------------------------

  aktualisieren() {
    const k = this.knoten;
    const st = spiel.statistik;

    k.punkte.textContent = Logik.formatiereZahl(spiel.punkte);
    k.statPpt.textContent = Logik.formatiereZahl(spiel.punkteProTreffer);
    k.statPps.textContent = Logik.formatiereZahl(Logik.punkteProSekunde(spiel));

    // Schuesse sind gezaehlte Ereignisse, keine Groesse: bei ihnen waeren die
    // zwei Nachkommastellen der kleinen Zahlen ("5,00") schlicht falsch.
    k.schuesse.textContent = Logik.gruppiere(Math.floor(st.schuesse));
    k.quote.textContent = st.schuesse > 0
      ? (100 * st.treffer / st.schuesse).toFixed(1).replace('.', DATA.FORMAT.DEZIMAL_TRENNER) + ' %'
      : '–';

    this.kopfAktualisieren();
    this.ringeAktualisieren();
  },

  /** Nach Laden, Import oder Zuruecksetzen muss die Kartenliste neu entstehen. */
  neuAufbauen() {
    this.gebautBis = 0;
    this.aktualisieren();
  }
};

const Overlay = {
  knoten: {},

  initialisieren() {
    this.knoten.wurzel = document.getElementById('overlay');
    this.knoten.titel = document.getElementById('overlay-titel');
    this.knoten.text = document.getElementById('overlay-text');
    this.knoten.eingabe = document.getElementById('overlay-eingabe');
    this.knoten.knoepfe = document.getElementById('overlay-knoepfe');

    // Klick auf den Hintergrund und Escape schliessen - beides ohne Wirkung.
    this.knoten.wurzel.addEventListener('click', (e) => {
      if (e.target === this.knoten.wurzel) this.schliessen();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.schliessen();
    });
  },

  /**
   * @param {{titel:string, text:string, eingabe?:{wert?:string, platzhalter?:string},
   *          knoepfe:Array<{beschriftung:string, klasse?:string, aktion?:Function}>}} auftrag
   */
  zeigen(auftrag) {
    const k = this.knoten;
    k.titel.textContent = auftrag.titel;
    // Text kommt als Liste von Absaetzen herein, nie als HTML-Zeichenkette -
    // ein importierter Spielstand darf nichts in die Seite schreiben koennen.
    k.text.textContent = '';
    for (const absatz of auftrag.text) {
      const p = document.createElement('p');
      p.style.margin = '0 0 8px';
      p.textContent = absatz;
      k.text.appendChild(p);
    }
    k.knoepfe.textContent = '';

    if (auftrag.eingabe) {
      k.eingabe.hidden = false;
      k.eingabe.value = auftrag.eingabe.wert || '';
      k.eingabe.placeholder = auftrag.eingabe.platzhalter || '';
    } else {
      k.eingabe.hidden = true;
      k.eingabe.value = '';
    }

    for (const b of auftrag.knoepfe) {
      const knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.textContent = b.beschriftung;
      if (b.klasse) knopf.className = b.klasse;
      knopf.addEventListener('click', () => {
        // Der Aufruf entscheidet selbst, ob das Overlay offen bleibt.
        if (!b.aktion || b.aktion(k.eingabe.value) !== false) this.schliessen();
      });
      k.knoepfe.appendChild(knopf);
    }

    k.wurzel.hidden = false;
  },

  /** Kurzform fuer eine reine Mitteilung. */
  mitteilen(titel, absaetze) {
    this.zeigen({
      titel,
      text: absaetze,
      knoepfe: [{ beschriftung: 'Weiter' }]
    });
  },

  schliessen() {
    this.knoten.wurzel.hidden = true;
  }
};
