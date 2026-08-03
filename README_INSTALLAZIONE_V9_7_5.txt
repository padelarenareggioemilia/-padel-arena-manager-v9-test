AICS PADEL CHAMPIONSHIP V9.7.5 — FIX PORTALE FREE 404

PROBLEMA
Il portale libero apriva competition-public.html.
Se quel nuovo file non era stato caricato nella root di GitHub, GitHub Pages mostrava:
404 File not found.

CORREZIONE
- Il portale pubblico ora usa un solo file:
  public.html
- Cliccando uno stemma apre:
  public.html?code=SERIE_A
  public.html?code=SERIE_B
  public.html?code=SERIE_C
  public.html?code=COPPA_ITALIA
  public.html?code=SUPERCOPPA
- Non dipende più da competition-public.html.
- Ogni competizione mostra soltanto:
  Giornata precedente
  Giornata in corso
  Prossima giornata
  Classifica

INSTALLAZIONE
Su GitHub sostituisci soltanto:
public.html

Non serve SQL.
Apri:
public.html?v=975
