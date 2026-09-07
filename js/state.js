'use strict';

/**
 * Spielzustand.
 *
 * Hier steht ausschliesslich roher Fortschritt - Punkte, Level, Statistik.
 * Abgeleitete Groessen (Streuung, Intervall, Punkte pro Sekunde) werden nie
 * gespeichert, sondern bei Bedarf aus den Leveln neu gerechnet. So bleiben
 * Balancing-Aenderungen in data.js auch fuer alte Spielstaende wirksam.
 */
const Zustand = {

  /** Frischer Spielstand. */
  neu() {
    return {
      version: DATA.SPEICHERN.VERSION,
      punkte: 0,
      /**
       * Was ein einzelner Treffer einbringt. Steigt mit jedem Treffer um den
       * Zuwachs des getroffenen Rings und faellt nie - das ist der eigentliche
       * Fortschritt, waehrend punkte die Waehrung ist, die wieder ausgeht.
       */
      punkteProTreffer: DATA.SCORING.START_PUNKTE_PRO_TREFFER,
      /** Stellung des Mengenknopfs, Index in DATA.KAUF.MENGEN. */
      kaufMengeIndex: 0,

      /** Federn: dauerhafte Waehrung, ueberdauert jedes Prestige. */
      federn: 0,
      /** In dieser Runde gesammelt, erst beim Prestige gutgeschrieben. */
      federnAnstehend: 0,
      prestiges: 0,

      /** Mit Federn gekauft, ueberdauern das Prestige. */
      zielgenauigkeitLevel: 1,
      schussintervallLevel: 1,
      schwungLevel: 0,

      ringLevel: new Array(DATA.SCHEIBE.RINGE_GESAMT).fill(1),
      /** Aufstiege je Ring; hebt Maximallevel und Wirkung, startet bei 0. */
      ascensions: new Array(DATA.SCHEIBE.RINGE_GESAMT).fill(0),
      statistik: {
        schuesse: 0,
        treffer: 0,
        /** Lebenslange Treffer je Ring, Index 0 = Ring 1 (aussen). */
        ringTreffer: new Array(DATA.SCHEIBE.RINGE_GESAMT).fill(0),
        spielzeit: 0
      },
      zuletztGespeichert: Date.now()
    };
  }
};

/**
 * Gleitende Trefferverteilung fuer die Anzeige.
 *
 * Bewusst kein Teil des Spielstands: die Verteilung ist abgeleitet und wird
 * beim Laden aus dem Erwartungswert neu aufgesetzt. Statt einen Ringpuffer
 * ueber die letzten N Schuesse zu fuehren, werden die Zaehler je Schuss mit
 * einem festen Faktor gedaempft - das ergibt dasselbe Bild, kostet aber keine
 * Verwaltung und laesst sich fuer Offline-Zeit geschlossen nachrechnen.
 */
const Verteilung = {
  /** Daempfung je Schuss; mittelt ueber rund VERTEILUNG_FENSTER Schuesse. */
  faktor: 1 - 1 / DATA.STATISTIK.VERTEILUNG_FENSTER,
  ringe: new Array(DATA.SCHEIBE.RINGE_GESAMT).fill(0),
  daneben: 0,
  gewicht: 0,

  leeren() {
    this.ringe.fill(0);
    this.daneben = 0;
    this.gewicht = 0;
  },

  /** Einen ausgewerteten Schuss melden; ring 0 bedeutet daneben. */
  melden(ring) {
    const d = this.faktor;
    for (let i = 0; i < this.ringe.length; i++) this.ringe[i] *= d;
    this.daneben *= d;
    if (ring === 0) this.daneben += 1;
    else this.ringe[ring - 1] += 1;
    this.gewicht = this.gewicht * d + 1;
  },

  /**
   * Viele Schuesse auf einmal einrechnen (Offline-Zeit).
   * Nach k Schuessen mit Verteilung p gilt geschlossen:
   * zaehler = zaehler * d^k + p * (1 - d^k) / (1 - d).
   */
  meldenViele(wahrscheinlichkeiten, anzahl) {
    if (anzahl <= 0) return;
    const d = this.faktor;
    const dk = Math.pow(d, anzahl);
    const summe = (1 - dk) / (1 - d);
    let getroffen = 0;
    for (let i = 0; i < this.ringe.length; i++) {
      this.ringe[i] = this.ringe[i] * dk + wahrscheinlichkeiten[i] * summe;
      getroffen += wahrscheinlichkeiten[i];
    }
    this.daneben = this.daneben * dk + (1 - getroffen) * summe;
    this.gewicht = this.gewicht * dk + summe;
  },

  /** Anteil eines Rings an den zuletzt gezaehlten Schuessen. */
  anteil(ring) {
    if (this.gewicht <= 0) return 0;
    return (ring === 0 ? this.daneben : this.ringe[ring - 1]) / this.gewicht;
  }
};

