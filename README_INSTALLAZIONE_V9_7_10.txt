AICS PADEL CHAMPIONSHIP V9.7.10 — REGOLA BASE VERIFICATA

CONTROLLO ESEGUITO
La logica del calendario è stata ricontrollata e centralizzata.

REGOLA UNICA, VALIDA PER TUTTE LE SQUADRE
- La squadra di casa determina giorno, ora e campo.
- La squadra ospite si adatta sempre.
- Il giorno/orario abituale dell'ospite non viene mai usato come vincolo.
- HORMIGA non è un'eccezione:
  domenica ore 11 vale soltanto quando HORMIGA è in casa.

VERIFICHE AUTOMATICHE
La regola viene controllata:
1. quando viene creata ogni partita;
2. dopo un'inversione casa/trasferta;
3. dopo ogni spostamento automatico;
4. sull'intero calendario prima dell'anteprima;
5. nuovamente prima del salvataggio.

Se anche una sola partita non rispetta la regola, il calendario non viene salvato
e il messaggio indica esattamente la squadra e l'incongruenza.

ANTEPRIMA
Ogni gara mostra:
REGOLA CASA VERIFICATA
[nome casa] determina giorno, ora e campo.
[nome ospite] si adatta.

INSTALLAZIONE
Su GitHub sostituisci soltanto:
calendar.html

Non serve SQL.

Apri:
calendar.html?v=9710
