AICS PADEL CHAMPIONSHIP V9.8.6 — RIPRISTINO ACCESSI E ARCHIVIO SQUADRE

OBIETTIVO
Ripristinare la Home amministratore con l'elenco completo delle squadre senza
mescolare la Home admin con il routing di capitani e giocatori.

CORREZIONE
- index.html torna a essere esclusivamente la Home amministratore con tutte le squadre.
- Nuovo account-home.html riconosce l'account e lo invia alla sezione corretta.
- Capitano e giocatore non aprono più index.html.
- Il login passa sempre dal router account-home.html.
- Aggiunto “Cambia account” in tutte le aree.
- Non serve modificare il database.

INSTALLAZIONE
Su GitHub:
1. Carica account-home.html.
2. Sostituisci index.html.
3. Sostituisci login.html.
4. Sostituisci captain.html.
5. Sostituisci player.html.
6. Fai Commit changes.

RECUPERO ACCESSO ADMIN
1. Apri login.html?v=986.
2. Premi “Cambia account / Chiudi sessione”.
3. Accedi con le credenziali amministratore.
4. Verrai portato a index.html, dove deve ricomparire l'archivio completo delle squadre.
