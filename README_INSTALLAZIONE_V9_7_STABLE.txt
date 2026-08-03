AICS PADEL CHAMPIONSHIP — V9.7 STABLE

QUESTA VERSIONE CONSOLIDA
- Portale pubblico senza account.
- Accesso automatico in base al ruolo.
- Serie A, Serie B, Serie C, Coppa Italia e Supercoppa.
- Stemmi ufficiali cliccabili delle cinque competizioni.
- Giornata precedente, in corso e successiva.
- Classifiche dei gironi.
- Calendari e risultati.
- Pannello amministratore per pubblicare o nascondere ogni competizione.
- Coppa Italia con 32 qualificate e ripresa a febbraio 2027.
- Menu sicuro per escludere una squadra soltanto dalla Coppa Italia.
- Calendario con controllo e risoluzione dei conflitti di impianto.

INSTALLAZIONE CORRETTA
1. In Supabase apri SQL Editor.
2. Crea una query nuova e vuota.
3. Copia integralmente SUPABASE_V9_7_STABLE.sql.
4. Premi Run e attendi:
   Success. No rows returned
5. Su GitHub sostituisci tutti i file del repository con quelli del pacchetto.
6. Carica integralmente anche la cartella assets.
7. Fai Commit changes.
8. Attendi circa un minuto.

LINK DI PROVA
Portale pubblico:
public.html?v=970stable

Accesso:
login.html?v=970stable

Amministrazione:
admin-control.html?v=970stable

Coppa Italia:
cup-italia.html?v=970stable

PUBBLICAZIONE
Nel pannello amministratore trovi “Pubblicazione portale pubblico”.
Le cinque competizioni vengono inizializzate come PUBBLICATE.
Se non tocchi gli interruttori, gli utenti liberi possono vedere tutto.

IMPORTANTE
Il precedente errore:
Could not find the table public.public_championship_teams
viene risolto dallo script SUPABASE_V9_7_STABLE.sql, che crea tutte le viste
pubbliche richieste dal portale e aggiorna la cache dello schema.

LOGHI
Gli stemmi ufficiali forniti sono inclusi nella cartella assets:
- Serie A
- Serie B
- Serie C
- Coppa Italia
- Supercoppa
