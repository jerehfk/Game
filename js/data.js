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
   * grundpreis    Preis fuer den Aufstieg von Level 1 auf Level 2.
   * kostenfaktor  Wachstum der Kosten je Level - je weiter innen, desto
   *               steiler, damit innere Ringe frueher saettigen.
   * grundzuwachs  Was ein Treffer auf Level 1 dem Zaehler punkteProTreffer
   *               gibt.
   * innen/aussen  Echte Ringgrenzen auf einer Scheibe mit Radius 1.
   *
   * Zum grundzuwachs: eine eigene geometrische Reihe von 0,1 auf 100, Faktor
   * 2,15443469 je Ring. Sie ist bewusst von den Preisen entkoppelt - solange
   * sie sich aus ihnen ableitete, sprang der Zaehler bei einem einzigen
   * Gluecksteffer auf einen inneren Ring in Groessenordnungen, gegen die der
   * ganze restliche Durchgang nicht mehr ankam.
   *
   * Flach gestaffelt tragen alle zehn Ringe zum Fortschritt bei: rund 23 / 23 /
   * 22 / 13 / 6 / 4 / 2,6 / 2,3 / 2 / 2 Prozent. Die aeusseren dominieren am
   * Anfang leicht, weil man sie viel haeufiger trifft; mit steigender
   * Zielgenauigkeit verschiebt sich das nach innen - das ist die Progression.
   *
   * Zu innen/aussen: die Ringe sind absichtlich unterschiedlich breit. Bei
   * einer um die Mitte streuenden Verteilung landen die meisten Pfeile innen -
   * mit zehn gleich breiten Ringen kaeme auf Ring 1 nur ein Bruchteil dessen,
   * was er tragen soll. Die Grenzen sind so gewaehlt, dass sich zu Spielbeginn
   * 55 / 25 / 11 / 3 / 0,7 / 0,2 / 0,06 / 0,025 / 0,01 / 0,005 Prozent auf die
   * Ringe 1 bis 10 verteilen, bei 5 Prozent Fehlschuessen.
   * Gezeichnet wird trotzdem gleich breit - siehe SCHEIBE.
   */
  RINGE: [
    { nummer:  1, name: 'weiss',     farbe: '#dcdcdc', grundpreis: 4,    kostenfaktor: 1.20, grundzuwachs: 0.1,           innen: 0.4129, aussen: 1.0000 },
    { nummer:  2, name: 'magenta',   farbe: '#e04ad0', grundpreis: 1e2,  kostenfaktor: 1.24, grundzuwachs: 0.215443469,   innen: 0.2329, aussen: 0.4129 },
    { nummer:  3, name: 'violett',   farbe: '#9b48ed', grundpreis: 1e3,  kostenfaktor: 1.28, grundzuwachs: 0.464158883,   innen: 0.1167, aussen: 0.2329 },
    { nummer:  4, name: 'blau',      farbe: '#4a7ce8', grundpreis: 1e4,  kostenfaktor: 1.32, grundzuwachs: 1,             innen: 0.0579, aussen: 0.1167 },
    { nummer:  5, name: 'cyan',      farbe: '#4bfefe', grundpreis: 1e6,  kostenfaktor: 1.36, grundzuwachs: 2.15443469,    innen: 0.0317, aussen: 0.0579 },
    { nummer:  6, name: 'tuerkis',   farbe: '#4af8dd', grundpreis: 1e9,  kostenfaktor: 1.40, grundzuwachs: 4.641588834,   innen: 0.0183, aussen: 0.0317 },
    { nummer:  7, name: 'gruen',     farbe: '#6bf57e', grundpreis: 1e12, kostenfaktor: 1.44, grundzuwachs: 10,            innen: 0.0116, aussen: 0.0183 },
    { nummer:  8, name: 'gelbgruen', farbe: '#a4f248', grundpreis: 1e15, kostenfaktor: 1.48, grundzuwachs: 21.5443469,    innen: 0.0071, aussen: 0.0116 },
    { nummer:  9, name: 'orange',    farbe: '#fda54c', grundpreis: 1e18, kostenfaktor: 1.52, grundzuwachs: 46.41588834,   innen: 0.0041, aussen: 0.0071 },
    { nummer: 10, name: 'rot',       farbe: '#ff5959', grundpreis: 1e27, kostenfaktor: 1.56, grundzuwachs: 100,           innen: 0.0000, aussen: 0.0041 }
  ],

  /**
   * Geometrie der Scheibe in normierten Einheiten (Aussenrand = Radius 1).
   *
   * Gerechnet und gezeichnet wird mit zwei verschiedenen Geometrien: die
   * echten Ringgrenzen stehen in RINGE, gezeichnet wird dagegen jeder Ring
   * gleich breit. Ring 10 hat einen echten Radius von 0,0041 - auf einer 400
   * Pixel breiten Scheibe waere das weniger als ein Pixel, die halbe Scheibe
   * also unsichtbar. Ein Pfeil wird deshalb in seinem Ring auf das
   * Anzeige-Intervall gestreckt.
   */
  SCHEIBE: {
    RINGE_GESAMT: 10,
    RADIUS: 1,
    /** Nur fuer die Darstellung: 1 / 10 Anzeigeradius je Ring. */
    ANZEIGE_RING_BREITE: 0.1,
    HINTERGRUND: '#2b2b2b',
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
   *
   * Level 1 => 0,409, was genau 5 % Fehlschuesse ergibt.
   * Level 300 => 0,012. Auch dort bleibt die Streuung breit verteilt (rund
   * 32 % Ring 7, 28 % Ring 6, 21 % Ring 8, 10 % Ring 9, 5,6 % Ring 10) - kein
   * Ring erreicht 100 %, und das ist gewollt.
   */
  ZIELGENAUIGKEIT: {
    START_STREUUNG: 0.409,
    FAKTOR_PRO_LEVEL: 0.98827,
    MAX_LEVEL: 300,
    /**
     * Die Preiskurve muss gegen ein Einkommen ankommen, das quadratisch mit
     * der Zeit waechst und zusaetzlich exponentiell mit jedem Ring-Upgrade.
     * Die frueheren 1,05 je Level stammen aus der Zeit vor der
     * Scoring-Umstellung, als der Ertrag je Sekunde noch ungefaehr konstant
     * war - dagegen war das Maximum binnen Minuten erreicht.
     */
    KOSTEN_BASIS: 100,
    KOSTEN_FAKTOR: 1.25,
    /**
     * Zusaetzlich alle 20 Level ein Kostensprung um Faktor 5. Diese Sprunge
     * sind die Wand, an der die Demo endet und spaeter der Reset ansetzt:
     * die Zielgenauigkeit soll ihr Maximum auch nach Tagen nicht erreichen.
     */
    KOSTEN_SPRUNG_FAKTOR: 5.0,
    KOSTEN_SPRUNG_ALLE: 20
  },

  /**
   * Schussintervall: Sekunden zwischen zwei Schuessen.
   * Level 1 => 1,0 s, Level 200 => 0,1 s (zehn Pfeile pro Sekunde).
   *
   * Der Startwert liegt bei 1,0 s statt frueher 3,0 s: in der ersten Ebene ist
   * das Intervall-Upgrade gesperrt, es bliebe sonst den ganzen Durchgang bei
   * zwanzig Schuessen pro Minute - und Zuschauen ist hier die
   * Hauptbeschaeftigung.
   */
  SCHUSSINTERVALL: {
    START_SEKUNDEN: 1.0,
    FAKTOR_PRO_LEVEL: 0.98855,
    MAX_LEVEL: 200,
    /** Dieselbe Begruendung wie bei der Zielgenauigkeit, ohne die Sprunge. */
    KOSTEN_BASIS: 200,
    KOSTEN_FAKTOR: 1.25
  },

  /**
   * Ring-Upgrades: zehn getrennte Upgrades, eines je Ring, ohne Maximum.
   *
   * Sie wirken auf den Zuwachs, den ein Treffer in diesem Ring dem Zaehler
   * punkteProTreffer gibt - nicht auf eine einmalige Gutschrift.
   *
   * Grundpreis, Kostenfaktor und Grundzuwachs stehen je Ring in RINGE. Jeder
   * Ring hat seinen eigenen Kostenfaktor, weil ein gemeinsamer die Staffelung
   * der Grundpreise ueber viele Level wieder einebnen wuerde.
   *
   * Die Wirkung von 1,001 je Level ist winzig und liegt weit unter jedem
   * Kostenfaktor, sodass jeder Ring rasch saettigt. Das ist der Sinn der
   * Sache: das Scoring ist rueckgekoppelt - Punkte kaufen Upgrades, die den
   * Zaehler schneller wachsen lassen, was wieder mehr Punkte gibt -, und diese
   * Schleife soll das Spiel nicht in Minuten davontragen.
   */
  RING_UPGRADE: {
    FAKTOR_PRO_LEVEL: 1.001,
    MAX_LEVEL: Infinity
  },

  /**
   * Welche Achsen die aktuelle Ebene ueberhaupt anbietet.
   *
   * Zielgenauigkeit und Schussintervall sind in der ersten Ebene gesperrt und
   * werden erst nach dem ersten Prestige freigeschaltet. Ihr Code bleibt
   * vollstaendig erhalten - Formeln, Maximallevel, Preise -, er wird nur nicht
   * angesprochen, solange dieser Schalter aus ist. Ihn spaeter umzulegen ist
   * eine Zeile; den Code jetzt zu loeschen und dann neu zu schreiben waere
   * Verschwendung.
   */
  EBENE: {
    GLOBALE_UPGRADES_FREI: false,
    /**
     * Ein Ring-Upgrade wird sichtbar, sobald der Ring davor dieses Level
     * erreicht hat. Ring 1 ist von Anfang an offen. Getroffen und gutgeschrieben
     * wird jeder Ring immer - die Sperre betrifft nur die Kaufkarte.
     */
    RING_FREI_AB_LEVEL: 5
  },

  /**
   * Kaufmengen des Mengenknopfs, der Reihe nach durchgeschaltet.
   * MAX kauft so viele Level, wie die Punkte in einem Zug hergeben.
   */
  KAUF: {
    MENGEN: [1, 10, 100, 'MAX']
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

  /**
   * Zahlendarstellung, durchgehend deutsch: Punkt als Tausendertrenner, Komma
   * als Dezimaltrenner.
   *
   * Kuerzel wie K, M oder B gibt es nicht mehr. Bis knapp unter eine Milliarde
   * wird ausgeschrieben, darueber in Exponentialschreibweise - das ist
   * eindeutig und spart das Raten, wofuer ein Buchstabe stand.
   */
  FORMAT: {
    /** Unter diesem Wert werden Nachkommastellen gezeigt. */
    KLEIN_BIS: 10,
    /**
     * Zwei Nachkommastellen unter KLEIN_BIS: am Spielanfang sind die Zahlen
     * klein, da ist der Unterschied zwischen 6,25 und 6,80 sichtbarer
     * Fortschritt.
     */
    NACHKOMMA_KLEIN: 2,
    /** Ab hier Exponentialschreibweise. */
    EXPONENT_AB: 1e9,
    /** Nachkommastellen der Mantisse; nachlaufende Nullen entfallen. */
    NACHKOMMA_MANTISSE: 2,
    TAUSENDER_TRENNER: '.',
    DEZIMAL_TRENNER: ','
  }
};
