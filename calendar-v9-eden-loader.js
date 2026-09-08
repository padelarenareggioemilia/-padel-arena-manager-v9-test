/* V9.9.52 - EDEN + RITORNO NON SPECULARE VELOCE
   Ottimizzazione prestazioni:
   - NON genera più tutti gli accoppiamenti possibili del ritorno;
   - riusa i blocchi di giornata dell'andata e li RIORDINA liberamente;
   - ogni coppia gioca comunque 2 volte, una in casa e una fuori;
   - il ritorno può avere ordine diverso dall'andata;
   - mantiene vincolo EDEN, sospensioni, impianti e conflitti.
*/
(async function(){
'use strict';

const SOURCE='calendar-v9-clean.js?v=9952fast';
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

  /* VINCOLO EDEN */
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
  const p2=`    /* V9.9.52 EDEN: prima del 01/11/2026 le tre squadre EDEN sono solo ospiti. */
    if(fixtures.some(v9SpecialHomeConstraintViolation)){
      continue;
    }

`;
  if(!src.includes(m2)) throw Error('Marker orientazioni non trovato');
  src=src.replace(m2,p2+m2);

  /* RITORNO NON SPECULARE - VERSIONE VELOCE
     Si riordinano le giornate dell'andata, non si ricalcolano tutti i matching. */
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
  const sourceRounds=firstLeg.chosen.map((r,idx)=>({
    sourceIndex:idx,
    sourceRoundNo:r.roundNo,
    pairs:r.pairs
  }));

  const placed=[];
  const used=new Set();
  const memo=new Set();
  let states=0;
  const MAX_STATES=5000;
  const MAX_WEEK_SHIFTS=20;

  function buildReverseFixtures(sourceRound,returnRoundNo,anchor){
    const fixtures=sourceRound.pairs
      .filter(([home,away])=>!home.__bye&&!away.__bye)
      .map(([home,away])=>
        makeFixture(group,returnRoundNo,away,home,anchor,code)
      );

    if(fixtures.some(v9SpecialHomeConstraintViolation)) return null;
    if(roundTouchesExcludedDate(fixtures,code)) return null;

    for(let i=0;i<fixtures.length;i++){
      if(conflictsAny(fixtures[i],fixtures.filter((_,j)=>j!==i))){
        return null;
      }
    }

    if(!compatibleWithExternal(fixtures,external)) return null;
    return fixtures;
  }

  function stateKey(roundIndex,nextBaseAnchor){
    return roundIndex+'|'+[...used].sort((x,y)=>x-y).join(',')+'|'+dateKeyLocal(nextBaseAnchor);
  }

  function rec(roundIndex,nextBaseAnchor){
    states++;
    if(states>MAX_STATES) return false;
    if(roundIndex===sourceRounds.length) return true;

    const key=stateKey(roundIndex,nextBaseAnchor);
    if(memo.has(key)) return false;

    const returnRoundNo=firstLeg.totalRounds+roundIndex+1;
    const candidates=[];

    /* Per ogni giornata di andata non ancora usata,
       cerca la prima collocazione utile del relativo ritorno. */
    for(const sr of sourceRounds){
      if(used.has(sr.sourceIndex)) continue;

      for(let shift=0;shift<MAX_WEEK_SHIFTS;shift++){
        const anchor=addDays(nextBaseAnchor,shift*7);
        const fixtures=buildReverseFixtures(sr,returnRoundNo,anchor);
        if(!fixtures) continue;

        candidates.push({sr,anchor,fixtures,shift});
        break; // per questa giornata basta la prima data valida
      }
    }

    /* Euristica: prima le soluzioni che non richiedono rinvii,
       poi quelle con minor numero di settimane spostate. */
    candidates.sort((x,y)=>x.shift-y.shift);

    for(const c of candidates){
      used.add(c.sr.sourceIndex);
      placed.push({
        roundNo:returnRoundNo,
        fixtures:c.fixtures,
        anchor:c.anchor,
        sourceRoundNo:c.sr.sourceRoundNo
      });

      const next=addDays(c.anchor,intervalWeeks*7);
      if(rec(roundIndex+1,next)) return true;

      placed.pop();
      used.delete(c.sr.sourceIndex);
    }

    memo.add(key);
    return false;
  }

  if(!rec(0,new Date(startAnchor))){
    throw new Error(
      'Non riesco a costruire il ritorno non speculare rispettando '+
      'sospensioni, impianti e vincolo EDEN. '+
      'Ricerca veloce esaurita ('+states+' stati analizzati).'
    );
  }

  console.info('[V9.9.52] Ritorno non speculare generato in '+states+' stati.');
  return placed;
}

`;
  src=src.slice(0,a)+newReturn+src.slice(b);

  /* SICUREZZE FINALI */
  const m4="  /* SICUREZZA FINALE:\n     nessuna gara può essere su una data esclusa.\n  */";
  const p4=`  /* V9.9.52 - CONTROLLO FINALE EDEN */
  for(const f of payload){
    if(v9SpecialHomeConstraintViolation(f)){
      throw new Error(
        \`Vincolo EDEN non rispettato: \${f._home_name} risulta in casa il \${f._local_date}.\`
      );
    }
  }

  /* Ogni coppia, se formula andata/ritorno, deve avere una casa per parte. */
  if(isDouble){
    const pairStats=new Map();
    for(const f of payload){
      const k=pairKeyIds(f.home_team_id,f.away_team_id);
      if(!pairStats.has(k)) pairStats.set(k,[]);
      pairStats.get(k).push(f);
    }
    for(const list of pairStats.values()){
      if(list.length!==2){
        throw new Error('Errore interno: una coppia non ha esattamente 2 incontri.');
      }
      const x=list[0], y=list[1];
      if(String(x.home_team_id)!==String(y.away_team_id) ||
         String(x.away_team_id)!==String(y.home_team_id)){
        throw new Error('Errore interno: una coppia non ha una gara in casa e una fuori.');
      }
    }
  }

`;
  if(!src.includes(m4)) throw Error('Marker controllo finale non trovato');
  src=src.replace(m4,p4+m4);

  const blob=new Blob([src],{type:'text/javascript'});
  const url=URL.createObjectURL(blob);
  const s=document.createElement('script');
  s.src=url;
  s.onload=()=>{
    URL.revokeObjectURL(url);
    installNotice();
    console.info('[V9.9.52] Motore FAST attivo');
  };
  s.onerror=()=>{
    URL.revokeObjectURL(url);
    showError('Errore avvio motore calendario');
  };
  document.body.appendChild(s);

}catch(e){showError(e?.message||String(e));}

function showError(t){
  const b=document.createElement('div');
  b.style.cssText='position:fixed;left:15px;right:15px;bottom:15px;z-index:99999;padding:14px;border-radius:12px;background:#fdecef;border:1px solid #ce2b37;color:#7b1722;font:600 14px system-ui';
  b.textContent='Calendario: impossibile attivare V9.9.52 FAST. '+t;
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
    '<b>V9.9.52 FAST ATTIVA:</b> ritorno non speculare ottimizzato. '+
    'Ogni coppia gioca una volta in casa e una fuori, ma le giornate del ritorno possono essere riordinate. '+
    'Vincolo EDEN attivo su Serie B, Serie C e Coppa Italia: solo trasferta fino al 31/10/2026.';
  card.appendChild(n);
}
})();