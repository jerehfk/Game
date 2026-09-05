'use strict';

/**
 * Rechenlogik: Formeln, Wahrscheinlichkeiten, Zahlformatierung.
 *
 * Alles hier ist zustandslos - die Funktionen bekommen Level herein und geben
 * Zahlen zurueck. Damit bleiben sie ohne laufendes Spiel pruefbar, und der
 * Spielstand muss nichts Abgeleitetes mitschleppen.
 */
const Logik = {

  // --- Werte aus Leveln ---------------------------------------------------

  /** Standardabweichung der Trefferstreuung bei gegebener Zielgenauigkeit. */
  streuung(level) {
    const z = DATA.ZIELGENAUIGKEIT;
    const l = Math.min(level, z.MAX_LEVEL);
    return z.START_STREUUNG * Math.pow(z.FAKTOR_PRO_LEVEL, l - 1);
  },

  /** Sekunden zwischen zwei Schuessen. */
  schussintervall(level) {
    const s = DATA.SCHUSSINTERVALL;
    const l = Math.min(level, s.MAX_LEVEL);
    return s.START_SEKUNDEN * Math.pow(s.FAKTOR_PRO_LEVEL, l - 1);
  },

  // --- Kosten -------------------------------------------------------------

  /**
   * Preis fuer den Aufstieg von Level L auf L+1 bei der Zielgenauigkeit.
   *
   * Neben dem gleichmaessigen Wachstum steht ein zweiter Faktor, der alle
   * KOSTEN_SPRUNG_ALLE Level um KOSTEN_SPRUNG_FAKTOR springt. Diese Stufen
   * sind gewollt: sie bremsen den Fortschritt in Schueben aus und bilden am
   * Ende die Wand, an der die Demo aufhoert.
   */
  kostenZielgenauigkeit(level) {
    const z = DATA.ZIELGENAUIGKEIT;
    const stufe = Math.floor((level - 1) / z.KOSTEN_SPRUNG_ALLE);
    return z.KOSTEN_BASIS
      * Math.pow(z.KOSTEN_FAKTOR, level - 1)
      * Math.pow(z.KOSTEN_SPRUNG_FAKTOR, stufe);
  },

  /** Preis fuer den Aufstieg von Level L auf L+1 beim Schussintervall. */
  kostenSchussintervall(level) {
    const s = DATA.SCHUSSINTERVALL;
    return s.KOSTEN_BASIS * Math.pow(s.KOSTEN_FAKTOR, level - 1);
  },

  /**
   * Preis fuer den Aufstieg von Level L auf L+1 bei einem Ring-Upgrade.
   *
   * Jeder Ring bringt seinen eigenen Grundpreis mit; die Kostenkurve darueber
   * ist fuer alle zehn dieselbe. Welchen Ring man als naechsten aufmacht, ist
   * damit eine Entscheidung und nicht mehr nur eine Frage der Trefferquote.
   */
  kostenRing(ring, level) {
    return DATA.RINGE[ring - 1].grundpreis
      * Math.pow(DATA.RING_UPGRADE.KOSTEN_FAKTOR, level - 1);
  },

  /**
   * Zuwachs, den ein Treffer in diesem Ring dem Zaehler punkteProTreffer gibt.
   * Ring 1 = aussen, Ring 10 = Mitte.
   */
  ringZuwachs(ring, level) {
    const grund = DATA.RINGE[ring - 1].grundpunkte;
    return grund * Math.pow(DATA.RING_UPGRADE.FAKTOR_PRO_LEVEL, level - 1);
  },

  // --- Ein Schuss ---------------------------------------------------------

  /** Box-Muller: liefert zwei unabhaengige N(0, sigma) - genau ein Schuss. */
  normalPaar(sigma) {
    // Math.random() kann 0 liefern, log(0) waere -Infinity.
    const u1 = 1 - Math.random();
    const u2 = Math.random();
    const betrag = sigma * Math.sqrt(-2 * Math.log(u1));
    const winkel = 2 * Math.PI * u2;
    return [betrag * Math.cos(winkel), betrag * Math.sin(winkel)];
  },

  /**
   * Ringnummer fuer einen Abstand vom Mittelpunkt.
   * 0 bedeutet daneben (Radius >= 1).
   */
  ringFuerRadius(r) {
    if (r >= DATA.SCHEIBE.RADIUS) return 0;
    return DATA.SCHEIBE.RINGE_GESAMT - Math.floor(r / DATA.SCHEIBE.RING_BREITE);
  },

  /** Einen Schuss ziehen: Koordinate, Abstand und getroffener Ring. */
  schuss(sigma) {
    const [x, y] = this.normalPaar(sigma);
    const r = Math.sqrt(x * x + y * y);
    return { x, y, r, ring: this.ringFuerRadius(r) };
  },

  // --- Erwartungswerte ----------------------------------------------------

  /**
   * Trefferwahrscheinlichkeit je Ring, Index 0 = Ring 1 (aussen).
   *
   * Zwei unabhaengige Normalverteilungen ergeben einen Rayleigh-verteilten
   * Abstand: P(r < a) = 1 - exp(-a^2 / (2*sigma^2)). Ein Ring ist die
   * Differenz zweier solcher Kreisscheiben. Das spart es, fuer Offline-Zeit
   * oder die Punkte-pro-Sekunde-Anzeige Schuesse zu simulieren.
   */
  ringWahrscheinlichkeiten(sigma) {
    const nenner = 2 * sigma * sigma;
    const p = new Array(DATA.SCHEIBE.RINGE_GESAMT);
    for (let i = 0; i < p.length; i++) {
      const ring = i + 1;
      const aussen = (DATA.SCHEIBE.RINGE_GESAMT - ring + 1) * DATA.SCHEIBE.RING_BREITE;
      const innen = (DATA.SCHEIBE.RINGE_GESAMT - ring) * DATA.SCHEIBE.RING_BREITE;
      p[i] = Math.exp(-(innen * innen) / nenner) - Math.exp(-(aussen * aussen) / nenner);
    }
    return p;
  },

  /** Anteil der Schuesse, die ueberhaupt auf der Scheibe landen. */
  trefferwahrscheinlichkeit(sigma) {
    const r = DATA.SCHEIBE.RADIUS;
    return 1 - Math.exp(-(r * r) / (2 * sigma * sigma));
  },

  /** Treffer je Sekunde - Fehlschuesse zaehlen nicht mit. */
  trefferProSekunde(stand) {
    const sigma = this.streuung(stand.zielgenauigkeitLevel);
    return this.trefferwahrscheinlichkeit(sigma)
      / this.schussintervall(stand.schussintervallLevel);
  },

  /** Erwarteter Zuwachs eines einzelnen Schusses; ein Fehlschuss gibt null. */
  erwarteterZuwachsProSchuss(stand) {
    const p = this.ringWahrscheinlichkeiten(this.streuung(stand.zielgenauigkeitLevel));
    let summe = 0;
    for (let i = 0; i < p.length; i++) {
      summe += p[i] * this.ringZuwachs(i + 1, stand.ringLevel[i]);
    }
    return summe;
  },

  /**
   * Erwarteter Zuwachs je Treffer - das 'z' der Offline-Rechnung.
   *
   * Bezugsgroesse sind die Treffer, nicht die Schuesse: die Offline-Formel
   * zaehlt in Treffern, und ein Fehlschuss veraendert den Zaehler nicht.
   */
  zuwachsProTreffer(stand) {
    const quote = this.trefferwahrscheinlichkeit(this.streuung(stand.zielgenauigkeitLevel));
    if (quote <= 0) return 0;
    return this.erwarteterZuwachsProSchuss(stand) / quote;
  },

  /**
   * Punkte je Sekunde im Moment.
   *
   * Nur eine Momentaufnahme: jeder Treffer gibt punkteProTreffer, und dieser
   * Zaehler steigt laufend. Ueber laengere Zeit waechst der Ertrag deshalb
   * quadratisch - dafuer ist punkteUeberZeit zustaendig.
   */
  punkteProSekunde(stand) {
    return this.trefferProSekunde(stand) * stand.punkteProTreffer;
  },

  /**
   * Ertrag und Zaehlerstand nach einer Zeitspanne ohne Kaeufe.
   *
   * Waehrend der Abwesenheit steigt punkteProTreffer mit jedem Treffer, also
   * traegt Treffer k den Stand P0 + k*z bei. Ueber H Treffer summiert:
   *
   *   Punkte = H*P0 + z*H*(H-1)/2
   *
   * Gerechnet wird mit H*(H-1)/2 statt der glatten Naeherung H^2/2: fuer
   * ganzzahlige H stimmt das exakt mit der Schuss-fuer-Schuss-Buchung
   * ueberein, sodass kurze Nachhol-Luecken keine Punkte aus dem Nichts
   * erzeugen. Fuer lange Abwesenheiten sind beide Formen praktisch gleich.
   */
  ertragUeberZeit(stand, sekunden) {
    const treffer = this.trefferProSekunde(stand) * sekunden;
    if (treffer <= 0) return { punkte: 0, zuwachs: 0, treffer: 0 };

    const z = this.zuwachsProTreffer(stand);
    return {
      treffer,
      punkte: treffer * stand.punkteProTreffer + z * treffer * Math.max(0, treffer - 1) / 2,
      zuwachs: z * treffer
    };
  },

  /**
   * Sekunden, bis ein Betrag zusammengespart ist.
   *
   * Nicht fehlender Betrag durch Punkte pro Sekunde: punkteProTreffer steigt
   * beim Warten mit, das Einkommen waechst also. Eine lineare Schaetzung
   * nennt gerade bei teuren Kaeufen viel zu lange Zeiten.
   *
   * punkte(t) = f*P0*t + f^2*z/2 * t^2, nach t aufgeloest. Geschrieben als
   * 2c/(b+Wurzel) statt (-b+Wurzel)/2a, weil die zweite Form fuer kleines a
   * die fuehrenden Stellen wegsubtrahiert.
   */
  wartezeit(stand, fehlenderBetrag) {
    if (fehlenderBetrag <= 0) return 0;

    const b = this.trefferProSekunde(stand) * stand.punkteProTreffer;
    const a = this.trefferProSekunde(stand) * this.wachstumProSekunde(stand) / 2;

    if (a <= 0) return b > 0 ? fehlenderBetrag / b : Infinity;
    return 2 * fehlenderBetrag / (b + Math.sqrt(b * b + 4 * a * fehlenderBetrag));
  },

  /** Zuwachs von punkteProTreffer je Sekunde. */
  wachstumProSekunde(stand) {
    return this.erwarteterZuwachsProSchuss(stand)
      / this.schussintervall(stand.schussintervallLevel);
  },

  // --- Darstellung --------------------------------------------------------

  /** Zahlformatierung mit Suffixen, danach Exponentialschreibweise. */
  formatiereZahl(wert) {
    if (!isFinite(wert)) return '∞';
    if (wert < 1000) {
      return wert < 10 && wert % 1 !== 0 ? wert.toFixed(1) : Math.floor(wert).toString();
    }
    const stufe = Math.floor(Math.log10(wert) / 3);
    if (stufe < DATA.FORMAT.SUFFIXE.length) {
      const zahl = wert / Math.pow(1000, stufe);
      return zahl.toFixed(DATA.FORMAT.NACHKOMMA) + ' ' + DATA.FORMAT.SUFFIXE[stufe];
    }
    return wert.toExponential(DATA.FORMAT.NACHKOMMA).replace('e+', 'e');
  },

  /** Dauer in Sekunden als lesbare Angabe. */
  formatiereDauer(sekunden) {
    if (!isFinite(sekunden)) return 'nie';
    if (sekunden < 1) return 'sofort';
    const s = Math.floor(sekunden % 60);
    const m = Math.floor(sekunden / 60) % 60;
    const h = Math.floor(sekunden / 3600) % 24;
    const t = Math.floor(sekunden / 86400);
    if (t > 0) return t + ' d ' + h + ' h';
    if (h > 0) return h + ' h ' + m + ' min';
    if (m > 0) return m + ' min ' + s + ' s';
    return s + ' s';
  }
};

