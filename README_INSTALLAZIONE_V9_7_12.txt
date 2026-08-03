AICS PADEL CHAMPIONSHIP V9.7.12

CORREZIONI

1. INSERIMENTO GIOCATORI DALLA SCHEDA SQUADRA
- Nella scheda amministratore della squadra compare “Aggiungi giocatore”.
- Campi: nome, cognome, email, telefono, classifica FITP e certificato medico.
- Il giocatore viene inserito direttamente come approvato.
- La rosa si aggiorna subito nella stessa pagina.
- Il sistema verifica che Supabase abbia realmente confermato l’inserimento.

2. MODIFICHE MANUALI DEL CALENDARIO
- Le modifiche applicate dall’Assistente conflitti non rigenerano più il calendario da zero.
- Data, ora, squadra di casa e campo scelti restano nell’anteprima.
- L’eccezione viene indicata come “ECCEZIONE AMMINISTRATORE”.
- Premendo “Conferma e salva calendario” la variazione viene salvata definitivamente.

3. MODIFICA DELLE PARTITE GIÀ SALVATE
- Dopo la modifica l’app richiede a Supabase la riga aggiornata.
- Se il database non conferma, compare un errore chiaro.
- Se il valore salvato è diverso da quello inserito, la pagina lo segnala.
- La schermata non si ricarica più cancellando silenziosamente il valore.

INSTALLAZIONE
Su GitHub sostituisci:
- team.html
- calendar.html

Non serve SQL.

Apri:
- team.html?id=ID_SQUADRA&v=9712
- calendar.html?v=9712
