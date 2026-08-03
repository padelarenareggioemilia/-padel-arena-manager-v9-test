AICS PADEL CHAMPIONSHIP V9.7.3 — FIX TABELLA GIOCATORI

ERRORE CORRETTO
Il database non contiene public.players.
Nel progetto i giocatori sono salvati nella tabella:
public.roster_requests

La V9.7.3 corregge:
- captain.html;
- policy Supabase;
- inserimento manuale giocatori;
- modifica giocatori;
- approvazione e rifiuto richieste;
- eliminazione riservata soltanto all'amministratore.

INSTALLAZIONE
1. NON eseguire più SUPABASE_V9_7_2_UPDATE.sql.
2. Apri una query nuova in Supabase.
3. Esegui integralmente SUPABASE_V9_7_3_UPDATE.sql.
4. Su GitHub sostituisci:
   captain.html
5. Apri:
   captain.html?team=ID_SQUADRA&v=973
