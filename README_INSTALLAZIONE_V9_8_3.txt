AICS PADEL CHAMPIONSHIP V9.8.3 — FIX CARICAMENTO LOGO SQUADRA

PROBLEMA RISOLTO
La squadra veniva creata prima del caricamento del logo.
Se lo Storage restituiva “No content provided”, la squadra rimaneva comunque
nel database e ogni nuovo clic creava un duplicato.

NUOVO FLUSSO
1. Il logo viene letto e convertito in PNG prima del salvataggio.
2. Viene verificato che il file non sia vuoto.
3. Il pulsante viene bloccato al primo clic.
4. Il sistema controlla eventuali duplicati nome + Serie.
5. Logo e squadra vengono salvati come un'unica operazione controllata.
6. Se la creazione fallisce, il logo caricato viene rimosso.
7. Gli errori vengono mostrati con un messaggio chiaro.

INSTALLAZIONE
Su GitHub sostituisci soltanto:
index.html

Non serve SQL.

Apri:
index.html?v=983
