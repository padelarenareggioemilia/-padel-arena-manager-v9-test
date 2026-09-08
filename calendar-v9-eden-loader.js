/* V9.9.54 - PATCH CHIRURGICA EDEN
   NON cambia il motore generale del calendario.
   Modifica soltanto:
   1) prima del 01/11/2026 le 3 squadre EDEN non possono essere CASA;
   2) nel ritorno le giornate possono essere riordinate, mantenendo
      per ogni coppia l'inversione casa/trasferta.
   NESSUN anticipo/posticipo artificiale di singole partite.
*/
(async function(){
'use strict';

const SOURCE='calendar-v9-clean.js?v=9954base';
const EDEN_IDS=new Set([
 '3371654b-99ca-4135-b28a-582bdc0a41f1',
 'e4939c59-9670-4706-8abc-abb88a60a18f',
 '33a195e2-ad86-488c-9691-1ce188e9a490'
]);
const LIMIT='2026-11-01';

function fail(t){
 const b=document.createElement('div');
 b.style.cssText='position:fixed;left:15px;right:15px;bottom:15px;z-index:99999;padding:14px;border-radius:12px;background:#fdecef;border:1px solid #ce2b37;color:#7b1722;font:600 14px system-ui';
 b.textContent='V9.9.54 non attivata: '+t;
 document.body.appendChild(b);
}

try{
 const r=await fetch(SOURCE,{cache:'no-store'});
 if(!r.ok) throw Error('motore base non disponibile');
 let src=await r.text();

 /* Aggiunge SOLO il controllo EDEN */
 const base="const pad=n=>String(n).padStart(2,'0');";
 if(!src.includes(base)) throw Error('punto base non trovato');
 src=src.replace(base,base+`
const V9_EDEN_IDS=new Set(${JSON.stringify([...EDEN_IDS])});
function v9EdenForbiddenHome(f){
 if(!f || !V9_EDEN_IDS.has(String(f.home_team_id))) return false;
 return String(f._local_date||'').slice(0,10)<'${LIMIT}';
}
`);

 /* Nell'orientationOptions originale: scarta SOLO orientazioni con EDEN in casa in ottobre */
 const orient=`    const fixtures=pairs.map(([home,away])=>
      makeFixture(group,roundNo,home,away,anchor,code)
    );`;
 if(!src.includes(orient)) throw Error('punto orientazioni non trovato');
 src=src.replace(orient,orient+`

    /* V9.9.54: unica forzatura sull'andata */
    if(fixtures.some(v9EdenForbiddenHome)){
      continue;
    }`);

 /* Sostituisce SOLO buildReturnLeg.
    Riusa le giornate dell'andata: nessun nuovo accoppiamento.
    Può cambiarne l'ordine nel ritorno. */
 const a=src.indexOf('function buildReturnLeg({');
 const b=src.indexOf('window.buildCalendarPayload=async function(){',a);
 if(a<0||b<0) throw Error('blocco ritorno non trovato');

 const replacement=`function buildReturnLeg({
  group,
  firstLeg,
  startAnchor,
  intervalWeeks,
  code,
  external
}){
  const remaining=firstLeg.chosen.map((x,i)=>({...x,_idx:i}));
  const returns=[];
  let nextBase=new Date(startAnchor);

  for(let pos=0;pos<firstLeg.chosen.length;pos++){
    const returnRoundNo=firstLeg.totalRounds+pos+1;
    let found=null;

    /* Prova prima la giornata corrispondente, poi le altre.
       Non modifica MAI le partite: cambia soltanto l'ordine delle giornate. */
    const ordered=[...remaining].sort((x,y)=>{
      const target=pos;
      return Math.abs(x._idx-target)-Math.abs(y._idx-target);
    });

    for(let shift=0;shift<60 && !found;shift++){
      const anchor=addDays(nextBase,shift*7);

      for(const source of ordered){
        const fixtures=source.pairs.map(([home,away])=>
          makeFixture(group,returnRoundNo,away,home,anchor,code)
        );

        if(fixtures.some(v9EdenForbiddenHome)) continue;
        if(roundTouchesExcludedDate(fixtures,code)) continue;

        let bad=false;
        for(let i=0;i<fixtures.length;i++){
          if(conflictsAny(fixtures[i],fixtures.filter((_,j)=>j!==i))){
            bad=true; break;
          }
        }
        if(bad) continue;
        if(!compatibleWithExternal(fixtures,external)) continue;

        found={source,fixtures,anchor};
        break;
      }
    }

    if(!found){
      throw new Error(
        'Non riesco a collocare la giornata di ritorno G'+returnRoundNo+
        ' senza violare i vincoli reali.'
      );
    }

    returns.push({
      roundNo:returnRoundNo,
      fixtures:found.fixtures,
      anchor:found.anchor
    });

    const cut=remaining.findIndex(x=>x._idx===found.source._idx);
    remaining.splice(cut,1);
    nextBase=addDays(found.anchor,intervalWeeks*7);
  }

  return returns;
}

`;

 src=src.slice(0,a)+replacement+src.slice(b);

 const blob=new Blob([src],{type:'text/javascript'});
 const url=URL.createObjectURL(blob);
 const s=document.createElement('script');
 s.src=url;
 s.onload=()=>{
   URL.revokeObjectURL(url);
   const card=[...document.querySelectorAll('.card')].find(x=>x.querySelector('#competition'))||document.querySelector('.card');
   if(card){
     const n=document.createElement('div');
     n.className='notice ok';
     n.innerHTML='<b>V9.9.54 PATCH CHIRURGICA ATTIVA:</b> calendario generale invariato. Solo EDEN è forzato in trasferta fino al 31/10/2026; nel ritorno può cambiare esclusivamente l’ordine delle giornate per rispettare il vincolo.';
     card.appendChild(n);
   }
 };
 s.onerror=()=>fail('errore caricamento motore patchato');
 document.body.appendChild(s);

}catch(e){ fail(e?.message||String(e)); }
})();