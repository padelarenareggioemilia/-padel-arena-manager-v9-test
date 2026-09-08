/* V9.9.61 - GENERATORE GENERALE CON CODA RECUPERI REALE
   Correzione mirata:
   - il ritorno NON fallisce più se una gara non entra;
   - la singola gara problematica viene accodata ai recuperi;
   - il resto del calendario continua a generarsi;
   - alla fine le residue vengono distribuite nei successivi slot PRO
     della stessa competizione.
*/
(async function(){
'use strict';

const SOURCE='calendar-v9-clean.js?v=9961base';
const EDEN_IDS=new Set([
  '3371654b-99ca-4135-b28a-582bdc0a41f1',
  'e4939c59-9670-4706-8abc-abb88a60a18f',
  '33a195e2-ad86-488c-9691-1ce188e9a490'
]);
const EDEN_HOME_FROM='2026-11-01';

function errorBox(t){
  const b=document.createElement('div');
  b.style.cssText='position:fixed;left:15px;right:15px;bottom:15px;z-index:99999;padding:14px;border-radius:12px;background:#fdecef;border:1px solid #ce2b37;color:#7b1722;font:600 14px system-ui';
  b.textContent='V9.9.61 non attivata: '+t;
  document.body.appendChild(b);
}

try{
  const r=await fetch(SOURCE,{cache:'no-store'});
  if(!r.ok) throw Error('motore base non disponibile');
  let src=await r.text();

  const base="const pad=n=>String(n).padStart(2,'0');";
  if(!src.includes(base)) throw Error('marker base non trovato');

  src=src.replace(base,base+`
const V9_EDEN_IDS=new Set(${JSON.stringify([...EDEN_IDS])});
const V9_EDEN_HOME_FROM='${EDEN_HOME_FROM}';

function v9ForbiddenHome(f){
  return !!f &&
    V9_EDEN_IDS.has(String(f.home_team_id)) &&
    String(f._local_date||'').slice(0,10)<V9_EDEN_HOME_FROM;
}

function v9TeamUsedInBucket(f,bucket){
  return bucket.some(x =>
    String(x.home_team_id)===String(f.home_team_id) ||
    String(x.away_team_id)===String(f.home_team_id) ||
    String(x.home_team_id)===String(f.away_team_id) ||
    String(x.away_team_id)===String(f.away_team_id)
  );
}

function v9NextSlot(anchor,intervalWeeks,steps=1){
  return addDays(anchor,intervalWeeks*7*steps);
}
`);

  /* Eden nell'andata */
  const orient=`    const fixtures=pairs.map(([home,away])=>
      makeFixture(group,roundNo,home,away,anchor,code)
    );`;
  if(!src.includes(orient)) throw Error('marker orientazioni non trovato');
  src=src.replace(orient,orient+`

    if(fixtures.some(v9ForbiddenHome)){
      continue;
    }`);

  /* Rimuove il falso pre-filtro sharedSlotViolation; resta il conflitto reale */
  const preStart=src.indexOf('    /* 10.11 - BLOCCO PREVENTIVO:');
  const preEnd=src.indexOf('    /* Se una gara cade su data esclusa',preStart);
  if(preStart>=0 && preEnd>preStart){
    src=src.slice(0,preStart)+
`    /* V9.9.61: eliminato il pre-filtro astratto.
       Decide solo il controllo reale data/ora/impianto. */

`+src.slice(preEnd);
  }

  /* Ritorno: speculare come struttura base, ma le singole gare problematiche
     vengono messe in coda invece di far fallire tutto. */
  const a=src.indexOf('function buildReturnLeg({');
  const b=src.indexOf('window.buildCalendarPayload=async function(){',a);
  if(a<0||b<0) throw Error('blocco ritorno non trovato');

  const returnFn=`function buildReturnLeg({
  group,
  firstLeg,
  startAnchor,
  intervalWeeks,
  code,
  external
}){
  const returns=[];
  const deferred=[];
  let anchor=new Date(startAnchor);

  for(let i=0;i<firstLeg.chosen.length;i++){
    const first=firstLeg.chosen[i];
    const roundNo=first.roundNo+firstLeg.totalRounds;

    const raw=first.pairs.map(([home,away])=>
      makeFixture(group,roundNo,away,home,anchor,code)
    );

    const accepted=[];

    for(const f of raw){
      let bad=false;

      if(v9ForbiddenHome(f)) bad=true;
      if(fixtureFallsOnExcludedDate(f,code)) bad=true;
      if(conflictsAny(f,accepted)) bad=true;
      if(!compatibleWithExternal([f],external)) bad=true;

      if(bad){
        deferred.push({fixture:f,group,reason:'RETURN_DEFERRED'});
      }else{
        accepted.push(f);
      }
    }

    returns.push({
      roundNo,
      fixtures:accepted,
      anchor
    });

    anchor=v9NextSlot(anchor,intervalWeeks);
  }

  return {returns,deferred};
}

`;
  src=src.slice(0,a)+returnFn+src.slice(b);

  /* Sostituisce buildCalendarPayload con versione che gestisce davvero
     la coda recuperi PRIMA di qualunque throw globale. */
  const p1=src.indexOf('window.buildCalendarPayload=async function(){');
  const p2=src.indexOf('/* Nessuna vecchia riparazione automatica */',p1);
  if(p1<0||p2<0) throw Error('buildCalendarPayload non trovato');

  const payloadFn=`window.buildCalendarPayload=async function(){
  if(!$id('startDate')?.value){
    throw new Error('Inserisci la data di partenza.');
  }

  await fetchData();

  if(!groups.length){
    throw new Error('Prima devi creare i gironi.');
  }

  if(!validateTeams(false)){
    throw new Error('Completa prima giorno, ora e campo delle squadre.');
  }

  const code=$id('competition').value;
  const isDouble=$id('formula').value==='double';
  const intervalWeeks=Number($id('interval').value||1);
  const start=fromDateKey($id('startDate').value);

  const external=externalFixtures(code);
  const payload=[];
  const recoveryQueue=[];

  let latestNaturalAnchor=new Date(start);

  for(const group of groups){
    const groupTeams=members
      .filter(m=>String(m.group_id)===String(group.id))
      .map(m=>teams.find(t=>String(t.id)===String(m.team_id)))
      .filter(Boolean);

    if(groupTeams.length<2) continue;

    const crossGroupExternal=[
      ...external,
      ...payload.map(f=>({...f}))
    ];

    const firstLeg=solveFirstLeg({
      group,
      groupTeams,
      start,
      intervalWeeks,
      code,
      external:crossGroupExternal
    });

    /* Andata: blackout o vincolo speciale => recupero, non fallimento */
    for(const r of firstLeg.chosen){
      if(r.firstAnchor>latestNaturalAnchor) latestNaturalAnchor=new Date(r.firstAnchor);

      for(const f of r.firstFixtures){
        let bad=false;
        if(v9ForbiddenHome(f)) bad=true;
        if(fixtureFallsOnExcludedDate(f,code)) bad=true;
        if(conflictsAny(f,payload)) bad=true;
        if(!compatibleWithExternal([f],external)) bad=true;

        if(bad){
          recoveryQueue.push({fixture:f,group,reason:'FIRST_DEFERRED'});
        }else{
          payload.push(f);
        }
      }
    }

    if(isDouble){
      const lastFirstAnchor=
        firstLeg.chosen[firstLeg.chosen.length-1].firstAnchor;

      const returnStart=v9NextSlot(lastFirstAnchor,intervalWeeks);
      if(returnStart>latestNaturalAnchor) latestNaturalAnchor=new Date(returnStart);

      const built=buildReturnLeg({
        group,
        firstLeg,
        startAnchor:returnStart,
        intervalWeeks,
        code,
        external:[
          ...external,
          ...payload.map(f=>({...f}))
        ]
      });

      for(const r of built.returns){
        if(r.anchor>latestNaturalAnchor) latestNaturalAnchor=new Date(r.anchor);
        payload.push(...r.fixtures);
      }

      recoveryQueue.push(...built.deferred);
    }
  }

  /* =========================================================
     RECUPERI PRO
     Primo slot = successivo slot della stessa competizione
     Secondo slot = quello ancora successivo
     ========================================================= */
  const proBuckets=[
    {index:1,anchor:v9NextSlot(latestNaturalAnchor,intervalWeeks,1),fixtures:[]},
    {index:2,anchor:v9NextSlot(latestNaturalAnchor,intervalWeeks,2),fixtures:[]}
  ];

  for(const item of recoveryQueue){
    const original=item.fixture;
    const group=item.group;

    const home=teams.find(t=>String(t.id)===String(original.home_team_id));
    const away=teams.find(t=>String(t.id)===String(original.away_team_id));

    if(!home||!away||!group){
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

      if(v9ForbiddenHome(candidate)) continue;
      if(fixtureFallsOnExcludedDate(candidate,code)) continue;
      if(v9TeamUsedInBucket(candidate,bucket.fixtures)) continue;
      if(conflictsAny(candidate,bucket.fixtures)) continue;
      if(!compatibleWithExternal([candidate],external)) continue;
      if(conflictsAny(candidate,payload)) continue;

      bucket.fixtures.push(candidate);
      placed=candidate;
      break;
    }

    if(!placed){
      throw new Error(
        'Recuperi PRO insufficienti per '+
        original._home_name+' – '+original._away_name+'.'
      );
    }

    payload.push(placed);
  }

  /* Controllo finale: nessun conflitto reale */
  for(let i=0;i<payload.length;i++){
    for(let j=i+1;j<payload.length;j++){
      if(realFacilityConflict(payload[i],payload[j])){
        throw new Error(
          'Conflitto reale finale: '+
          payload[i]._home_name+' – '+payload[i]._away_name+
          ' / '+
          payload[j]._home_name+' – '+payload[j]._away_name
        );
      }
    }
  }

  payload.sort((a,b)=>
    (new Date(a.scheduled_at)-new Date(b.scheduled_at)) ||
    (a.round_number-b.round_number)
  );

  window.__v9RecoverySummary={
    total:recoveryQueue.length,
    pro1:proBuckets[0].fixtures.length,
    pro2:proBuckets[1].fixtures.length,
    pro1Anchor:dateKeyLocal(proBuckets[0].anchor),
    pro2Anchor:dateKeyLocal(proBuckets[1].anchor)
  };

  payload._calendarDiagnosis={
    totalMatches:payload.length,
    recoveryMatches:recoveryQueue.length,
    conflictsDetected:0,
    conflictsUnresolved:0,
    progression:'OK',
    rule:
      'V9.9.61: le gare non collocabili non bloccano il generatore; '+
      'vengono accodate e distribuite nei successivi slot PRO della stessa competizione.'
  };

  return payload;
};

`;

  src=src.slice(0,p1)+payloadFn+src.slice(p2);

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
        '<b>V9.9.61 CODA RECUPERI REALE ATTIVA:</b> '+
        'una gara che non entra nel calendario naturale non blocca più la generazione: '+
        'viene accodata e spostata nei successivi slot PRO della stessa competizione.';
      c.appendChild(n);
    }
  };

  s.onerror=()=>errorBox('errore caricamento motore');
  document.body.appendChild(s);

}catch(e){
  errorBox(e?.message||String(e));
}
})();