/** Der eine laufende Spielstand. */
let spiel = Zustand.neu();

/**
 * Spielstand sichern, laden, aus- und einlesen.
 *
 * Gespeichert wird nur roher Fortschritt. Alles Abgeleitete - Streuung,
 * Intervall, Punkte pro Sekunde, Trefferverteilung - entsteht beim Laden neu
 * aus data.js, damit spaetere Balancing-Aenderungen auch alte Staende treffen.
 */
const Speicher = {

  speichern() {
    spiel.zuletztGespeichert = Date.now();
    try {
      localStorage.setItem(DATA.SPEICHERN.SCHLUESSEL, JSON.stringify(spiel));
      return true;
    } catch (fehler) {
      // Privater Modus oder volles Kontingent: das Spiel laeuft weiter, nur
      // ohne Sicherung. Ein Abbruch der Schleife waere die schlechtere Wahl.
      console.warn('Spielstand konnte nicht gespeichert werden:', fehler);
      return false;
    }
  },

  /**
   * Gespeicherten Stand laden.
   * Gibt die Sekunden seit dem letzten Speichern zurueck, oder null, wenn es
   * keinen brauchbaren Stand gab.
   */
  laden() {
    let roh;
    try {
      roh = localStorage.getItem(DATA.SPEICHERN.SCHLUESSEL);
    } catch (fehler) {
      return null;
    }
    if (!roh) return null;

    let daten;
    try {
      daten = JSON.parse(roh);
    } catch (fehler) {
      console.warn('Spielstand ist unlesbar und wird verworfen.');
      return null;
    }
    return this.uebernehmen(daten);
  },

  /** Geprueften Stand einsetzen; gibt die Abwesenheit in Sekunden zurueck. */
  uebernehmen(daten) {
    const geprueft = this.pruefen(this.migrieren(daten));
    if (!geprueft) return null;

    spiel = geprueft;
    const abwesend = Math.max(0, (Date.now() - geprueft.zuletztGespeichert) / 1000);
    return abwesend;
  },

  /** Alte Formate schrittweise auf das aktuelle heben. */
  migrieren(daten) {
    if (!daten || typeof daten !== 'object') return null;
    if (typeof daten.version !== 'number') return null;

    // Version 1 kannte punkteProTreffer nicht: dort gab jeder Treffer den
    // Wert seines Rings. Ein alter Stand behaelt Punkte und Level und faengt
    // mit dem Zaehler am Anfang an - die Level sind der eigentliche
    // Fortschritt, und die alten Punkte bleiben als Startkapital erhalten.
    if (daten.version === 1) {
      daten.punkteProTreffer = DATA.SCORING.START_PUNKTE_PRO_TREFFER;
      daten.version = 2;
    }

    if (daten.version !== DATA.SPEICHERN.VERSION) return null;
    return daten;
  },

  /**
   * Fremde oder beschaedigte Daten auf eine gueltige Form bringen.
   * Ein importierter Stand kommt aus einem Textfeld - er darf nicht
   * ungeprueft in die Schleife.
   */
  pruefen(daten) {
    if (!daten) return null;

    const zahl = (wert, ersatz) =>
      (typeof wert === 'number' && isFinite(wert) && wert >= 0) ? wert : ersatz;
    const level = (wert, max) =>
      Math.min(max, Math.max(1, Math.floor(zahl(wert, 1))));

    const frisch = Zustand.neu();
    const stand = {
      version: DATA.SPEICHERN.VERSION,
      punkte: zahl(daten.punkte, 0),
      // Der Zaehler faellt nie unter seinen Startwert - ein manipulierter oder
      // beschaedigter Stand darf ihn nicht auf null druecken.
      punkteProTreffer: Math.max(
        DATA.SCORING.START_PUNKTE_PRO_TREFFER,
        zahl(daten.punkteProTreffer, DATA.SCORING.START_PUNKTE_PRO_TREFFER)
      ),
      federn: Math.floor(zahl(daten.federn, 0)),
      federnAnstehend: Math.floor(zahl(daten.federnAnstehend, 0)),
      prestiges: Math.floor(zahl(daten.prestiges, 0)),

      // Ohne Prestige sind die beiden Achsen gesperrt und stehen auf 1 - ein
      // Stand aus einer Fassung, in der sie kaufbar waren, liefe sonst mit
      // Werten weiter, die in dieser Runde niemand erreichen kann.
      zielgenauigkeitLevel: zahl(daten.prestiges, 0) > 0
        ? level(daten.zielgenauigkeitLevel, DATA.ZIELGENAUIGKEIT.MAX_LEVEL)
        : 1,
      schussintervallLevel: zahl(daten.prestiges, 0) > 0
        ? level(daten.schussintervallLevel, DATA.SCHUSSINTERVALL.MAX_LEVEL)
        : 1,
      schwungLevel: zahl(daten.prestiges, 0) > 0
        ? Math.max(0, Math.floor(zahl(daten.schwungLevel, 0)))
        : 0,
      ringLevel: frisch.ringLevel,
      ascensions: frisch.ascensions,
      statistik: frisch.statistik,
      kaufMengeIndex: (Number.isInteger(daten.kaufMengeIndex)
        && daten.kaufMengeIndex >= 0
        && daten.kaufMengeIndex < DATA.KAUF.MENGEN.length) ? daten.kaufMengeIndex : 0,
      zuletztGespeichert: zahl(daten.zuletztGespeichert, Date.now())
    };

    // Erst die Aufstiege, dann die Level: das Maximallevel eines Rings haengt
    // an seinen Ascensions, gegen das geklemmt wird.
    if (Array.isArray(daten.ascensions)) {
      for (let i = 0; i < stand.ascensions.length; i++) {
        stand.ascensions[i] = Math.max(0, Math.floor(zahl(daten.ascensions[i], 0)));
      }
    }

    if (Array.isArray(daten.ringLevel)) {
      for (let i = 0; i < stand.ringLevel.length; i++) {
        const max = Logik.ringMaxLevel(i + 1, stand.ascensions[i]);
        stand.ringLevel[i] = level(daten.ringLevel[i], max);
      }
    }

    const st = daten.statistik;
    if (st && typeof st === 'object') {
      stand.statistik.schuesse = zahl(st.schuesse, 0);
      stand.statistik.treffer = Math.min(stand.statistik.schuesse, zahl(st.treffer, 0));
      stand.statistik.spielzeit = zahl(st.spielzeit, 0);
      if (Array.isArray(st.ringTreffer)) {
        for (let i = 0; i < stand.statistik.ringTreffer.length; i++) {
          stand.statistik.ringTreffer[i] = zahl(st.ringTreffer[i], 0);
        }
      }
    }

    return stand;
  },

  /** Spielstand als Text zum Kopieren. */
  exportieren() {
    return btoa(JSON.stringify(spiel));
  },

  /** Text aus dem Eingabefeld uebernehmen; false, wenn er nicht taugt. */
  importieren(text) {
    let daten;
    try {
      daten = JSON.parse(atob(text.trim()));
    } catch (fehler) {
      return false;
    }
    return this.uebernehmen(daten) !== null;
  },

  loeschen() {
    try {
      localStorage.removeItem(DATA.SPEICHERN.SCHLUESSEL);
    } catch (fehler) {
      /* nichts zu tun */
    }
  }
};
