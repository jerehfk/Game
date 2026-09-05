'use strict';

/**
 * Darstellung der Zielscheibe auf Canvas.
 *
 * Bewusst kein DOM-Element je Pfeil: bei zehn Schuessen pro Sekunde waeren das
 * laufend Knoten zum Anlegen und Aufraeumen. Die Ringe liegen zusaetzlich auf
 * einer zweiten, unsichtbaren Leinwand und werden je Frame nur kopiert - sie
 * aendern sich nie, nur die Pfeile darauf.
 */
const Scheibe = {
  canvas: null,
  ctx: null,
  ringe: null,
  ringeCtx: null,

  /** Kantenlaenge in CSS-Pixeln. */
  groesse: 0,
  /** Pixel je normierter Radiuseinheit. */
  einheit: 0,

  /**
   * Eingeschlagene Pfeile, je {x, y, geboren} - Koordinaten in normierten
   * Einheiten, geboren als Zeitstempel in Sekunden.
   */
  pfeile: [],

  /** Laufende Einschlagringe, je {x, y, farbe, geboren}. */
  einschlaege: [],
  /** Aufsteigende Punktzahlen, je {x, y, text, farbe, geboren}. */
  zahlen: [],
  /** Zeitpunkt des letzten Treffers je Ring, Index 0 = Ring 1 (aussen). */
  ringBlitz: new Array(DATA.SCHEIBE.RINGE_GESAMT).fill(-Infinity),

  /**
   * Wer Bewegung im Betriebssystem abbestellt hat, bekommt die Treffer ohne
   * Bewegung: der Einschlagring erscheint gleich in voller Groesse und die
   * Punktzahl steht still. Verblassen bleibt - das ist keine Bewegung, und
   * ohne jede Rueckmeldung waere die Scheibe stumm.
   */
  ruhig: false,

  /**
   * Zeitbasis der Darstellung: Wanduhr, nicht Spielzeit. Wird die Seite
   * ausgeblendet und kehrt zurueck, sollen die alten Pfeile weg sein und
   * nicht dort weiterlaufen, wo sie unterbrochen wurden.
   */
  jetzt() {
    return performance.now() / 1000;
  },

  initialisieren(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ringe = document.createElement('canvas');
    this.ringeCtx = this.ringe.getContext('2d');

    const abfrage = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.ruhig = abfrage.matches;
    abfrage.addEventListener('change', (e) => { this.ruhig = e.matches; });

    this.anpassen();
    window.addEventListener('resize', () => this.anpassen());
  },

  /** Canvas an die Breite des Rahmens und die Pixeldichte anpassen. */
  anpassen() {
    const rahmen = this.canvas.parentElement;
    const innen = rahmen.clientWidth - 20; // Innenabstand des Rahmens
    this.groesse = Math.max(220, Math.round(innen));

    const dpr = window.devicePixelRatio || 1;
    for (const c of [this.canvas, this.ringe]) {
      c.width = Math.round(this.groesse * dpr);
      c.height = Math.round(this.groesse * dpr);
    }
    this.canvas.style.height = this.groesse + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ringeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Der Rand der Leinwand entspricht MAX_ANZEIGE_RADIUS, damit knapp
    // danebengegangene Pfeile noch ins Bild passen.
    this.einheit = (this.groesse / 2) / DATA.SCHEIBE.MAX_ANZEIGE_RADIUS;
    this.ringeZeichnen();
  },

  /** Die zehn Ringe einmalig in den Hintergrundpuffer malen. */
  ringeZeichnen() {
    const ctx = this.ringeCtx;
    const mitte = this.groesse / 2;

    ctx.clearRect(0, 0, this.groesse, this.groesse);
    ctx.fillStyle = DATA.SCHEIBE.HINTERGRUND;
    ctx.fillRect(0, 0, this.groesse, this.groesse);

    // Von aussen nach innen: jeder Ring ist eine volle Scheibe, die den
    // naechstgroesseren ueberdeckt. Index 0 ist Ring 1 (aussen).
    for (let i = 0; i < DATA.RINGE.length; i++) {
      const radius = (DATA.SCHEIBE.RINGE_GESAMT - i) * DATA.SCHEIBE.RING_BREITE;
      ctx.beginPath();
      ctx.arc(mitte, mitte, radius * this.einheit, 0, Math.PI * 2);
      ctx.fillStyle = DATA.RINGE[i].farbe;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(mitte, mitte, DATA.SCHEIBE.RADIUS * this.einheit, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
  },

  /** Einen Einschlag vormerken. */
  pfeilMerken(x, y) {
    this.pfeile.push({ x, y, geboren: this.jetzt() });
    // Notbremse; im regulaeren Spiel raeumt die Lebensdauer schneller ab.
    if (this.pfeile.length > DATA.SCHEIBE.MAX_PFEILE) {
      this.pfeile.splice(0, this.pfeile.length - DATA.SCHEIBE.MAX_PFEILE);
    }
  },

  pfeileLeeren() {
    this.pfeile.length = 0;
    this.einschlaege.length = 0;
    this.zahlen.length = 0;
    this.ringBlitz.fill(-Infinity);
  },

  /**
   * Rueckmeldung auf einen Treffer vormerken: Einschlagring, Punktzahl und
   * Ringblitz. Nur fuer Treffer - ein Schuss daneben bekommt nichts davon.
   */
  trefferMerken(x, y, ring, zuwachs) {
    const a = DATA.ANIMATION;
    const jetzt = this.jetzt();
    const farbe = DATA.RINGE[ring - 1].farbe;

    this.einschlaege.push({ x, y, farbe, geboren: jetzt });
    this.ringBlitz[ring - 1] = jetzt;

    // Bei hohem Schusstempo wuerde die Scheibe sonst unter Zahlen
    // verschwinden. Der Einschlagring bleibt in jedem Fall.
    if (this.einschlaege.length + this.zahlen.length <= a.MAX_GLEICHZEITIG) {
      // Angezeigt wird der Zuwachs auf punkteProTreffer, nicht die einmalige
      // Gutschrift: die ist bei jedem Treffer gleich und damit uninteressant.
      this.zahlen.push({
        x, y, farbe,
        text: '+' + Logik.formatiereZahl(zuwachs),
        geboren: jetzt
      });
    }
  },

  /** Abgelaufene Animationen entfernen; beide Listen sind nach Alter sortiert. */
  animationenAufraeumen(jetzt) {
    const a = DATA.ANIMATION;
    let n = 0;
    while (n < this.einschlaege.length && jetzt - this.einschlaege[n].geboren >= a.EINSCHLAG_DAUER) n++;
    if (n > 0) this.einschlaege.splice(0, n);

    n = 0;
    while (n < this.zahlen.length && jetzt - this.zahlen[n].geboren >= a.ZAHL_DAUER) n++;
    if (n > 0) this.zahlen.splice(0, n);
  },

  /** Der zuletzt getroffene Ring hellt sich als Band kurz auf. */
  ringblitzeZeichnen(jetzt) {
    const a = DATA.ANIMATION;
    const ctx = this.ctx;
    const mitte = this.groesse / 2;
    const breite = DATA.SCHEIBE.RING_BREITE * this.einheit;

    for (let i = 0; i < this.ringBlitz.length; i++) {
      const rest = 1 - (jetzt - this.ringBlitz[i]) / a.RINGBLITZ_DAUER;
      if (rest <= 0 || rest > 1) continue;

      // Als Band gezeichnet statt als gefuellte Scheibe: sonst wuerde der
      // Blitz alle weiter innen liegenden Ringe mit ueberdecken.
      const ring = i + 1;
      const aussen = (DATA.SCHEIBE.RINGE_GESAMT - ring + 1) * DATA.SCHEIBE.RING_BREITE;
      ctx.beginPath();
      ctx.arc(mitte, mitte, aussen * this.einheit - breite / 2, 0, Math.PI * 2);
      ctx.lineWidth = breite;
      ctx.strokeStyle = 'rgba(255, 255, 255, ' + (a.RINGBLITZ_STAERKE * rest).toFixed(3) + ')';
      ctx.stroke();
    }
  },

  einschlaegeZeichnen(jetzt) {
    const a = DATA.ANIMATION;
    const ctx = this.ctx;
    const mitte = this.groesse / 2;

    for (const e of this.einschlaege) {
      const anteil = (jetzt - e.geboren) / a.EINSCHLAG_DAUER;
      if (anteil < 0 || anteil >= 1) continue;

      const wachstum = this.ruhig ? a.EINSCHLAG_WACHSTUM : 1 + (a.EINSCHLAG_WACHSTUM - 1) * anteil;
      const px = mitte + e.x * this.einheit;
      const py = mitte + e.y * this.einheit;
      const radius = a.EINSCHLAG_RADIUS * wachstum;

      ctx.globalAlpha = 1 - anteil;

      // Der Ring traegt die Farbe des getroffenen Rings - und liegt genau
      // darauf. Ohne dunklen Umriss darunter waere ein Treffer in Ring 10 ein
      // roter Kreis auf Rot und damit unsichtbar.
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.lineWidth = a.EINSCHLAG_UMRISS;
      ctx.strokeStyle = 'rgba(10, 11, 14, 0.7)';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.lineWidth = a.EINSCHLAG_STRICH;
      ctx.strokeStyle = e.farbe;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  zahlenZeichnen(jetzt) {
    const a = DATA.ANIMATION;
    const ctx = this.ctx;
    const mitte = this.groesse / 2;

    ctx.font = a.ZAHL_SCHRIFT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const z of this.zahlen) {
      const anteil = (jetzt - z.geboren) / a.ZAHL_DAUER;
      if (anteil < 0 || anteil >= 1) continue;

      const steigung = this.ruhig ? 0 : a.ZAHL_STEIGUNG * anteil;
      const px = mitte + z.x * this.einheit;
      const py = mitte + z.y * this.einheit - steigung;

      ctx.globalAlpha = 1 - anteil;
      // Dunkler Umriss, damit die Zahl auf jeder Ringfarbe lesbar bleibt.
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10, 11, 14, 0.85)';
      ctx.strokeText(z.text, px, py);
      ctx.fillStyle = z.farbe;
      ctx.fillText(z.text, px, py);
    }
    ctx.globalAlpha = 1;
  },

  /**
   * Abgelaufene Pfeile entfernen.
   *
   * Sie werden verdichtet statt einzeln herausgeschnitten: die Liste ist nach
   * Alter sortiert, also stehen die abgelaufenen immer vorn, und ein einziges
   * splice reicht. Unsichtbar mitzufuehren waere die schlechtere Wahl - bei
   * zehn Schuss pro Sekunde waechst die Liste sonst unbegrenzt.
   */
  pfeileAufraeumen(jetzt) {
    const grenze = jetzt - DATA.SCHEIBE.PFEIL_LEBENSDAUER;
    let abgelaufen = 0;
    while (abgelaufen < this.pfeile.length && this.pfeile[abgelaufen].geboren <= grenze) {
      abgelaufen++;
    }
    if (abgelaufen > 0) this.pfeile.splice(0, abgelaufen);
  },

  zeichnen() {
    const ctx = this.ctx;
    const mitte = this.groesse / 2;
    const jetzt = this.jetzt();

    this.pfeileAufraeumen(jetzt);
    this.animationenAufraeumen(jetzt);

    ctx.drawImage(this.ringe, 0, 0, this.groesse, this.groesse);
    this.ringblitzeZeichnen(jetzt);

    // Alle Pfeile in einem Durchgang; kein DOM-Knoten je Pfeil.
    for (let i = 0; i < this.pfeile.length; i++) {
      const p = this.pfeile[i];
      const px = mitte + p.x * this.einheit;
      const py = mitte + p.y * this.einheit;

      // Voll sichtbar im Moment des Treffers, danach gleichmaessig auf null.
      const rest = 1 - (jetzt - p.geboren) / DATA.SCHEIBE.PFEIL_LEBENSDAUER;
      if (rest <= 0) continue;

      ctx.beginPath();
      ctx.arc(px, py, 3.1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(14, 15, 19, ' + (0.85 * rest).toFixed(3) + ')';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, ' + (0.95 * rest).toFixed(3) + ')';
      ctx.fill();
    }

    // Zuletzt, damit Einschlagringe und Zahlen ueber den Pfeilen liegen.
    this.einschlaegeZeichnen(jetzt);
    this.zahlenZeichnen(jetzt);
  }
};
