PADEL ARENA MANAGER V9.5.0 — CALENDARIO CORRETTO

CORREZIONI PRINCIPALI
- Risolto lo scarto di 2 ore causato dalla visualizzazione UTC.
- Le partite usano giorno, ora e campo della squadra di casa.
- Nessun orario predefinito viene inventato.
- Se giorno, ora o campo mancano, la generazione viene bloccata.
- Scelta esplicita:
  - Solo andata
  - Andata e ritorno
- Date di festività, prefestivi e sospensione personalizzabili.
- Calendario e Coppa Italia saltano automaticamente le date escluse.
- Pulsante per inserire le principali festività italiane 2026–2027.
- Playoff e playout all’Eden:
  - soltanto 2 semifinali;
  - soltanto la finale;
  - 4 squadre qualificate dalla fase precedente.
- Coppa Italia all’Eden:
  - soltanto semifinali e finale.
- Date e orari restano modificabili dall’amministratore.

INSTALLAZIONE
1. Esegui integralmente SUPABASE_V9_5_UPDATE.sql in Supabase V9 Test.
2. Su GitHub sostituisci integralmente calendar.html.
3. Fai Commit changes.
4. Apri calendar.html?v=950.
5. Rigenera i calendari già creati: quelli vecchi non vengono corretti automaticamente.

IMPORTANTE
Le ore già presenti nel database potrebbero essere corrette ma visualizzate in UTC.
La V9.5.0 visualizza e modifica sempre l’ora locale italiana.
