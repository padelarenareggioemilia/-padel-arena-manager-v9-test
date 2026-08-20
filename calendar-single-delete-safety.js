
/* PATCH SICUREZZA ELIMINAZIONE SINGOLA 9.3.3
   Intercetta SOLO i pulsanti "Elimina" delle singole partite.
   Non tocca "Elimina tutte le partite".
   Cancella esclusivamente per ID partita.
*/
(function(){
  'use strict';

  function extractFixtureId(el){
    const candidates = [
      el.getAttribute?.('data-fixture-id'),
      el.closest?.('[data-fixture-id]')?.getAttribute?.('data-fixture-id'),
      el.getAttribute?.('onclick'),
      el.closest?.('.fixture')?.getAttribute?.('data-id'),
      el.closest?.('.fixture')?.innerHTML
    ].filter(Boolean);

    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
    for(const value of candidates){
      const m=String(value).match(uuidRe);
      if(m) return m[0];
    }
    return null;
  }

  document.addEventListener('click', async function(ev){
    const btn = ev.target.closest?.('button');
    if(!btn) return;

    const text=(btn.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();

    // NON interferire mai con il pulsante globale
    if(text.includes('elimina tutte le partite')) return;

    // intercetta solo il tasto singolo "Elimina"
    if(text !== 'elimina' && text !== '🗑 elimina') return;

    const fixtureId=extractFixtureId(btn);
    if(!fixtureId) return; // se non troviamo l'ID, lasciamo il comportamento originale

    // blocca QUALSIASI vecchio handler pericoloso
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    if(!confirm('Eliminare SOLO questa partita?')) return;

    try{
      btn.disabled=true;
      const oldText=btn.textContent;
      btn.textContent='Eliminazione…';

      if(typeof s==='undefined') throw new Error('Client database non disponibile.');

      // REGOLA RIGIDA: DELETE SOLO PER ID
      const {error}=await s.from('fixtures').delete().eq('id',fixtureId);
      if(error) throw error;

      if(typeof fetchData==='function') await fetchData();
      if(typeof renderFixtures==='function') renderFixtures();

      if(typeof msg==='function') msg('✅ È stata eliminata soltanto la partita selezionata.');
      btn.textContent=oldText;
    }catch(e){
      if(typeof msg==='function') msg('Errore eliminazione singola: '+(e?.message||String(e)),true);
      btn.disabled=false;
      btn.textContent='Elimina';
    }
  }, true);

  console.info('[V9] Protezione eliminazione singola 9.3.3 attiva');
})();
