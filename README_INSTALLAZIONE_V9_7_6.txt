AICS PADEL CHAMPIONSHIP V9.7.6

CORREZIONI
1. “Pubblica e avvia prima formazione”
   - ora mostra subito “operazione avviata”;
   - crea le finestre di tutte le partite;
   - apre la prima formazione di ogni squadra;
   - restituisce il numero di partite e formazioni attivate;
   - mostra chiaramente gli errori.

2. Capitano
   - il pulsante “Inserisci giocatore manualmente” è visibile anche entrando dal link invito;
   - l’area operativa riconosce la squadra già riscattata tramite invite;
   - capitano e segretari possono inserire nuovi giocatori;
   - solo l’amministratore può eliminarli.

3. Scheda squadra
   - i pulsanti superiori aprono soltanto:
     Partite della squadra
     Classifica del proprio girone
   - non aprono più informazioni generali di tutte le squadre.

4. Loghi
   - logo accanto a ogni squadra nelle partite e nelle classifiche.

5. Esportazioni
   - visibili solo ad amministratore, capitano e segretari della squadra;
   - menu piccolo ⋮ Esporta;
   - calendario PDF / Excel;
   - classifica PDF / Excel.

INSTALLAZIONE
1. Esegui SUPABASE_V9_7_6_UPDATE.sql in Supabase.
2. Su GitHub sostituisci:
   admin-control.html
   captain.html
   team.html
   public.html
3. Carica il nuovo file:
   team-dashboard.html
4. Fai Commit changes.
5. Prova:
   admin-control.html?v=976
   captain.html?...&v=976
   team-dashboard.html?team=ID_SQUADRA&v=976
