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
  kostenRing(ring, level, ascensions) {
    return Math.round(this.rohkostenRing(ring, level, ascensions));
  },

  /**
   * Ungerundeter Preis - nur intern, damit sich Rundungen nicht summieren,
   * wenn mehrere Level am Stueck gerechnet werden.
   */
  rohkostenRing(ring, level, ascensions) {
    const r = DATA.RINGE[ring - 1];
    return this.ringGrundpreis(ring, ascensions) * Math.pow(r.kostenfaktor, level - 1);
  },

  /**
   * Grundpreis eines Rings - der Preis fuer Level 1 auf 2.
   *
   * Er verdreifacht sich mit jedem Aufstieg. Nach der Ascension faellt das
   * Level auf 1 zurueck, die Preiskurve beginnt also von diesem erhoehten
   * Grundpreis aus wieder von vorn.
   */
  ringGrundpreis(ring, ascensions) {
    const r = DATA.RINGE[ring - 1];
    const a = this.ringAscensions(ring, ascensions);
    if (a <= 0) return r.grundpreis;

    // Jede Ascension setzt den Grundpreis auf den Preis des zuletzt
    // erreichbaren Levels, multipliziert ihn also mit
    // kostenfaktor^maxLevel(Stufe). Ueber alle bisherigen Stufen summieren
    // sich diese Exponenten zu 25a + 10*a*(a-1)/2 - deshalb reicht eine
    // Potenz statt einer Schleife.
    const m = DATA.ASCENSION;
    const exponent = m.MAX_LEVEL_BASIS * a
      + m.MAX_LEVEL_JE_ASCENSION * a * (a - 1) / 2;
    return r.grundpreis * Math.pow(r.kostenfaktor, exponent);
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
  kostenRingMenge(ring, level, anzahl, ascensions) {
    if (anzahl <= 0) return 0;
    if (anzahl === 1) return this.kostenRing(ring, level, ascensions);

    const q = DATA.RINGE[ring - 1].kostenfaktor;
    const reihe = (Math.pow(q, anzahl) - 1) / (q - 1);
    return Math.round(this.rohkostenRing(ring, level, ascensions) * reihe);
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
    return grund * this.schwungMultiplikator()
      * Math.pow(this.ringFaktor(ring, ascensions), level - 1);
  },

  // --- Prestige -----------------------------------------------------------

  /** Sind die beiden mit Federn gekauften Achsen schon sichtbar? */
  globaleUpgradesFrei() {
    return spiel.prestiges > 0;
  },

  /** Vervielfacht alle Ring-Zuwaechse; ohne gekauftes Schwung genau 1. */
  schwungMultiplikator() {
    return Math.pow(DATA.PRESTIGE.SCHWUNG_MULTIPLIKATOR, spiel.schwungLevel);
  },

  /**
   * Federn fuer einen Treffer in diesem Ring.
   *
   * Die Kopplungsregel: ein Ring liefert nur, wenn sein Ring-Upgrade
   * freigeschaltet ist. Damit muss man sich jede Runde erst bis Ring 5
   * durcharbeiten, bevor ueberhaupt eine Feder faellt - sonst haengen die
   * Federn allein an der Schusszahl.
   */
  federnFuerRing(ring) {
    if (ring <= 0) return 0;
    if (!this.ringFreigeschaltet(ring)) return 0;
    return DATA.PRESTIGE.FEDERN_JE_RING[ring - 1];
  },

  /** Erwartete Federn je Schuss - fuer die Offline-Zeit. */
  erwarteteFedernProSchuss(stand) {
    const p = this.ringWahrscheinlichkeiten(this.streuung(stand.zielgenauigkeitLevel));
    let summe = 0;
    for (let i = 0; i < p.length; i++) summe += p[i] * this.federnFuerRing(i + 1);
    return summe;
  },

  /**
   * Preis fuer mehrere Level einer Kurve basis * faktor^(level-1) am Stueck -
   * dieselbe geometrische Summe wie bei den Ringen, geklammert und gerundet.
   */
  preisreihe(basis, faktor, level, anzahl) {
    if (anzahl <= 0) return 0;
    const start = basis * Math.pow(faktor, level - 1);
    if (anzahl === 1) return Math.round(start);
    return Math.round(start * ((Math.pow(faktor, anzahl) - 1) / (faktor - 1)));
  },

  /**
   * Wie viele Stufen ein Guthaben hergibt, wenn der Preis nur ueber
   * kostenFuer erreichbar ist. Hochzaehlen genuegt: die Federn-Preise steigen
   * mit 1,08 bis 2,5 je Level, es sind also nie viele.
   */
  maxKaufbareStufen(u, guthaben, rest) {
    let anzahl = 0;
    while (anzahl < rest && u.kostenFuer(anzahl + 1) <= guthaben) anzahl++;
    return anzahl;
  },

  preisZielgenauigkeit(level) {
    const p = DATA.PRESTIGE;
    return Math.round(p.ZIELGENAUIGKEIT_PREIS_BASIS
      * Math.pow(p.ZIELGENAUIGKEIT_PREIS_FAKTOR, level - 1));
  },

  preisSchussintervall(level) {
    const p = DATA.PRESTIGE;
    return Math.round(p.SCHUSSINTERVALL_PREIS_BASIS
      * Math.pow(p.SCHUSSINTERVALL_PREIS_FAKTOR, level - 1));
  },

  /** Schwung beginnt bei Level 0, deshalb der Exponent ohne Minus-Eins. */
  preisSchwung(level) {
    const p = DATA.PRESTIGE;
    return Math.round(p.SCHWUNG_PREIS_BASIS * Math.pow(p.SCHWUNG_PREIS_FAKTOR, level));
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
   * Preis des Aufstiegs: das Vielfache dessen, was das naechste - nicht mehr
   * kaufbare - Level gekostet haette.
   *
   * Gerechnet wird mit dem aktuellen, also bereits verdreifachten Grundpreis.
   * Dadurch wachsen Aufstieg und Wiederaufbau im selben Takt.
   */
  ascensionPreis(ring, ascensions) {
    const r = DATA.RINGE[ring - 1];
    const stufe = this.ringAscensions(ring, ascensions);

    // Gerundet wie jeder andere Preis - Anzeige und Kaufpruefung nehmen
    // denselben Wert, sonst steht da 999 und der Kauf scheitert an 999,9999.
    return Math.round(DATA.ASCENSION.PREIS_VIELFACHES
      * this.ringGrundpreis(ring, stufe)
      * Math.pow(r.kostenfaktor, this.ringMaxLevel(ring, stufe)));
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

  /** Feste Nachkommastellen in deutscher Schreibweise. */
  komma(wert, stellen) {
    return wert.toFixed(stellen).replace('.', DATA.FORMAT.DEZIMAL_TRENNER);
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
    if (Logik.globaleUpgradesFrei()) this.globaleAufbauen();
    this.ringeAufbauen();
  },

  /**
   * Die drei mit Federn gekauften Upgrades. Sie erscheinen erst nach dem
   * ersten Prestige und ueberdauern jede Runde.
   */
  globaleAufbauen() {
    const p = DATA.PRESTIGE;

    this.alle.push({
      id: 'zielgenauigkeit',
      gruppe: 'federn',
      name: 'Zielgenauigkeit',
      waehrung: 'federn',
      maxLevel: () => DATA.ZIELGENAUIGKEIT.MAX_LEVEL,
      level: () => spiel.zielgenauigkeitLevel,
      wirkung: () => 'Streuung ' + Logik.komma(Logik.streuung(spiel.zielgenauigkeitLevel), 3),
      kostenFuer: (anzahl) => Logik.preisreihe(
        p.ZIELGENAUIGKEIT_PREIS_BASIS, p.ZIELGENAUIGKEIT_PREIS_FAKTOR,
        spiel.zielgenauigkeitLevel, anzahl),
      anhebenUm: (anzahl) => { spiel.zielgenauigkeitLevel += anzahl; }
    });

    this.alle.push({
      id: 'schussintervall',
      gruppe: 'federn',
      name: 'Schussintervall',
      waehrung: 'federn',
      maxLevel: () => DATA.SCHUSSINTERVALL.MAX_LEVEL,
      level: () => spiel.schussintervallLevel,
      wirkung: () => {
        const i = Logik.schussintervall(spiel.schussintervallLevel);
        return Logik.komma(i, 2) + ' s · ' + Logik.komma(1 / i, 2) + ' Schuss/s';
      },
      kostenFuer: (anzahl) => Logik.preisreihe(
        p.SCHUSSINTERVALL_PREIS_BASIS, p.SCHUSSINTERVALL_PREIS_FAKTOR,
        spiel.schussintervallLevel, anzahl),
      anhebenUm: (anzahl) => { spiel.schussintervallLevel += anzahl; }
    });

    this.alle.push({
      id: 'schwung',
      gruppe: 'federn',
      name: 'Schwung',
      waehrung: 'federn',
      maxLevel: () => Infinity,
      level: () => spiel.schwungLevel,
      wirkung: () => '×' + Logik.formatiereZahl(Logik.schwungMultiplikator()),
      // Schwung beginnt bei Level 0, deshalb der um eins verschobene Start.
      kostenFuer: (anzahl) => Logik.preisreihe(
        p.SCHWUNG_PREIS_BASIS, p.SCHWUNG_PREIS_FAKTOR, spiel.schwungLevel + 1, anzahl),
      anhebenUm: (anzahl) => { spiel.schwungLevel += anzahl; }
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

  /** Woraus dieses Upgrade bezahlt wird - Punkte oder Federn. */
  guthaben(u) {
    return u.waehrung === 'federn' ? spiel.federn : spiel.punkte;
  },

  abbuchen(u, betrag) {
    if (u.waehrung === 'federn') spiel.federn -= betrag;
    else spiel.punkte -= betrag;
  },

  bezahlbar(u) {
    const anzahl = this.anzahlFuer(u);
    return anzahl > 0 && this.guthaben(u) >= u.kostenFuer(anzahl);
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
    const rest = u.maxLevel() - u.level();
    if (menge !== 'MAX') return Math.max(0, Math.min(menge, rest));

    // MAX: die Ringe loesen die Summenformel auf, die Federn-Upgrades zaehlen
    // hoch - dort sind es nie viele Level, weil die Preise steil steigen.
    if (u.maxAnzahl) return u.maxAnzahl();
    return Logik.maxKaufbareStufen(u, this.guthaben(u), rest);
  },

  /** Mehrere Level auf einmal. Reicht das Guthaben nicht, passiert nichts. */
  kaufenMenge(u) {
    const anzahl = this.anzahlFuer(u);
    if (anzahl <= 0) return false;

    const kosten = u.kostenFuer(anzahl);
    if (this.guthaben(u) < kosten) return false;

    this.abbuchen(u, kosten);
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
  /** Reichen die angesammelten Federn fuer ein Prestige? */
  prestigeMoeglich() {
    return spiel.federnAnstehend >= DATA.PRESTIGE.MINDEST_FEDERN;
  },

  /**
   * Prestige: die Runde faellt komplett zurueck, die Federn werden
   * gutgeschrieben.
   *
   * Zurueckgesetzt wird ueber Zustand.neu(), damit kein Feld vergessen wird -
   * auch die Grundpreise der Ringe, die an den Ascensions haengen. Danach
   * werden genau die Felder wieder eingesetzt, die das Prestige ueberdauern.
   */
  prestige() {
    if (!this.prestigeMoeglich()) return false;

    const behalten = {
      federn: spiel.federn + spiel.federnAnstehend,
      prestiges: spiel.prestiges + 1,
      zielgenauigkeitLevel: spiel.zielgenauigkeitLevel,
      schussintervallLevel: spiel.schussintervallLevel,
      schwungLevel: spiel.schwungLevel,
      kaufMengeIndex: spiel.kaufMengeIndex
    };

    spiel = Object.assign(Zustand.neu(), behalten);
    return true;
  },

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
