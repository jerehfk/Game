'use strict';

/**
 * Startpunkt und Spielschleife.
 *
 * Gerechnet wird jeden Frame mit der tatsaechlich vergangenen Zeit, gezeichnet
 * wird nur im Takt von DATA.SCHLEIFE.UI_HZ. Ein Frame mehr oder weniger darf
 * den Fortschritt nicht veraendern.
 */
const Spiel = {
  letzterFrame: 0,
  uiKonto: 0,
  /** Aufgelaufene Zeit, aus der einzelne Schuesse werden. */
  schussKonto: 0,
  speicherKonto: 0,
  /**
   * Wie lange ununterbrochen kein einziges Upgrade bezahlbar war. Daraus
   * entsteht der Hinweis, dass die Demo hier endet - der Reset, der diese
   * Wand spaeter aufloest, ist noch nicht Teil des Spiels.
   */
  wandKonto: 0,

  starten() {
    Upgrades.aufbauen();
    Scheibe.initialisieren(document.getElementById('scheibe'));
    Overlay.initialisieren();
    UI.initialisieren();

    const abwesend = Speicher.laden();
    this.verteilungAufsetzen();
    if (abwesend !== null) this.offlineGutschreiben(abwesend);
    UI.aktualisieren();

    window.addEventListener('beforeunload', () => Speicher.speichern());
    // Auf Mobilgeraeten wird beforeunload haeufig nicht mehr ausgeloest;
    // das Verstecken des Tabs ist dort das verlaesslichere Signal.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') Speicher.speichern();
    });

    this.letzterFrame = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  },

  /**
   * Nach Laden, Import oder Zuruecksetzen aufraeumen: die Scheibe zeigt sonst
   * noch die Einschlaege des alten Standes, und die gleitende Verteilung
   * gehoert zum alten Ausbaustand.
   */
  nachLadenAufsetzen() {
    Scheibe.pfeileLeeren();
    this.schussKonto = 0;
    this.verteilungAufsetzen();
    UI.aktualisieren();
  },

  /**
   * Die Trefferverteilung wird nicht gespeichert, sondern aus dem
   * Erwartungswert des geladenen Ausbaustands neu aufgesetzt - sonst stuende
   * die Anzeige nach dem Laden minutenlang auf einem falschen Bild.
   */
  verteilungAufsetzen() {
    const p = Logik.ringWahrscheinlichkeiten(Logik.streuung(spiel.zielgenauigkeitLevel));
    Verteilung.leeren();
    Verteilung.meldenViele(p, DATA.STATISTIK.VERTEILUNG_FENSTER);
  },

  /** Abwesenheit verguetet nachtragen und darueber Auskunft geben. */
  offlineGutschreiben(sekunden) {
    const grenze = DATA.SPEICHERN.OFFLINE_MAX_STUNDEN * 3600;
    const angerechnet = Math.min(sekunden, grenze) * DATA.SPEICHERN.OFFLINE_VERGUETUNG;
    if (angerechnet < 1) return;

    const vorher = spiel.punkte;
    const vorherProTreffer = spiel.punkteProTreffer;
    this.nachrechnen(angerechnet);

    const absaetze = [
      'Der Bogen hat weitergeschossen: ' + Logik.formatiereDauer(angerechnet) +
      ' ergeben ' + Logik.formatiereZahl(spiel.punkte - vorher) + ' Punkte.',
      'Punkte pro Treffer sind dabei von ' + Logik.formatiereZahl(vorherProTreffer) +
      ' auf ' + Logik.formatiereZahl(spiel.punkteProTreffer) + ' gestiegen.'
    ];
    if (sekunden > grenze) {
      absaetze.push('Angerechnet werden höchstens ' +
        DATA.SPEICHERN.OFFLINE_MAX_STUNDEN + ' Stunden; tatsaechlich weg warst du ' +
        Logik.formatiereDauer(sekunden) + '.');
    }
    Overlay.mitteilen('Willkommen zurück', absaetze);
  },

  frame(jetzt) {
    let delta = (jetzt - this.letzterFrame) / 1000;
    this.letzterFrame = jetzt;
    if (delta < 0) delta = 0;

    // Groessere Luecken entstehen, wenn der Tab im Hintergrund lag: dort steht
    // requestAnimationFrame still. Sie einzeln nachzuschiessen waere teuer und
    // wuerde die Scheibe mit einem Schlag zupflastern.
    if (delta > DATA.SCHLEIFE.NACHRECHNEN_AB_SEKUNDEN) {
      this.nachrechnen(delta);
      delta = 0;
    }

    this.rechnen(delta);

    this.speicherKonto += delta;
    if (this.speicherKonto >= DATA.SPEICHERN.AUTOSAVE_SEKUNDEN) {
      this.speicherKonto = 0;
      Speicher.speichern();
    }

    this.uiKonto += delta;
    if (this.uiKonto >= 1 / DATA.SCHLEIFE.UI_HZ) {
      this.uiKonto = 0;
      Scheibe.zeichnen();
      UI.aktualisieren();
    }

    requestAnimationFrame((t) => this.frame(t));
  },

  rechnen(delta) {
    if (delta <= 0) return;
    spiel.statistik.spielzeit += delta;

    this.wandKonto = spiel.punkte >= Upgrades.guenstigste() ? 0 : this.wandKonto + delta;

    const intervall = Logik.schussintervall(spiel.schussintervallLevel);
    const streuung = Logik.streuung(spiel.zielgenauigkeitLevel);

    this.schussKonto += delta;
    let anzahl = Math.floor(this.schussKonto / intervall);
    if (anzahl <= 0) return;

    this.schussKonto -= anzahl * intervall;

    // Notbremse, falls doch einmal sehr viele Schuesse zusammenkommen: der
    // Ueberhang wird ueber den Erwartungswert verrechnet statt einzeln.
    if (anzahl > DATA.SCHLEIFE.MAX_SCHUESSE_PRO_FRAME) {
      const ueberhang = anzahl - DATA.SCHLEIFE.MAX_SCHUESSE_PRO_FRAME;
      anzahl = DATA.SCHLEIFE.MAX_SCHUESSE_PRO_FRAME;
      this.schuesseVerrechnen(ueberhang);
    }

    for (let i = 0; i < anzahl; i++) this.einSchuss(streuung);
  },

  /** Ein einzelner, tatsaechlich ausgewuerfelter Schuss. */
  einSchuss(streuung) {
    const s = Logik.schuss(streuung);
    const st = spiel.statistik;

    // Gerechnet wird mit dem echten Abstand, gezeichnet an der gestreckten
    // Position - sonst laege die halbe Scheibe in einem einzigen Pixel.
    const anzeige = Logik.anzeigePosition(s);

    st.schuesse++;
    Verteilung.melden(s.ring);
    Scheibe.pfeilMerken(anzeige.x, anzeige.y);

    if (s.ring > 0) {
      const zuwachs = Logik.ringZuwachs(s.ring, spiel.ringLevel[s.ring - 1]);
      st.treffer++;
      st.ringTreffer[s.ring - 1]++;

      // Reihenfolge: erst gutschreiben, dann erhoehen. Andersherum wuerde ein
      // Treffer bereits von seinem eigenen Zuwachs profitieren.
      spiel.punkte += spiel.punkteProTreffer;
      spiel.punkteProTreffer += zuwachs;

      Scheibe.trefferMerken(anzeige.x, anzeige.y, s.ring, zuwachs);
    }
  },

  /**
   * Viele Schuesse ueber den Erwartungswert gutschreiben.
   *
   * Nicht Ertrag mal Zeit: waehrend der Zeitspanne waechst punkteProTreffer
   * mit jedem Treffer weiter, der Ertrag steigt also quadratisch. Die
   * geschlossene Form dafuer steht in Logik.ertragUeberZeit.
   *
   * Die Statistikzaehler werden dabei gebrochen - beim Anzeigen wird gerundet.
   */
  schuesseVerrechnen(anzahl) {
    if (anzahl <= 0) return;
    const streuung = Logik.streuung(spiel.zielgenauigkeitLevel);
    const p = Logik.ringWahrscheinlichkeiten(streuung);
    const st = spiel.statistik;
    const intervall = Logik.schussintervall(spiel.schussintervallLevel);

    const ertrag = Logik.ertragUeberZeit(spiel, anzahl * intervall);
    spiel.punkte += ertrag.punkte;
    spiel.punkteProTreffer += ertrag.zuwachs;

    for (let i = 0; i < p.length; i++) {
      const treffer = p[i] * anzahl;
      st.ringTreffer[i] += treffer;
      st.treffer += treffer;
    }
    st.schuesse += anzahl;
    Verteilung.meldenViele(p, anzahl);
  },

  /** Verstrichene Zeit ohne laufende Schleife nachtragen. */
  nachrechnen(sekunden) {
    const intervall = Logik.schussintervall(spiel.schussintervallLevel);
    spiel.statistik.spielzeit += sekunden;
    this.schuesseVerrechnen(sekunden / intervall);
  }
};

window.addEventListener('DOMContentLoaded', () => Spiel.starten());
