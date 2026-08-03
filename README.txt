AICS PADEL CHAMPIONSHIP V9.6.3 — FIX ESCLUSIONE COPPA ITALIA

PROBLEMA INDIVIDUATO
Il pulsante non reagiva perché il nome della squadra veniva inserito direttamente
nell'attributo onclick. Nomi con virgolette, apostrofi o caratteri particolari
rompevano il comando JavaScript.

CORREZIONE
- Il pulsante passa ora soltanto l'ID della squadra.
- Il nome viene recuperato in sicurezza dai dati già caricati.
- Il menu ⋮ apre sempre la finestra di conferma.
- I pulsanti sono type="button" e non possono inviare accidentalmente moduli.
- Al clic compare subito un messaggio visibile.
- La conferma continua a rimuovere la squadra soltanto dalla Coppa Italia.

INSTALLAZIONE
Su GitHub sostituisci soltanto:
- groups.html

Non serve SQL.
Apri:
groups.html?v=963
