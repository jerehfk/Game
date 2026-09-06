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
    return Math.round(z.KOSTEN_BASIS
      * Math.pow(z.KOSTEN_FAKTOR, level - 1)
      * Math.pow(z.KOSTEN_SPRUNG_FAKTOR, stufe));
  },

  /** Preis fuer den Aufstieg von Level L auf L+1 beim Schussintervall. */
  kostenSchussintervall(level) {
    const s = DATA.SCHUSSINTERVALL;
    return Math.round(s.KOSTEN_BASIS * Math.pow(s.KOSTEN_FAKTOR, level - 1));
  },

  /**
   * Preis fuer den Aufstieg von Level L auf L+1 bei einem Ring-Upgrade.
   *
   * Jeder Ring bringt seinen eigenen Grundpreis mit; die Kostenkurve darueber
   * ist fuer alle zehn dieselbe. Welchen Ring man als naechsten aufmacht, ist
   * damit eine Entscheidung und nicht mehr nur eine Frage der Trefferquote.
   */
  kostenRing(ring, level) {
    return Math.round(this.rohkostenRing(ring, level));
  },

  /**
   * Ungerundeter Preis - nur intern, damit sich Rundungen nicht summieren,
   * wenn mehrere Level am Stueck gerechnet werden.
   */
  rohkostenRing(ring, level) {
    const r = DATA.RINGE[ring - 1];
    return r.grundpreis * Math.pow(r.kostenfaktor, level - 1);
  },

  /**
   * Preis fuer mehrere Level am Stueck - geometrische Summe, nicht
   * Einzelpreis mal Anzahl: der Preis waechst ja zwischen den Leveln mit.
   *
   * Ein einzelnes Level laeuft an der Reihe vorbei. Rechnerisch ist
   * (q^1 - 1) / (q - 1) exakt 1, aber der Ausdruck wird von links nach rechts
   * ausgewertet: erst Grundpreis mal Zaehler, dann geteilt. Bei Ring 3 ergab
   * 1000 * 0,28000000000000003 / 0,28000000000000003 genau 999,9999999999999
   * und damit den Preis 999 statt 1.000.
   *
   * Fuer mehrere Level bleibt die Reihe, jetzt aber geklammert und gerundet:
   * Preise sind im Spiel immer ganzzahlig.
   */
  kostenRingMenge(ring, level, anzahl) {
    if (anzahl <= 0) return 0;
    if (anzahl === 1) return this.kostenRing(ring, level);

    const q = DATA.RINGE[ring - 1].kostenfaktor;
    const reihe = (Math.pow(q, anzahl) - 1) / (q - 1);
    return Math.round(this.rohkostenRing(ring, level) * reihe);
  },

  /**
   * Wie viele Level ein Guthaben in einem Zug hergibt.
   *
   * Die Summenformel nach der Anzahl aufgeloest, statt in einer Schleife
   * hochzuzaehlen - bei billigen Ringen und viel Guthaben waeren das sonst
   * Zehntausende Durchlaeufe je Frame.
   */
  maxKaufbareRingLevel(ring, level, guthaben) {
    // Ueber das Maximallevel hinaus geht nichts - auch nicht mit MAX.
    const rest = this.ringMaxLevel(ring) - level;
    if (rest <= 0) return 0;

    if (guthaben < this.kostenRing(ring, level)) return 0;

    const q = DATA.RINGE[ring - 1].kostenfaktor;
    const start = this.rohkostenRing(ring, level);
    let anzahl = Math.min(rest,
      Math.floor(Math.log(1 + guthaben * (q - 1) / start) / Math.log(q)));

    // Gegen den gerundeten Preis gegenpruefen, mit dem auch gekauft wird:
    // sonst nennt die Karte eine Menge, die der Kauf danach ablehnt.
    while (anzahl > 1 && this.kostenRingMenge(ring, level, anzahl) > guthaben) anzahl--;
    return anzahl;
  },

  /**
   * Ist die Kaufkarte dieses Rings schon sichtbar?
   * Ring 1 immer, jeder weitere ab RING_FREI_AB_LEVEL des Rings davor.
   */
  ringFreigeschaltet(ring) {
    if (ring <= 1) return true;
    const davor = ring - 2;
    // Wer schon aufgestiegen ist, war zwangslaeufig am Maximallevel und damit
    // weit ueber der Freischaltschwelle. Ohne diese zweite Bedingung wuerde
    // eine Ascension den naechsten Ring wieder zusperren, weil der Ring davor
    // auf Level 1 zurueckfaellt.
    return spiel.ringLevel[davor] >= DATA.EBENE.RING_FREI_AB_LEVEL
      || spiel.ascensions[davor] > 0;
  },

  /** Hoechster freigeschalteter Ring. */
  hoechsterFreierRing() {
    let hoechster = 1;
    for (let ring = 2; ring <= DATA.SCHEIBE.RINGE_GESAMT; ring++) {
      if (!this.ringFreigeschaltet(ring)) break;
      hoechster = ring;
    }
    return hoechster;
  },

  /**
   * Zuwachs, den ein Treffer in diesem Ring dem Zaehler punkteProTreffer gibt.
   * Ring 1 = aussen, Ring 10 = Mitte.
   */
  ringZuwachs(ring, level, ascensions) {
    const grund = DATA.RINGE[ring - 1].grundzuwachs;
    return grund * Math.pow(this.ringFaktor(ring, ascensions), level - 1);
  },

  // --- Ascension ----------------------------------------------------------

  /** Wie oft dieser Ring schon aufgestiegen ist. */
  ringAscensions(ring, ascensions) {
    return ascensions !== undefined ? ascensions : spiel.ascensions[ring - 1];
  },

  /** Bis hierher laesst sich der Ring kaufen; danach nur noch aufsteigen. */
  ringMaxLevel(ring, ascensions) {
    const a = DATA.ASCENSION;
    return a.MAX_LEVEL_BASIS + a.MAX_LEVEL_JE_ASCENSION * this.ringAscensions(ring, ascensions);
  },

  /**
   * Wirkung eines Levels bei diesem Ring.
   *
   * Jede Ascension hebt den Exponenten y und damit den Faktor: aus 1,05 wird
   * 1,05^1,1 und so fort. Der Zuwachs faellt beim Aufstieg zwar auf den
   * Grundwert zurueck, wird aber danach schneller wieder aufgebaut.
   */
  ringFaktor(ring, ascensions) {
    const a = DATA.ASCENSION;
    const y = a.Y_BASIS + a.Y_JE_ASCENSION * this.ringAscensions(ring, ascensions);
    return Math.pow(DATA.RING_UPGRADE.FAKTOR_PRO_LEVEL, y);
  },

  /**
   * Preis des Aufstiegs, bemessen am erreichten Zuwachs.
   *
   * Das mittlere Glied ist das Vielfache, auf das der Ring seinen Zuwachs
   * hochgearbeitet hat. Weil der Ertrag eines Aufstiegs an genau diesem Wert
   * haengt, kuerzt er sich heraus - uebrig bleibt PREIS_WACHSTUM je Aufstieg
   * als Bremse. Naeheres in data.js.
   */
  ascensionPreis(ring, ascensions) {
    const a = DATA.ASCENSION;
    const r = DATA.RINGE[ring - 1];
    const stufe = this.ringAscensions(ring, ascensions);
    const erreichterZuwachs = this.ringZuwachs(ring, this.ringMaxLevel(ring, stufe), stufe);

    // Gerundet wie jeder andere Preis - Anzeige und Kaufpruefung nehmen
    // denselben Wert, sonst steht da 999 und der Kauf scheitert an 999,9999.
    return Math.round(a.PREIS_VIELFACHES
      * r.grundpreis
      * (erreichterZuwachs / r.grundzuwachs)
      * Math.pow(a.PREIS_WACHSTUM, stufe));
  },

  /** Steht der Ring an seinem Maximallevel? */
  ringAmMaximum(ring) {
    return spiel.ringLevel[ring - 1] >= this.ringMaxLevel(ring);
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
   *
   * Die Ringe sind unterschiedlich breit, es gibt also keine Formel mehr -
   * gesucht wird von innen nach aussen der erste Ring, dessen Aussengrenze
   * ueber dem Abstand liegt.
   */
  ringFuerRadius(r) {
    if (r >= DATA.SCHEIBE.RADIUS) return 0;
    for (let i = DATA.RINGE.length - 1; i >= 0; i--) {
      if (r < DATA.RINGE[i].aussen) return DATA.RINGE[i].nummer;
    }
    return 0;
  },

  /** Einen Schuss ziehen: Koordinate, Abstand und getroffener Ring. */
  schuss(sigma) {
    const [x, y] = this.normalPaar(sigma);
    const r = Math.sqrt(x * x + y * y);
    return { x, y, r, ring: this.ringFuerRadius(r) };
  },

  /**
   * Wo ein Schuss gezeichnet wird.
   *
   * Gerechnet wird mit den echten Ringgrenzen, gezeichnet mit zehn gleich
   * breiten Ringen. Ein Treffer wird deshalb innerhalb seines Rings linear auf
   * das Anzeige-Intervall gestreckt: er bleibt sichtbar in dem Ring, dem er
   * zugerechnet wurde, und Ring 10 verschwindet nicht in einem halben Pixel.
   */
  anzeigePosition(schuss) {
    const anzeigeRadius = this.anzeigeRadius(schuss.r, schuss.ring);
    // Ein Volltreffer genau im Zentrum hat keine Richtung.
    const faktor = schuss.r > 0 ? anzeigeRadius / schuss.r : 0;
    return { x: schuss.x * faktor, y: schuss.y * faktor };
  },

  anzeigeRadius(r, ring) {
    // Fehlschuesse liegen ausserhalb; weit entfernte werden an den Bildrand
    // geholt, damit sie nicht aus der Leinwand fallen.
    if (ring === 0) return Math.min(DATA.SCHEIBE.MAX_ANZEIGE_RADIUS, r);

    const grenzen = DATA.RINGE[ring - 1];
    const breite = grenzen.aussen - grenzen.innen;
    const anteil = breite > 0 ? (r - grenzen.innen) / breite : 0;
    return (DATA.SCHEIBE.RINGE_GESAMT - ring) * DATA.SCHEIBE.ANZEIGE_RING_BREITE
      + anteil * DATA.SCHEIBE.ANZEIGE_RING_BREITE;
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
      const innen = DATA.RINGE[i].innen;
      const aussen = DATA.RINGE[i].aussen;
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
      summe += p[i] * this.ringZuwachs(i + 1, stand.ringLevel[i], stand.ascensions[i]);
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

  /**
   * Die eine Zahlformatierung des Spiels - jede Anzeige geht hier durch.
   *
   * Unter 10 zwei Nachkommastellen, bis 100 eine, bis knapp unter eine
   * Milliarde als ganze Zahl mit Tausenderpunkten, darueber in
   * Exponentialschreibweise. Durchgehend deutsche Schreibweise.
   */
  formatiereZahl(wert) {
    if (!isFinite(wert)) return '∞';
    const f = DATA.FORMAT;

    if (wert < 0) return '-' + this.formatiereZahl(-wert);

    // Geprueft wird gegen den gerundeten Wert: 9,999 gehoert nach dem Runden
    // in die naechste Stufe, '10,00' kommt in diesem Schema nirgends vor.
    const nachkomma = this.nachkommastellen(wert);
    if (nachkomma > 0) {
      return wert.toFixed(nachkomma).replace('.', f.DEZIMAL_TRENNER);
    }

    if (wert < f.EXPONENT_AB) {
      // Wer hier landet und trotzdem unter MITTEL_BIS liegt, wurde durch das
      // Runden hochgeschoben (99,96): dann gilt die Grenze, nicht der
      // abgeschnittene Wert - sonst stuende dort '99'.
      return this.gruppiere(wert < f.MITTEL_BIS ? f.MITTEL_BIS : Math.floor(wert));
    }

    let exponent = Math.floor(Math.log10(wert));
    let mantisse = wert / Math.pow(10, exponent);
    // Runden kann die Mantisse ueber 10 heben (9,999e9 wird zu 10,00e9);
    // dann gehoert eine Stelle in den Exponenten.
    if (Number(mantisse.toFixed(f.NACHKOMMA_MANTISSE)) >= 10) {
      mantisse /= 10;
      exponent += 1;
    }

    // Nachlaufende Nullen entfallen - also 1e9, nicht 1,00e9.
    const text = mantisse.toFixed(f.NACHKOMMA_MANTISSE)
      .replace(/0+$/, '')
      .replace(/\.$/, '')
      .replace('.', f.DEZIMAL_TRENNER);

    return text + 'e' + exponent;
  },

  /**
   * Wie viele Nachkommastellen dieser Wert bekommt; 0 heisst ganzzahlig.
   *
   * Entschieden wird anhand der bereits gerundeten Zahl. Sonst faenden sich
   * Werte kurz unter einer Stufengrenze in der falschen Stufe wieder - 9,999
   * wuerde als '10,00' erscheinen, 99,96 als '100,0'.
   */
  nachkommastellen(wert) {
    const f = DATA.FORMAT;
    if (Number(wert.toFixed(f.NACHKOMMA_KLEIN)) < f.KLEIN_BIS) return f.NACHKOMMA_KLEIN;
    if (Number(wert.toFixed(f.NACHKOMMA_MITTEL)) < f.MITTEL_BIS) return f.NACHKOMMA_MITTEL;
    return 0;
  },

  /** Ganze Zahl mit Tausendertrennern. */
  gruppiere(ganzzahl) {
    return ganzzahl.toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, DATA.FORMAT.TAUSENDER_TRENNER);
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

    // In der ersten Ebene gibt es nur die zehn Ring-Upgrades. Die beiden
    // globalen Achsen bleiben als Code stehen und kommen mit dem Prestige
    // zurueck - siehe DATA.EBENE.
    if (DATA.EBENE.GLOBALE_UPGRADES_FREI) this.globaleAufbauen();
    this.ringeAufbauen();
  },

  globaleAufbauen() {
    this.alle.push({
      id: 'zielgenauigkeit',
      gruppe: 'zielgenauigkeit',
      name: 'Zielgenauigkeit',
      farbe: null,
      maxLevel: () => DATA.ZIELGENAUIGKEIT.MAX_LEVEL,
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
      maxLevel: () => DATA.SCHUSSINTERVALL.MAX_LEVEL,
      level: () => spiel.schussintervallLevel,
      kosten: () => Logik.kostenSchussintervall(spiel.schussintervallLevel),
      wirkung: () => {
        const i = Logik.schussintervall(spiel.schussintervallLevel);
        return i.toFixed(3) + ' s · ' + (1 / i).toFixed(2) + ' Schuss/s';
      },
      anheben: () => { spiel.schussintervallLevel++; }
    });
  },

  ringeAufbauen() {
    // Von der Mitte nach aussen aufgelistet: Ring 10 steht oben, weil er das
    // langfristige Ziel ist, auch wenn er sich erst spaet lohnt.
    for (let ring = DATA.SCHEIBE.RINGE_GESAMT; ring >= 1; ring--) {
      const i = ring - 1;
      this.alle.push({
        id: 'ring' + ring,
        gruppe: 'ringe',
        name: 'Ring ' + ring,
        farbe: DATA.RINGE[i].farbe,
        maxLevel: () => Logik.ringMaxLevel(ring),
        level: () => spiel.ringLevel[i],
        kosten: () => Logik.kostenRing(ring, spiel.ringLevel[i]),
        wirkung: () => '+' + Logik.formatiereZahl(Logik.ringZuwachs(ring, spiel.ringLevel[i]))
          + ' je Treffer',
        anheben: () => { spiel.ringLevel[i]++; },

        // Fuer den Mengenknopf: Preis und Obergrenze mehrerer Level am Stueck.
        ring,
        kostenFuer: (anzahl) => Logik.kostenRingMenge(ring, spiel.ringLevel[i], anzahl),
        maxAnzahl: () => Logik.maxKaufbareRingLevel(ring, spiel.ringLevel[i], spiel.punkte),
        anhebenUm: (anzahl) => { spiel.ringLevel[i] += anzahl; },
        frei: () => Logik.ringFreigeschaltet(ring)
      });
    }
  },

  amMaximum(u) {
    return u.level() >= u.maxLevel();
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

  /** Die aktuell gewaehlte Kaufmenge, 1 / 10 / 100 oder 'MAX'. */
  menge() {
    return DATA.KAUF.MENGEN[spiel.kaufMengeIndex] ?? DATA.KAUF.MENGEN[0];
  },

  mengeWeiterschalten() {
    spiel.kaufMengeIndex = (spiel.kaufMengeIndex + 1) % DATA.KAUF.MENGEN.length;
  },

  /**
   * Wie viele Level ein Klick auf diese Karte gerade kaufen wuerde.
   *
   * Auch die festen Mengen werden am Maximallevel abgeschnitten: stehen bei
   * Maximum 25 noch sieben Level aus, kauft x10 sieben und nicht zehn.
   */
  anzahlFuer(u) {
    const menge = this.menge();
    if (menge === 'MAX') return u.maxAnzahl();
    return Math.max(0, Math.min(menge, u.maxLevel() - u.level()));
  },

  /** Mehrere Level auf einmal. Reicht das Guthaben nicht, passiert nichts. */
  kaufenMenge(u) {
    const anzahl = this.anzahlFuer(u);
    if (anzahl <= 0) return false;

    const kosten = u.kostenFuer(anzahl);
    if (spiel.punkte < kosten) return false;

    spiel.punkte -= kosten;
    u.anhebenUm(anzahl);
    return true;
  },

  /**
   * Aufstieg eines Rings.
   *
   * Der Ring faellt auf Level 1 und damit auf seinen Grundzuwachs zurueck,
   * bekommt dafuer ein hoeheres Maximum und einen staerkeren Faktor je Level.
   * Weil die Preiskurve am Level haengt, beginnt sie damit von selbst wieder
   * von vorn - ohne das waere der Wiederaufbau unbezahlbar.
   *
   * Punkte, Punktestand und alle anderen Ringe bleiben unangetastet, und ein
   * bereits freigeschalteter Ring bleibt frei: dass Ring 3 auf Level 1
   * zurueckfaellt, sperrt Ring 4 nicht wieder zu.
   */
  ascensionMoeglich(ring) {
    return Logik.ringAmMaximum(ring) && spiel.punkte >= Logik.ascensionPreis(ring);
  },

  ascension(ring) {
    if (!this.ascensionMoeglich(ring)) return false;
    spiel.punkte -= Logik.ascensionPreis(ring);
    spiel.ascensions[ring - 1]++;
    spiel.ringLevel[ring - 1] = 1;
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
