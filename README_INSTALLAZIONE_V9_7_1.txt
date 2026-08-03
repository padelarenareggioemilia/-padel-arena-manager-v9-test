AICS PADEL CHAMPIONSHIP V9.7.1

CAPITANO
- Gestione dati operativi della squadra.
- Inserimento manuale dei giocatori.
- Modifica classifica FITP, telefono e certificato medico.
- Approvazione o rifiuto dei giocatori.
- Rimozione protetta dei giocatori.
- Funzioni disponibili solo se:
  1. l’account ha ruolo captain o secretary per quella squadra;
  2. l’amministratore ha attivato captain_access_enabled.

PORTALE PUBBLICO
- La homepage mostra solo i cinque stemmi cliccabili.
- Ogni stemma apre una pagina dedicata alla singola competizione.
- Nella pagina dedicata compaiono solo quattro pulsanti:
  1. Giornata precedente
  2. Giornata in corso
  3. Prossima giornata
  4. Classifica
- Non vengono mescolate informazioni di competizioni diverse.

INSTALLAZIONE
1. Esegui SUPABASE_V9_7_1_UPDATE.sql.
2. Su GitHub sostituisci:
   - captain.html
   - public.html
3. Carica:
   - competition-public.html
4. Fai Commit changes.
5. Prova:
   public.html?v=971
   captain.html?team=ID_SQUADRA&v=971
