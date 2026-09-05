'use strict';

/**
 * Oberflaeche.
 *
 * Die Knoten werden einmal beim Start gebaut und danach nur noch mit neuen
 * Werten befuellt - kein innerHTML im Takt der Schleife.
 */
const UI = {
  knoten: {},
  /** Zeilen der Trefferverteilung, Schluessel 0 = daneben, 1..10 = Ring. */
  verteilungsZeilen: {},
  /** Je ein Eintrag pro Upgrade-Knopf, in derselben Reihenfolge wie Upgrades.alle. */
  upgradeZeilen: [],

  initialisieren() {
    const k = this.knoten;
    k.punkte = document.getElementById('anzeige-punkte');
    k.ppt = document.getElementById('anzeige-ppt');
    k.pps = document.getElementById('anzeige-pps');
    k.schuesse = document.getElementById('stat-schuesse');
    k.quote = document.getElementById('stat-quote');
    k.spielzeit = document.getElementById('stat-spielzeit');
    k.verteilung = document.getElementById('verteilung');
    k.wand = document.getElementById('wand-hinweis');

    // Fenstergroesse steht in data.js, nicht in der Seite - sie gehoert zum
    // Balancing und soll dort aenderbar bleiben.
    document.getElementById('verteilung-titel').textContent =
      'Trefferverteilung (letzte ~' + DATA.STATISTIK.VERTEILUNG_FENSTER + ' Schüsse)';

    this.verteilungBauen();
    this.upgradesBauen();
    this.speicherKnoepfeBinden();
  },

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
          'Es gibt in dieser Demo noch keinen Reset-Layer - zurückgesetzt wird bei null, ohne Gegenleistung.'
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

  /** Fuer jedes Upgrade eine Zeile in der passenden Gruppe. */
  upgradesBauen() {
    const gruppen = {
      zielgenauigkeit: document.querySelector('#gruppe-zielgenauigkeit .gruppe-inhalt'),
      schussintervall: document.querySelector('#gruppe-schussintervall .gruppe-inhalt'),
      ringe: document.querySelector('#gruppe-ringe .gruppe-inhalt')
    };

    for (const u of Upgrades.alle) {
      const knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.className = 'upgrade';

      const tupfer = document.createElement('span');
      tupfer.className = 'tupfer';
      if (u.farbe) tupfer.style.background = u.farbe;

      const titel = document.createElement('span');
      titel.className = 'titel';
      titel.appendChild(document.createTextNode(u.name));
      const wirkung = document.createElement('small');
      titel.appendChild(wirkung);

      const preis = document.createElement('span');
      preis.className = 'preis';
      const preisWert = document.createElement('span');
      const preisNotiz = document.createElement('small');
      preis.append(preisWert, preisNotiz);

      knopf.append(tupfer, titel, preis);
      knopf.addEventListener('click', () => {
        if (Upgrades.kaufen(u)) this.aktualisieren();
      });

      gruppen[u.gruppe].appendChild(knopf);
      this.upgradeZeilen.push({ u, knopf, wirkung, preisWert, preisNotiz });
    }
  },

  upgradesAktualisieren() {
    for (const z of this.upgradeZeilen) {
      const u = z.u;
      const amMaximum = Upgrades.amMaximum(u);

      z.wirkung.textContent = 'Level ' + u.level() + ' · ' + u.wirkung();
      z.knopf.classList.toggle('maximal', amMaximum);

      if (amMaximum) {
        z.preisWert.textContent = 'maximal';
        z.preisNotiz.textContent = '';
        z.knopf.disabled = true;
        continue;
      }

      const kosten = u.kosten();
      const fehlt = kosten - spiel.punkte;
      z.preisWert.textContent = Logik.formatiereZahl(kosten);
      // Statt nur auszugrauen die Wartezeit nennen: erst damit ist zu sehen,
      // ob sich Sparen lohnt oder ob dieser Kauf ausser Reichweite ist.
      z.preisNotiz.textContent = fehlt <= 0
        ? 'Punkte'
        : 'in ' + Logik.formatiereDauer(Logik.wartezeit(spiel, fehlt));
      z.knopf.disabled = fehlt > 0;
    }
  },

  /**
   * Hinweis auf das Demo-Ende, sobald laengere Zeit gar nichts mehr
   * bezahlbar war.
   */
  wandAktualisieren() {
    const zeigen = Spiel.wandKonto >= DATA.HINWEIS.WAND_SEKUNDEN;
    this.knoten.wand.hidden = !zeigen;
    if (!zeigen) return;

    const fehlt = Upgrades.guenstigste() - spiel.punkte;
    const warten = Logik.formatiereDauer(Logik.wartezeit(spiel, fehlt));
    this.knoten.wand.textContent =
      'Hier endet die Demo. Das nächste Upgrade ist erst in ' + warten +
      ' bezahlbar - ab hier hilft kein Weiterschiessen mehr, sondern der ' +
      'Reset-Layer, der noch nicht Teil dieser Fassung ist.';
  },

  /** Eine Zeile je Ring, von der Mitte nach aussen, plus die Fehlschuesse. */
  verteilungBauen() {
    const eintraege = [];
    for (let ring = DATA.SCHEIBE.RINGE_GESAMT; ring >= 1; ring--) {
      eintraege.push({ ring, beschriftung: 'Ring ' + ring, farbe: DATA.RINGE[ring - 1].farbe });
    }
    eintraege.push({ ring: 0, beschriftung: 'daneben', farbe: '#4b5060' });

    for (const e of eintraege) {
      const zeile = document.createElement('div');
      zeile.className = 'verteilung-zeile';

      const name = document.createElement('span');
      name.textContent = e.beschriftung;

      const balken = document.createElement('div');
      balken.className = 'verteilung-balken';
      const fuellung = document.createElement('i');
      fuellung.style.background = e.farbe;
      balken.appendChild(fuellung);

      const prozent = document.createElement('span');
      prozent.className = 'prozent';
      prozent.textContent = '–';

      zeile.append(name, balken, prozent);
      this.knoten.verteilung.appendChild(zeile);
      this.verteilungsZeilen[e.ring] = { fuellung, prozent };
    }
  },

  aktualisieren() {
    const k = this.knoten;
    const st = spiel.statistik;

    k.punkte.textContent = Logik.formatiereZahl(spiel.punkte);
    k.ppt.textContent = Logik.formatiereZahl(spiel.punkteProTreffer);
    k.pps.textContent = Logik.formatiereZahl(Logik.punkteProSekunde(spiel));

    k.schuesse.textContent = Logik.formatiereZahl(Math.floor(st.schuesse));
    k.quote.textContent = st.schuesse > 0
      ? (100 * st.treffer / st.schuesse).toFixed(1) + ' %'
      : '–';
    k.spielzeit.textContent = Logik.formatiereDauer(st.spielzeit);

    this.upgradesAktualisieren();
    this.wandAktualisieren();
    this.verteilungAktualisieren();
  },

  verteilungAktualisieren() {
    // Die Balken werden auf den groessten Anteil normiert. Absolut skaliert
    // waeren sie frueh im Spiel, wo sich die Treffer auf zehn Ringe verteilen,
    // durchweg zu kurz, um Unterschiede zu zeigen.
    let groesster = 0;
    for (let ring = 0; ring <= DATA.SCHEIBE.RINGE_GESAMT; ring++) {
      groesster = Math.max(groesster, Verteilung.anteil(ring));
    }

    for (const schluessel in this.verteilungsZeilen) {
      const ring = Number(schluessel);
      const anteil = Verteilung.anteil(ring);
      const zeile = this.verteilungsZeilen[ring];
      zeile.fuellung.style.width = groesster > 0 ? (100 * anteil / groesster) + '%' : '0%';
      zeile.prozent.textContent = Verteilung.gewicht > 0
        ? (100 * anteil).toFixed(anteil >= 0.1 ? 0 : 1) + ' %'
        : '–';
    }
  }
};

/**
 * Overlay fuer Rueckfragen und Textfelder.
 *
 * Bewusst kein confirm()/prompt(): Browserdialoge halten den ganzen Tab an,
 * die Spielschleife stuende still, solange der Dialog offen ist.
 */
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
