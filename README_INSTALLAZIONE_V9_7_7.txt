AICS PADEL CHAMPIONSHIP V9.7.7

ERRORE CORRETTO
ERROR 42P13:
cannot change return type of existing function

CAUSA
Nel database esisteva già publish_competition_calendar(text)
con un tipo di risultato diverso.

INSTALLAZIONE
1. Non rieseguire SUPABASE_V9_7_6_UPDATE.sql.
2. Apri una query nuova e vuota in Supabase.
3. Esegui integralmente SUPABASE_V9_7_7_UPDATE.sql.
4. Il risultato corretto è:
   Success. No rows returned
5. Riprova il pulsante:
   Pubblica e avvia prima formazione

Non occorre sostituire file HTML su GitHub.
