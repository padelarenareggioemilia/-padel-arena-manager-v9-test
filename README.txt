PADEL ARENA MANAGER V9.5.1 — CALENDARIO LOCALE VERIFICATO

OBIETTIVO
Questa versione non salva più il calendario immediatamente.

NUOVO FLUSSO
1. Scegli competizione, data, intervallo e formula:
   - Solo andata
   - Andata e ritorno
2. Premi “Anteprima calendario”.
3. Per ogni partita vengono confrontati:
   - giorno e ora della scheda della squadra di casa;
   - giorno e ora calcolati per il calendario;
   - campo di casa.
4. Se esiste anche una sola incongruenza, nulla viene salvato.
5. Solo dopo aver visto “COINCIDE” puoi premere “Conferma e salva calendario”.

CORREZIONI
- Orari mostrati e verificati in ora locale italiana.
- Nessun uso di toISOString().slice() per visualizzare gli orari.
- Svuotamento della cache delle vecchie versioni del calendario.
- Versione visibile nell’intestazione: V9.5.1.
- Le vecchie partite vengono cancellate soltanto al momento della conferma finale.

INSTALLAZIONE
Su GitHub sostituisci:
- calendar.html
- service-worker.js

Non serve una nuova query SQL: quella V9.5 è già stata eseguita correttamente.

Apri:
calendar.html?v=951

PRIMA DI SALVARE
Controlla nell’anteprima che, per esempio:
“Scheda casa: Venerdì 20:00”
coincida con:
“Calendario: Venerdì ... ore 20:00”.
