/* V9.9.58 - MOTORE PULITO EDEN
   Correzione mirata dopo analisi del motore originale.
   NON aggiunge un altro solver sopra i precedenti.

   Mantiene:
   - GLOBAL SORT originale dell'andata;
   - conflitti REALI per data/ora/impianto;
   - sospensioni/date escluse;
   - conflitti con altre competizioni/gironi;
   - giorno, ora e campo della squadra di casa.

   Corregge:
   1) EDEN mai in casa prima del 01/11/2026;
   2) elimina il blocco preventivo ridondante che scartava orientazioni
      solo per stessa chiave campo+giorno+ora, prima del vero controllo overlap;
   3) ritorno NON speculare: usa gli stessi accoppiamenti invertiti ma può
      riordinare le giornate, senza cambiare singole date a caso;
   4) niente PRO in questa versione: prima verifichiamo che il motore pulito
      risolva il calendario naturale.
*/
(async function(){
'use strict';
const SOURCE='calendar-v9-clean.js?v=9958clean';
const EDEN=['3371654b-99ca-4135-b28a-582bdc0a41f1','e4939c59-9670-4706-8abc-abb88a60a18f','33a195e2-ad86-488c-9691-1ce188e9a490'];
function fail(t){const b=document.createElement('div');b.style.cssText='position:fixed;left:15px;right:15px;bottom:15px;z-index:99999;padding:14px;border-radius:12px;background:#fdecef;border:1px solid #ce2b37;color:#7b1722;font:600 14px system-ui';b.textContent='V9.9.58 non attivata: '+t;document.body.appendChild(b)}
try{
 const r=await fetch(SOURCE,{cache:'no-store'});if(!r.ok)throw Error('motore base non disponibile');let src=await r.text();

 /* 1. Vincolo EDEN */
 const base="const pad=n=>String(n).padStart(2,'0');"; if(!src.includes(base))throw Error('marker base');
 src=src.replace(base,base+`\nconst V9_EDEN_IDS=new Set(${JSON.stringify(EDEN)});\nfunction v9EdenForbiddenHome(f){return !!f&&V9_EDEN_IDS.has(String(f.home_team_id))&&String(f._local_date||'').slice(0,10)<'2026-11-01';}\n`);
 const orient=`    const fixtures=pairs.map(([home,away])=>\n      makeFixture(group,roundNo,home,away,anchor,code)\n    );`;
 if(!src.includes(orient))throw Error('marker orientazioni');
 src=src.replace(orient,orient+`\n\n    if(fixtures.some(v9EdenForbiddenHome)) continue;`);

 /* 2. Rimuove SOLO il blocco preventivo sharedSlotViolation.
       Il controllo vero realFacilityConflict/overlap resta intatto. */
 const preStart=src.indexOf('    /* 10.11 - BLOCCO PREVENTIVO:');
 const preEnd=src.indexOf('    /* Se una gara cade su data esclusa',preStart);
 if(preStart<0||preEnd<0)throw Error('blocco preventivo non trovato');
 src=src.slice(0,preStart)+`    /* V9.9.58: rimosso il pre-filtro sharedSlotViolation.\n       Da qui in poi decide esclusivamente il controllo reale data/ora/impianto. */\n\n`+src.slice(preEnd);

 /* 3. Ritorno: riordina SOLO le giornate dell'andata, sempre invertite.
       Backtracking piccolo sul numero di giornate, non sulle singole partite. */
 const a=src.indexOf('function buildReturnLeg({'),b=src.indexOf('window.buildCalendarPayload=async function(){',a);if(a<0||b<0)throw Error('blocco ritorno');
 const ret=`function buildReturnLeg({group,firstLeg,startAnchor,intervalWeeks,code,external}){
  const sources=firstLeg.chosen.map((r,i)=>({idx:i,pairs:r.pairs}));
  const used=new Set(), result=[];
  let states=0; const MAX=20000;

  function rec(pos,nextAnchor){
    if(pos===sources.length) return true;
    if(++states>MAX) return false;
    const roundNo=firstLeg.totalRounds+pos+1;

    for(const source of sources){
      if(used.has(source.idx)) continue;
      const fixtures=source.pairs.map(([h,a])=>makeFixture(group,roundNo,a,h,nextAnchor,code));
      if(fixtures.some(v9EdenForbiddenHome)) continue;
      if(roundTouchesExcludedDate(fixtures,code)) continue;

      let bad=false;
      for(let i=0;i<fixtures.length;i++){
        if(conflictsAny(fixtures[i],fixtures.filter((_,j)=>j!==i))){bad=true;break;}
      }
      if(bad||!compatibleWithExternal(fixtures,external)) continue;

      used.add(source.idx); result.push({roundNo,fixtures,anchor:nextAnchor,sourceIndex:source.idx});
      if(rec(pos+1,addDays(nextAnchor,intervalWeeks*7))) return true;
      result.pop(); used.delete(source.idx);
    }
    return false;
  }

  if(!rec(0,new Date(startAnchor))){
    throw new Error('Il ritorno naturale non trova una combinazione valida dopo '+states+' combinazioni di giornate.');
  }
  console.info('[V9.9.58] ritorno naturale risolto in',states,'combinazioni');
  return result;
}\n\n`;
 src=src.slice(0,a)+ret+src.slice(b);

 const blob=new Blob([src],{type:'text/javascript'}),url=URL.createObjectURL(blob),s=document.createElement('script');s.src=url;
 s.onload=()=>{URL.revokeObjectURL(url);const c=[...document.querySelectorAll('.card')].find(x=>x.querySelector('#competition'))||document.querySelector('.card');if(c){const n=document.createElement('div');n.className='notice ok';n.innerHTML='<b>V9.9.58 MOTORE PULITO ATTIVO:</b> GLOBAL SORT originale, soli conflitti reali data/ora/impianto, EDEN solo trasferta fino al 31/10/2026, ritorno non speculare ottenuto riordinando esclusivamente le giornate.';c.appendChild(n)}};
 s.onerror=()=>fail('errore caricamento');document.body.appendChild(s);
}catch(e){fail(e?.message||String(e))}
})();