/**
 * Kaufbare Upgrades.
 *
 * Die drei Achsen werden ueber dieselbe Beschreibung gefuehrt (Level, Kosten,
 * Wirkung, Anheben), damit die Oberflaeche nur eine Zeilenart kennen muss und
 * eine vierte Achse spaeter nichts an der Darstellung aendert.
 */
const Upgrades = {
  alle: [],

  aufbauen() {
    this.alle = [];

    this.alle.push({
      id: 'zielgenauigkeit',
      gruppe: 'zielgenauigkeit',
      name: 'Zielgenauigkeit',
      farbe: null,
      maxLevel: DATA.ZIELGENAUIGKEIT.MAX_LEVEL,
      level: () => spiel.zielgenauigkeitLevel,
      kosten: () => Logik.kostenZielgenauigkeit(spiel.zielgenauigkeitLevel),
      wirkung: () => {
        const s = Logik.streuung(spiel.zielgenauigkeitLevel);
        const quote = Logik.trefferwahrscheinlichkeit(s);
        return 'Streuung ' + s.toFixed(3) + ' · ' + (100 * quote).toFixed(1) + ' % auf der Scheibe';
      },
      anheben: () => { spiel.zielgenauigkeitLevel++; }
    });

    this.alle.push({
      id: 'schussintervall',
      gruppe: 'schussintervall',
      name: 'Schussintervall',
      farbe: null,
      maxLevel: DATA.SCHUSSINTERVALL.MAX_LEVEL,
      level: () => spiel.schussintervallLevel,
      kosten: () => Logik.kostenSchussintervall(spiel.schussintervallLevel),
      wirkung: () => {
        const i = Logik.schussintervall(spiel.schussintervallLevel);
        return i.toFixed(3) + ' s · ' + (1 / i).toFixed(2) + ' Schuss/s';
      },
      anheben: () => { spiel.schussintervallLevel++; }
    });

    // Von der Mitte nach aussen aufgelistet: Ring 10 steht oben, weil er das
    // langfristige Ziel ist, auch wenn er sich erst spaet lohnt.
    for (let ring = DATA.SCHEIBE.RINGE_GESAMT; ring >= 1; ring--) {
      const i = ring - 1;
      this.alle.push({
        id: 'ring' + ring,
        gruppe: 'ringe',
        name: 'Ring ' + ring,
        farbe: DATA.RINGE[i].farbe,
        maxLevel: DATA.RING_UPGRADE.MAX_LEVEL,
        level: () => spiel.ringLevel[i],
        kosten: () => Logik.kostenRing(ring, spiel.ringLevel[i]),
        wirkung: () => '+' + Logik.formatiereZahl(Logik.ringZuwachs(ring, spiel.ringLevel[i]))
          + ' je Treffer',
        anheben: () => { spiel.ringLevel[i]++; }
      });
    }
  },

  amMaximum(u) {
    return u.level() >= u.maxLevel;
  },

  bezahlbar(u) {
    return !this.amMaximum(u) && spiel.punkte >= u.kosten();
  },

  kaufen(u) {
    if (!this.bezahlbar(u)) return false;
    spiel.punkte -= u.kosten();
    u.anheben();
    return true;
  },

  /** Guenstigstes noch kaufbares Upgrade - Grundlage fuer den Demo-Hinweis. */
  guenstigste() {
    let preis = Infinity;
    for (const u of this.alle) {
      if (this.amMaximum(u)) continue;
      preis = Math.min(preis, u.kosten());
    }
    return preis;
  }
};
