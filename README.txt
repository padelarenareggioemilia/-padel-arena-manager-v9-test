PADEL ARENA MANAGER V9.4.5 — FIX IMPORTAZIONE REALE

CORREZIONI
- Il selettore file usa ora un listener stabile, non più il solo onchange scritto nell'HTML.
- Mostra immediatamente:
  1. nome e dimensione del file;
  2. stato di lettura;
  3. foglio, righe e colonne trovate;
  4. riconoscimento del formato;
  5. risultato dell'analisi.
- Gli errori non restano più invisibili.
- Supporto specifico al file:
  ELENCO SQUADRE AICS PADEL CHAMPIONSHIP 2027.xlsx
- Riconoscimento automatico del modulo Google AICS tramite le intestazioni reali.
- Possibilità di riselezionare subito lo stesso file.
- Nella scheda Squadre il filtro Stato giocatore è completamente nascosto.
- Nella scheda Giocatori il filtro Stato giocatore torna visibile.
- Nessun dato viene salvato prima della conferma.

INSTALLAZIONE
Su GitHub sostituisci integralmente:
- data-exchange.html

Non serve eseguire SQL.

TEST
Apri:
data-exchange.html?v=945

Seleziona il file originale. Deve comparire subito una sequenza di messaggi:
File selezionato → Lettura → Righe/colonne → Modulo Google AICS riconosciuto → Anteprima.
