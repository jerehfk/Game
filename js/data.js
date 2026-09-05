'use strict';

/**
 * Balancing-Daten.
 *
 * Diese Datei ist die einzige Stelle im Projekt, an der Balancing-Zahlen
 * stehen duerfen. Alles andere liest ausschliesslich von hier, damit sich das
 * Spiel durch Aendern dieser Datei umstimmen laesst, ohne Logik anzufassen.
 */
const DATA = {

  /**
   * Die zehn Ringe, Index 0 = Ring 1 (aussen) bis Index 9 = Ring 10 (Mitte).
   *
   * Die Grundpunkte sind eine Fibonacci-Reihe: der Sprung nach innen soll sich
   * spuerbar lohnen, aber nicht so steil sein, dass Aussenringe wertlos werden.
   *
   * Der Grundpreis ist der Preis fuer den Aufstieg von Level 1 auf Level 2.
   * Die Reihe ist absichtlich unregelmaessig: zwischen Ring 4 und 5 liegen
   * zwei Zehnerpotenzen, ab Ring 5 jeweils drei, zwischen Ring 9 und 10 dann
   * neun. Ring 10 ist damit das Fernziel des gesamten Spiels und in einem
   * Durchgang nicht erreichbar - die Sprunge sind kein Versehen und gehoeren
   * nicht geglaettet.
   */
  RINGE: [
    { nummer:  1, name: 'weiss',     farbe: '#fdfdfd', grundpunkte:  1, grundpreis: 1e1  },
    { nummer:  2, name: 'magenta',   farbe: '#e04ad0', grundpunkte:  2, grundpreis: 1e2  },
    { nummer:  3, name: 'violett',   farbe: '#9b48ed', grundpunkte:  3, grundpreis: 1e3  },
    { nummer:  4, name: 'blau',      farbe: '#4a7ce8', grundpunkte:  5, grundpreis: 1e4  },
    { nummer:  5, name: 'cyan',      farbe: '#4bfefe', grundpunkte:  8, grundpreis: 1e6  },
    { nummer:  6, name: 'tuerkis',   farbe: '#4af8dd', grundpunkte: 13, grundpreis: 1e9  },
    { nummer:  7, name: 'gruen',     farbe: '#6bf57e', grundpunkte: 21, grundpreis: 1e12 },
    { nummer:  8, name: 'gelbgruen', farbe: '#a4f248', grundpunkte: 34, grundpreis: 1e15 },
    { nummer:  9, name: 'orange',    farbe: '#fda54c', grundpunkte: 55, grundpreis: 1e18 },
    { nummer: 10, name: 'rot',       farbe: '#ff5959', grundpunkte: 89, grundpreis: 1e27 }
  ],

  /** Geometrie der Scheibe in normierten Einheiten (Aussenrand = Radius 1). */
  SCHEIBE: {
    RINGE_GESAMT: 10,
    RADIUS: 1,
    /** Alle Ringe sind gleich breit: 1 / 10 Radius je Ring. */
    RING_BREITE: 0.1,
    HINTERGRUND: '#16171c',
    /**
     * Sekunden, ueber die ein eingeschlagener Pfeil gleichmaessig auf null
     * verblasst; danach wird er entfernt. Bei vollem Tempo (zehn Schuss pro
     * Sekunde) sind das bis zu hundert Pfeile gleichzeitig.
     */
    PFEIL_LEBENSDAUER: 10,
    /**
     * Harte Obergrenze als Notbremse. Im regulaeren Spiel wird sie nicht
     * erreicht - sie faengt nur den Fall ab, dass nach einer Denkpause sehr
     * viele Schuesse in einem einzigen Frame nachgeholt werden.
     */
    MAX_PFEILE: 300,
    /**
     * Weit daneben gegangene Pfeile werden nicht mehr gezeichnet. Bei Level 1
     * (Streuung 0,69) liegen einzelne Schuesse bei Radius 3 und wuerden die
     * Scheibe sonst auf Briefmarkengroesse schrumpfen.
     */
    MAX_ANZEIGE_RADIUS: 1.28
  },

  /**
   * Zielgenauigkeit: verringert die Standardabweichung der Trefferstreuung.
   * Level 1 => 0,690 (35 % Fehlschuesse), Level 300 => 0,081.
   * Auch am Maximum bleibt eine Reststreuung (ca. 53 % Ring 10, 42 % Ring 9,
   * 4,6 % Ring 8) - das ist gewollt und darf nicht wegoptimiert werden.
   */
  ZIELGENAUIGKEIT: {
    START_STREUUNG: 0.690,
    FAKTOR_PRO_LEVEL: 0.99286,
    MAX_LEVEL: 300,
    KOSTEN_BASIS: 20,
    KOSTEN_FAKTOR: 1.05,
    /**
     * Zusaetzlich alle 20 Level ein Kostensprung um Faktor 3. Diese Sprunge
     * sind die Wand, an der die Demo endet und spaeter der Reset ansetzt.
     */
    KOSTEN_SPRUNG_FAKTOR: 3.0,
    KOSTEN_SPRUNG_ALLE: 20
  },

  /**
   * Schussintervall: Sekunden zwischen zwei Schuessen.
   * Level 1 => 3,0 s, Level 200 => 0,1 s (zehn Pfeile pro Sekunde).
   */
  SCHUSSINTERVALL: {
    START_SEKUNDEN: 3.0,
    FAKTOR_PRO_LEVEL: 0.98305,
    MAX_LEVEL: 200,
    KOSTEN_BASIS: 40,
    KOSTEN_FAKTOR: 1.05
  },

  /**
   * Ring-Upgrades: zehn getrennte Upgrades, eines je Ring, ohne Maximum.
   *
   * Sie wirken auf den Zuwachs, den ein Treffer in diesem Ring dem Zaehler
   * punkteProTreffer gibt - nicht mehr auf eine einmalige Gutschrift.
   *
   * Der Grundpreis steht je Ring in RINGE - er staffelt die Ringe gegeneinander
   * und zwingt zur Entscheidung, welchen Ring man als naechsten aufmacht.
   *
   * Das Kostenwachstum liegt mit 1,10 deutlich ueber der Wirkung von 1,05.
   * Der Abstand muss groesser sein als bei einer einmaligen Gutschrift, weil
   * das Scoring rueckgekoppelt ist: Punkte kaufen Upgrades, die den Zaehler
   * schneller wachsen lassen, was wieder mehr Punkte gibt. Mit den frueheren
   * 1,06 stuende der Zaehler nach einer halben Stunde bei 10^14.
   */
  RING_UPGRADE: {
    FAKTOR_PRO_LEVEL: 1.05,
    KOSTEN_FAKTOR: 1.10,
    MAX_LEVEL: Infinity
  },

  /**
   * Scoring: Jeder Treffer gibt gleich viele Punkte - den aktuellen Stand von
   * punkteProTreffer - und hebt diesen Zaehler anschliessend um den Zuwachs
   * des getroffenen Rings. Ein guter Treffer wirkt damit dauerhaft auf jeden
   * folgenden, statt nur einmal.
   */
  SCORING: {
    /** Startwert des Zaehlers punkteProTreffer. */
    START_PUNKTE_PRO_TREFFER: 1
  },

  /**
   * Rueckmeldung auf einen Treffer. Ein Schuss daneben bekommt nichts davon -
   * nur den verblassenden Pfeil ausserhalb der Scheibe.
   */
  ANIMATION: {
    /** Einschlagring: duenner Kreis, der sich ausdehnt und verblasst. */
    EINSCHLAG_DAUER: 0.4,
    EINSCHLAG_RADIUS: 4,
    EINSCHLAG_STRICH: 1.8,
    /** Dunkler Umriss darunter, sonst geht die Ringfarbe auf dem Ring unter. */
    EINSCHLAG_UMRISS: 4,
    /** Endradius als Vielfaches des Startradius. */
    EINSCHLAG_WACHSTUM: 2.6,

    /** Punktzahl: steigt vom Trefferpunkt auf und verblasst. */
    ZAHL_DAUER: 0.8,
    ZAHL_STEIGUNG: 24,
    ZAHL_SCHRIFT: '600 12px "Segoe UI", system-ui, sans-serif',

    /** Ringblitz: der getroffene Ring hellt sich kurz auf. */
    RINGBLITZ_DAUER: 0.15,
    RINGBLITZ_STAERKE: 0.22,

    /**
     * Laufen mehr als so viele Animationen gleichzeitig, werden neue
     * Punktzahlen ausgelassen - bei vollem Tempo wuerde die Scheibe sonst
     * unter Zahlen verschwinden. Die Einschlagringe bleiben immer.
     */
    MAX_GLEICHZEITIG: 15
  },

  /** Spielschleife und Zeichenfrequenz. */
  SCHLEIFE: {
    /** Die Oberflaeche wird deutlich seltener neu gezeichnet als gerechnet. */
    UI_HZ: 20,
    /**
     * Groessere Luecken (Tab im Hintergrund, Standby) werden nicht Schuss fuer
     * Schuss nachgespielt, sondern ueber den Erwartungswert verrechnet.
     */
    NACHRECHNEN_AB_SEKUNDEN: 5,
    /** Obergrenze einzeln ausgewerteter Schuesse pro Frame. */
    MAX_SCHUESSE_PRO_FRAME: 500
  },

  /** Speicherstand. */
  SPEICHERN: {
    SCHLUESSEL: 'zielscheibe.spielstand',
    /** Versionsfeld, damit spaetere Formatwechsel migriert werden koennen. */
    VERSION: 2,
    AUTOSAVE_SEKUNDEN: 15,
    /** Abwesenheit wird voll verguetet, aber nur bis zu dieser Dauer. */
    OFFLINE_MAX_STUNDEN: 8,
    OFFLINE_VERGUETUNG: 1.0
  },

  STATISTIK: {
    /**
     * Die angezeigte Trefferverteilung ist ein gleitender Durchschnitt ueber
     * rund so viele Schuesse - sie soll auf gekaufte Zielgenauigkeit sichtbar
     * reagieren, statt die gesamte Spielzeit zu mitteln.
     */
    VERTEILUNG_FENSTER: 500
  },

  HINWEIS: {
    /**
     * So lange muss durchgehend kein einziges Upgrade bezahlbar sein, bevor
     * der Hinweis auf das Demo-Ende erscheint.
     */
    WAND_SEKUNDEN: 180
  },

  /**
   * Zahlwoerter fuer grosse Betraege; ab 10^12 wird auf 1,23e12 umgestellt.
   *
   * Die Reihe endet bewusst bei den Milliarden. Beide Kernzahlen wachsen weit
   * darueber hinaus, und erfundene Kuerzel wie Qa oder Sx sagen bei 10^20
   * niemandem mehr etwas - die Exponentialschreibweise ist dort schlicht
   * lesbarer.
   */
  FORMAT: {
    SUFFIXE: ['', 'K', 'M', 'B'],
    NACHKOMMA: 2
  }
};
