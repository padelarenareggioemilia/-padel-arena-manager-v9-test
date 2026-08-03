PADEL ARENA MANAGER V9.4.4 — IMPORT MODULO GOOGLE AICS

CORREZIONE
- L'importatore riconosce direttamente il file:
  “ELENCO SQUADRE AICS PADEL CHAMPIONSHIP 2027.xlsx”.
- Non è necessario rinominare o spostare le colonne.
- Riconosce le intestazioni originali di Google Forms.
- Traduce automaticamente:
  - Serie A con limite 3ª fascia → Serie A;
  - Serie B con limite 4ª fascia → Serie B;
  - Serie C non classificati → Serie C.
- Estrae l'orario da testi come “15:00 SOLO SABATO E DOMENICA”.
- Riconosce giorno, club, indirizzo, CAP, comune, provincia,
  campo di casa, referente, email e telefono.
- I duplicati vengono confrontati ignorando maiuscole, accenti,
  apostrofi, punteggiatura e spazi superflui.
- Il file caricato contiene 38 squadre:
  se le prime 37 sono già presenti, l'anteprima deve mostrare
  ASD Happy Time come unica nuova squadra.
- Nessun dato viene inserito prima della conferma finale.

INSTALLAZIONE
Su GitHub sostituisci integralmente:
- data-exchange.html

Non serve eseguire SQL.
