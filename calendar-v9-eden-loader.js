/* V9.9.60 - GENERATORE GENERALE CALENDARI
   Motore unico per Campionati, Coppa Italia e competizioni future.

   Principi:
   - numero giornate dinamico dal girone;
   - formula singola o andata/ritorno;
   - cadenza scelta dall'Admin;
   - ritorno non necessariamente speculare;
   - una casa e una fuori per coppia nell'andata/ritorno;
   - giorno/ora/campo derivano SEMPRE dalla squadra di casa;
   - conflitti solo REALI: stessa risorsa/impianto nello stesso intervallo;
   - blackout: la singola gara problematica viene messa in coda recuperi,
     senza distruggere il resto del calendario;
   - recuperi: massimo una gara per squadra per weekend e nessun conflitto impianto;
   - vincoli speciali impianto/squadra applicabili a QUALSIASI competizione.
*/
(async function(){
'use strict';

const SOURCE='calendar-v9-clean.js?v=9960general';

/* Vincolo speciale attuale: Via Balla / tre squadre EDEN.
   È volutamente indipendente dalla competizione. */
const EDEN_IDS=new Set([
  '3371654b-99ca-4135-b28a-582bdc0a41f1',
  'e4939c59-9670-4706-8abc-abb88a60a18f',
  '33a195e2-ad86-488c-9691-1ce188e9a490'
]);
const EDEN_HOME_FROM='2026-11-01';

function errorBox(t){
 const b=document.createElement('div');
 b.style.cssText='position:fixed;left:15px;right:15px;bottom:15px;z-index:99999;padding:14px;border-radius:12px;background:#fdecef;border:1px solid #ce2b37;color:#7b1722;font:600 14px system-ui';
 b.textContent='V9.9.60 non attivata: '+t;
 document.body.appendChild(b);
}

try{
 const r=await fetch(SOURCE,{cache:'no-store'});
 if(!r.ok) throw Error('motore base non disponibile');
 let src=await r.text();

 const base="const pad=n=>String(n).padStart(2,'0');";
 if(!src.includes(base)) throw Error('marker base non trovato');

 src=src.replace(base,base+`
const V9_SPECIAL_EDEN_IDS=new Set(${JSON.stringify([...EDEN_IDS])});
const V9_SPECIAL_EDEN_HOME_FROM='${EDEN_HOME_FROM}';

function v9SpecialHomeForbidden(f){
 if(!f) return false;
 if(!V9_SPECIAL_EDEN_IDS.has(String(f.home_team_id))) return false;
 return String(f._local_date||'').slice(0,10)<V9_SPECIAL_EDEN_HOME_FROM;
}

/* Restituisce il successivo anchor della STESSA competizione.
   Usa la cadenza scelta dall'Admin: se è 2 settimane, non invade
   automaticamente il weekend intermedio dell'altra competizione. */
function v9NextCompetitionAnchor(anchor,intervalWeeks,steps=1){
 return addDays(anchor,intervalWeeks*7*steps);
}

function v9TeamAlreadyInBucket(f,bucket){
 return bucket.some(x =>
   String(x.home_team_id)===String(f.home_team_id) ||
   String(x.away_team_id)===String(f.home_team_id) ||
   String(x.home_team_id)===String(f.away_team_id) ||
   String(x.away_team_id)===String(f.away_team_id)
 );
}
`);

 /* Unica forzatura speciale nell'orientamento: vincoli reali di disponibilità casa */
 const orient=`    const fixtures=pairs.map(([home,away])=>
      makeFixture(group,roundNo,home,away,anchor,code)
    );`;
 if(!src.includes(orient)) throw Error('marker orientazioni non trovato');
 src=src.replace(orient,orient+`

    if(fixtures.some(v9SpecialHomeForbidden)){
      continue;
    }`);

 /* Rimuove il pre-filtro astratto sharedSlotViolation.
    Resta il controllo reale realFacilityConflict(), che usa overlap data/ora. */
 const preStart=src.indexOf('    /* 10.11 - BLOCCO PREVENTIVO:');
 const preEnd=src.indexOf('    /* Se una gara cade su data esclusa',preStart);
 if(preStart>=0 && preEnd>preStart){
   src=src.slice(0,preStart)+
`    /* V9.9.60: nessun falso conflitto preventivo.
       Da qui decide il controllo reale di data/ora/impianto. */

`+src.slice(preEnd);
 }

 /* Ritorno generale non speculare: stessi blocchi di accoppiamenti,
    invertiti casa/fuori, ma ordine delle giornate libero. */
 const a=src.indexOf('function buildReturnLeg({');
 const b=src.indexOf('window.buildCalendarPayload=async function(){',a);
 if(a<0||b<0) throw Error('blocco ritorno non trovato');

 const returnFn=`function buildReturnLeg({
  group,firstLeg,startAnchor,intervalWeeks,code,external
}){
 const sources=firstLeg.chosen.map((r,i)=>({idx:i,pairs:r.pairs}));
 const used=new Set(), result=[];
 let states=0;
 const MAX_STATES=30000;

 function rec(pos,anchor){
   if(pos===sources.length) return true;
   if(++states>MAX_STATES) return false;

   const roundNo=firstLeg.totalRounds+pos+1;

   for(const source of sources){
     if(used.has(source.idx)) continue;

     const fixtures=source.pairs.map(([h,a])=>
       makeFixture(group,roundNo,a,h,anchor,code)
     );

     if(fixtures.some(v9SpecialHomeForbidden)) continue;

     let bad=false;
     for(let i=0;i<fixtures.length;i++){
       if(conflictsAny(fixtures[i],fixtures.filter((_,j)=>j!==i))){
         bad=true; break;
       }
     }
     if(bad) continue;
     if(!compatibleWithExternal(fixtures,external)) continue;

     used.add(source.idx);
     result.push({roundNo,fixtures,anchor,sourceIndex:source.idx});

     if(rec(pos+1,v9NextCompetitionAnchor(anchor,intervalWeeks))){
       return true;
     }

     result.pop();
     used.delete(source.idx);
   }
   return false;
 }

 if(!rec(0,new Date(startAnchor))){
   throw new Error(
     'Non riesco a comporre il ritorno nelle giornate naturali rispettando i vincoli reali.'
   );
 }

 return result;
}

`;
 src=src.slice(0,a)+returnFn+src.slice(b);

 /* Modifica la sicurezza finale: le gare su blackout verranno gestite
    dalla coda recuperi PRIMA della restituzione del payload. */
 const payloadStart=src.indexOf('window.buildCalendarPayload=async function(){');
 const safety=src.indexOf('  /* SICUREZZA FINALE:',payloadStart);
 if(payloadStart<0||safety<0) throw Error('sezione payload/sicurezza non trovata');

 /* Inserisce gestione recuperi subito prima della sicurezza finale.
    Gli slot PRO sono DINAMICI: partono dal successivo slot della stessa competizione
    dopo l'ultima data ordinaria effettivamente generata. */
 const recovery=`
  /* =====================================================
     V9.9.60 - CODA RECUPERI GENERALE
     ===================================================== */
  const recoveryItems=[];
  const regularItems=[];

  for(const f of payload){
    if(fixtureFallsOnExcludedDate(f,code)){
      recoveryItems.push(f);
    }else{
      regularItems.push(f);
    }
  }

  if(recoveryItems.length){
    payload.length=0;
    payload.push(...regularItems);

    let lastAnchor=start;
    for(const f of regularItems){
      const a=f._round_anchor ? fromDateKey(f._round_anchor) : new Date(f.scheduled_at);
      if(a>lastAnchor) lastAnchor=a;
    }

    /* Primo PRO = successivo slot naturale della stessa competizione.
       Se non basta, secondo PRO = slot successivo ancora. */
    const proBuckets=[];
    for(let p=1;p<=2;p++){
      proBuckets.push({
        index:p,
        anchor:v9NextCompetitionAnchor(lastAnchor,intervalWeeks,p),
        fixtures:[]
      });
    }

    for(const original of recoveryItems){
      const group=groups.find(g=>String(g.id)===String(original.group_id));
      const home=teams.find(t=>String(t.id)===String(original.home_team_id));
      const away=teams.find(t=>String(t.id)===String(original.away_team_id));

      if(!group||!home||!away){
        throw new Error('Dati mancanti per una gara di recupero.');
      }

      let placed=null;

      for(const bucket of proBuckets){
        const candidate=makeFixture(
          group,
          original.round_number,
          home,
          away,
          bucket.anchor,
          code
        );

        if(v9SpecialHomeForbidden(candidate)) continue;
        if(fixtureFallsOnExcludedDate(candidate,code)) continue;
        if(v9TeamAlreadyInBucket(candidate,bucket.fixtures)) continue;
        if(conflictsAny(candidate,bucket.fixtures)) continue;
        if(!compatibleWithExternal(candidate?[candidate]:[],external)) continue;

        bucket.fixtures.push(candidate);
        placed=candidate;
        break;
      }

      if(!placed){
        throw new Error(
          'Recuperi PRO insufficienti per '+original._home_name+
          ' – '+original._away_name+'.'
        );
      }

      payload.push(placed);
    }

    window.__v9GeneralRecoverySummary={
      total:recoveryItems.length,
      buckets:proBuckets.map(b=>({
        index:b.index,
        anchor:dateKeyLocal(b.anchor),
        matches:b.fixtures.length
      }))
    };
  }

  /* Vincolo speciale finale */
  for(const f of payload){
    if(v9SpecialHomeForbidden(f)){
      throw new Error(
        'Vincolo disponibilità casa non rispettato: '+f._home_name+
        ' il '+f._local_date+'.'
      );
    }
  }

`;
 src=src.slice(0,safety)+recovery+src.slice(safety);

 const blob=new Blob([src],{type:'text/javascript'});
 const url=URL.createObjectURL(blob);
 const s=document.createElement('script');
 s.src=url;

 s.onload=()=>{
   URL.revokeObjectURL(url);
   const c=[...document.querySelectorAll('.card')]
     .find(x=>x.querySelector('#competition'))||document.querySelector('.card');
   if(c){
     const n=document.createElement('div');
     n.className='notice ok';
     n.innerHTML=
       '<b>V9.9.60 GENERATORE GENERALE ATTIVO:</b> motore unico per Campionati, Coppa Italia e competizioni future. '+
       'Giornate dinamiche, ritorno non speculare, conflitti reali e recuperi PRO automatici sul successivo slot della stessa competizione. '+
       'Vincolo Via Balla/EDEN attivo fino al 31/10/2026.';
     c.appendChild(n);
   }
 };
 s.onerror=()=>errorBox('errore caricamento motore');
 document.body.appendChild(s);

}catch(e){
 errorBox(e?.message||String(e));
}
})();