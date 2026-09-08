/* V9.9.51 - EDEN + RITORNO NON SPECULARE
   Regole:
   1) Le tre squadre EDEN sono solo in trasferta fino al 31/10/2026
      su Serie B, Serie C, Coppa Italia e future competizioni.
   2) Andata e ritorno NON devono essere speculari per giornata.
      Ogni coppia di squadre si incontra comunque due volte:
      una volta in casa per A e una volta in casa per B.
      Il ritorno viene ricostruito con un secondo GLOBAL SORT indipendente.
*/
(async function(){
'use strict';

const SOURCE='calendar-v9-clean.js?v=9951eden';
const EDEN_IDS=[
  '3371654b-99ca-4135-b28a-582bdc0a41f1',
  'e4939c59-9670-4706-8abc-abb88a60a18f',
  '33a195e2-ad86-488c-9691-1ce188e9a490'
];
const AVAILABLE_FROM='2026-11-01';

try{
  const res=await fetch(SOURCE,{cache:'no-store'});
  if(!res.ok) throw Error('Motore calendario non disponibile: '+res.status);
  let src=await res.text();

  /* =========================
     VINCOLO EDEN
     ========================= */
  const m1="const pad=n=>String(n).padStart(2,'0');";
  const p1=`
const V9_EDEN_HOME_TEAM_IDS=new Set(${JSON.stringify(EDEN_IDS)});
const V9_EDEN_HOME_AVAILABLE_FROM='${AVAILABLE_FROM}';
function v9SpecialHomeConstraintViolation(f){
  if(!f) return false;
  if(!V9_EDEN_HOME_TEAM_IDS.has(String(f.home_team_id))) return false;
  const d=String(f._local_date||'').slice(0,10);
  return !!d && d<V9_EDEN_HOME_AVAILABLE_FROM;
}
`;
  if(!src.includes(m1)) throw Error('Marker base non trovato');
  src=src.replace(m1,m1+p1);

  const m2="    /* 10.11 - BLOCCO PREVENTIVO:";
  const p2=`    /* V9.9.51 EDEN: prima del 01/11/2026 le tre squadre EDEN sono solo ospiti. */
    if(fixtures.some(v9SpecialHomeConstraintViolation)){
      continue;
    }

`;
  if(!src.includes(m2)) throw Error('Marker orientazioni non trovato');
  src=src.replace(m2,p2+m2);

  /* =========================
     RITORNO NON SPECULARE
     ========================= */
  const startMarker='function buildReturnLeg({';
  const endMarker='window.buildCalendarPayload=async function(){';
  const a=src.indexOf(startMarker);
  const b=src.indexOf(endMarker);
  if(a<0 || b<0 || b<=a) throw Error('Blocco ritorno non trovato');

  const newReturn=`function buildReturnLeg({
  group,
  firstLeg,
  startAnchor,
  intervalWeeks,
  code,
  external
}){
  /* V9.9.51
     Il ritorno NON è più speculare per numero di giornata.
     Costruiamo un secondo round robin indipendente.
     Per ogni coppia l'orientamento è obbligatoriamente l'opposto
     della gara di andata: chi era in casa all'andata va fuori al ritorno.
  */

  const firstHomeByPair=new Map();
  const teamMap=new Map();

  for(const r of firstLeg.chosen){
    for(const [home,away] of r.pairs){
      if(!home||!away||home.__bye||away.__bye) continue;
      firstHomeByPair.set(pairKeyIds(home.id,away.id),String(home.id));
      teamMap.set(String(home.id),home);
      teamMap.set(String(away.id),away);
    }
  }

  let nodes=[...teamMap.values()];
  if(nodes.length%2){
    nodes.push({id:\`BYE-R-\${group.id}\`,name:'RIPOSO',__bye:true});
  }

  const totalRounds=nodes.length-1;
  const usedReturnPairs=new Set();
  const returns=[];

  function orientationForReturn(matching,roundNo,anchor){
    const fixtures=[];
    const pairs=[];

    for(const [x,y] of matching){
      if(x.__bye||y.__bye) continue;

      const key=pairKeyIds(x.id,y.id);
      const firstHome=firstHomeByPair.get(key);
      if(!firstHome) return null;

      /* Orientamento obbligatorio opposto all'andata */
      const home=String(x.id)===firstHome ? y : x;
      const away=String(x.id)===firstHome ? x : y;

      const f=makeFixture(group,roundNo,home,away,anchor,code);
      if(v9SpecialHomeConstraintViolation(f)) return null;

      fixtures.push(f);
      pairs.push([home,away]);
    }

    if(roundTouchesExcludedDate(fixtures,code)) return null;

    for(let i=0;i<fixtures.length;i++){
      if(conflictsAny(fixtures[i],fixtures.filter((_,j)=>j!==i))){
        return null;
      }
    }

    if(!compatibleWithExternal(fixtures,external)) return null;

    return {fixtures,pairs};
  }

  function rec(roundIndex,nextBaseAnchor){
    if(roundIndex===totalRounds) return true;

    const returnRoundNo=firstLeg.totalRounds+roundIndex+1;
    const MAX_WEEK_SHIFTS=60;

    for(let shift=0;shift<MAX_WEEK_SHIFTS;shift++){
      const anchor=addDays(nextBaseAnchor,shift*7);
      const matchings=generateMatchings(nodes,usedReturnPairs);

      for(const matching of matchings){
        const opt=orientationForReturn(matching,returnRoundNo,anchor);
        if(!opt) continue;

        const added=[];
        for(const [x,y] of matching){
          if(x.__bye||y.__bye) continue;
          const key=pairKeyIds(x.id,y.id);
          usedReturnPairs.add(key);
          added.push(key);
        }

        returns.push({
          roundNo:returnRoundNo,
          fixtures:opt.fixtures,
          anchor,
          pairs:opt.pairs
        });

        const next=addDays(anchor,intervalWeeks*7);
        if(rec(roundIndex+1,next)) return true;

        returns.pop();
        added.forEach(k=>usedReturnPairs.delete(k));
      }
    }

    return false;
  }

  if(!rec(0,new Date(startAnchor))){
    throw new Error(
      'Non riesco a costruire il ritorno non speculare rispettando '+
      'sospensioni, impianti, vincolo EDEN e alternanza casa/trasferta.'
    );
  }

  return returns;
}

`;
  src=src.slice(0,a)+newReturn+src.slice(b);

  /* Controllo finale EDEN */
  const m4="  /* SICUREZZA FINALE:\n     nessuna gara può essere su una data esclusa.\n  */";
  const p4=`  /* V9.9.51 - CONTROLLO FINALE EDEN */
  for(const f of payload){
    if(v9SpecialHomeConstraintViolation(f)){
      throw new Error(
        \`Vincolo EDEN non rispettato: \${f._home_name} risulta in casa il \${f._local_date}.\`
      );
    }
  }

  /* V9.9.51 - CONTROLLO DOPPIO INCONTRO CASA/FUORI */
  const pairStats=new Map();
  for(const f of payload){
    const k=pairKeyIds(f.home_team_id,f.away_team_id);
    if(!pairStats.has(k)) pairStats.set(k,[]);
    pairStats.get(k).push(f);
  }
  for(const [k,list] of pairStats){
    if(list.length!==2) continue;
    const a=list[0], b=list[1];
    if(String(a.home_team_id)!==String(b.away_team_id) ||
       String(a.away_team_id)!==String(b.home_team_id)){
      throw new Error('Errore interno ritorno: una coppia non ha una gara in casa e una in trasferta.');
    }
  }

`;
  if(!src.includes(m4)) throw Error('Marker controllo finale non trovato');
  src=src.replace(m4,p4+m4);

  /* Testo diagnosi */
  src=src.replace(
    "'GLOBAL SORT + sospensioni originali: '+\n      'se una giornata tocca una data esclusa, viene spostata interamente.'",
    "'GLOBAL SORT + ritorno non speculare + sospensioni originali: '+\n      'ogni coppia gioca una volta in casa e una fuori; le giornate di ritorno possono avere ordine diverso.'"
  );

  const blob=new Blob([src],{type:'text/javascript'});
  const url=URL.createObjectURL(blob);
  const s=document.createElement('script');
  s.src=url;
  s.onload=()=>{
    URL.revokeObjectURL(url);
    installNotice();
    console.info('[V9.9.51] EDEN + ritorno non speculare attivi');
  };
  s.onerror=()=>{
    URL.revokeObjectURL(url);
    showError('Errore avvio motore calendario');
  };
  document.body.appendChild(s);

}catch(e){
  showError(e?.message||String(e));
}

function showError(t){
  const b=document.createElement('div');
  b.style.cssText='position:fixed;left:15px;right:15px;bottom:15px;z-index:99999;padding:14px;border-radius:12px;background:#fdecef;border:1px solid #ce2b37;color:#7b1722;font:600 14px system-ui';
  b.textContent='Calendario: impossibile attivare V9.9.51. '+t;
  document.body.appendChild(b);
}

function installNotice(){
  if(document.getElementById('v9EdenConstraintNotice')) return;
  const card=[...document.querySelectorAll('.card')].find(x=>x.querySelector('#competition'))||document.querySelector('.card');
  if(!card) return;
  const n=document.createElement('div');
  n.id='v9EdenConstraintNotice';
  n.className='notice ok';
  n.innerHTML=
    '<b>V9.9.51 ATTIVA:</b> EDEN solo in trasferta fino al 31/10/2026 su tutte le competizioni. '+
    '<b>Andata e ritorno non speculari:</b> ogni coppia gioca comunque una volta in casa e una fuori, '+
    'ma l’ordine delle giornate di ritorno può essere diverso dall’andata.';
  card.appendChild(n);
}
})();