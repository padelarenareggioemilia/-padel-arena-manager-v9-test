# CHANGELOG — Padel Arena Manager

## V9.9.94 — Chiarezza criterio ranking FITP
- La diagnostica e le e-mail automatiche spiegano che il doppio confronto è un criterio eccezionale e particolarmente favorevole ai giocatori.
- Precisato che la scelta si è resa necessaria perché l'aggiornamento FITP atteso in prossimità del 1° settembre è stato pubblicato soltanto il 28 settembre.
- Confermata la posizione più favorevole tra luglio e agosto per i tesserati entro il 27 settembre; dal 28 settembre resta valido il ranking di agosto.

## V9.9.93 — Ranking FITP per data di tesseramento
- Controllo automatico basato sulla data `created_at` del tesseramento registrata nel sistema.
- Tesserati entro il 27 settembre 2026: criterio più favorevole tra ranking di luglio e aggiornamento di agosto.
- Tesserati dal 28 settembre 2026: applicazione del ranking FITP di agosto.
- Un giocatore regolare all'iscrizione conserva l'idoneità anche in caso di successivo incremento della fascia.
- Un giocatore sceso di fascia con l'aggiornamento beneficia immediatamente della nuova posizione.
- I giocatori privi di tessera FITP restano considerati NC e regolari.

## V9.9.92 — Correzione ranking FITP di riferimento
- Diagnostica ricalcolata su tutte le 778 posizioni usando il ranking FITP di luglio 2026, valido per il campionato fino al 27 settembre 2026.
- Le segnalazioni accertate passano da 34 a 18.
- Le 21 posizioni precedentemente indicate come “da verificare” vengono considerate regolari: si tratta di giocatori privi di tessera FITP e quindi equivalenti a NC.
- Rimossi automaticamente i controlli non più validi del precedente ricalcolo.
- Schermata Diagnostica ed email ai capitani indicano chiaramente il ranking di riferimento.
- Il caso Felicetti resta non conforme: anche nel ranking precedente risulta in 4ª fascia con 12,2 punti.

## V9.9.91 — Verifica FITP per giocatori senza tessera
- Nelle email relative alle posizioni da verificare il capitano può ora dichiarare che il giocatore non possiede una tessera FITP.
- Se il giocatore possiede una tessera FITP, vengono richiesti numero di tessera, fascia e punteggio aggiornati.
- Il testo riepiloga i limiti applicati alle Serie A, B e C.
- Nessuna modifica alle 34 irregolarità accertate e ai 21 casi già presenti nella diagnostica.

## V9.9.90 — Diagnostica limitazioni FITP
- Inseriti 34 casi di non conformità accertata e 21 posizioni da verificare.
- Nuova sezione protetta nella Diagnostica, raggruppata per squadra.
- E-mail al capitano già compilata con tutte le anomalie della propria rosa.
- Testi distinti per irregolarità accertate e posizioni ancora da verificare.
- Registrazione manuale della data di comunicazione inviata.
- Regola Serie C: ammessi soltanto giocatori di 4ª o 5ª fascia con 0 punti.

## V9.9.89 — Adeguamento completo al regolamento 2027
- Classifiche corrette: 2 punti alla vittoria e 0 alla sconfitta.
- Risultati validati su set ai 6, tie-break decisivo ai 7 e spareggio Misto.
- Risultato complessivo salvato e pubblicato automaticamente.
- Controlli su categoria FITP, unicità del giocatore, rosa massima e validità del tesseramento dopo 24 ore.
- Procedura digitale per la distinta tardiva con decisione dell'avversario.
- Registro amministrativo di irregolarità, risultati a tavolino e penalizzazioni progressive.
- Penalizzazioni integrate nelle classifiche pubbliche e riservate.
- Riserve non più utilizzabili dopo il blocco T-120.
- Protezione RLS delle tabelle amichevoli e rimozione dell'accesso anonimo dalle RPC operative.

## V9.9.88 — Hotfix tessere digitali
- Generazione automatica della tessera per ogni giocatore con stato ufficiale `approved`.
- Recuperate le tessere mancanti delle rose già approvate.
- Tessere attive soltanto con certificato medico presente e non scaduto.

## V9.9.87 — Flusso gara regolamento 2027
- Distinte definitive e bloccate automaticamente a T-120.
- Ordine ufficiale degli incontri: M1 e Femminile, poi M2 e Misto.
- Controlli su composizione, numero massimo di incontri e tessere/certificati.
- Appello digitale condiviso, verifica QR e sostituzioni soltanto dalle riserve.
- Spareggio misto sul 2-2 con soli giocatori già impiegati nella giornata.
- Risultati bloccati e trasmessi automaticamente il lunedì alle 00:01.
- Ricorso formale entro 48 ore e nuova area amministrativa di gestione ricorsi.

## V9.5.0 — Calendario corretto
- Correzione fuso orario locale/UTC.
- Solo andata oppure andata e ritorno.
- Giorno, ora e campo obbligatori dalla squadra di casa.
- Festività, prefestivi e sospensioni.
- Solo semifinali e finali playoff/playout/Coppa all’Eden.


## V9.4.4 — Import modulo Google AICS
- Supporto diretto all'esportazione Google Forms del campionato 2027.
- Mappatura automatica delle intestazioni originali.
- Normalizzazione avanzata dei duplicati.
- Riconoscimento automatico della serie e dell'orario.


## V9.4.3 — Identità AICS completa
- Favicon AICS.
- Icone iPhone, Android e Web App.
- Manifest installabile.
- Anteprima social con logo AICS.
- Titolo uniforme dell'app.
- Service worker.


## V9.4.2 — Repository completo
- Pacchetto completo e coerente dell'intero progetto V9.
- Inclusa la funzione amministratore Importa/Esporta Excel e CSV.
- Inclusi i filtri per Serie e singola Squadra.
- Inclusa la gestione squadre, scheda tecnica e modifica logo.
- Inclusi gironi, calendario, competizioni, Coppa Italia e Supercoppa.
- Inclusi controllo campionato, formazioni, timer, risultati e centro gara.
- Inclusi portali capitano e giocatore.
- Incluso il tema grafico AICS con richiami al tricolore.
- Inclusi tutti gli script SQL necessari.

## V9.4.1
- Aggiunto filtro Squadra nell'esportazione.
- Filtri combinabili con Serie e stato giocatore.

## V9.4.0
- Importazione ed esportazione Excel/CSV riservata all'amministratore.
- Anteprima importazione, controllo duplicati e modelli vuoti.

## V9.3.x
- Formazioni, risultati, timer, omologazione, segretari e gestione logo.

## V9.2.x
- Gironi, calendario automatico, Coppa Italia, Supercoppa e scheda tecnica squadra.

## V9.1.x
- Base Supabase, squadre, capitani e iscrizione giocatori.
