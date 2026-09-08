/* V9.9.53 - CALENDARIO ULTRA FAST
   Obiettivo: eliminare i blocchi del browser.

   Strategia:
   - niente ricerca combinatoria di TUTTI gli accoppiamenti;
   - accoppiamenti round-robin deterministici (metodo "cerchio");
   - per ogni giornata si provano SOLO le orientazioni CASA/TRASFERTA;
   - le giornate di ritorno possono essere riordinate liberamente;
   - ogni coppia gioca sempre 2 volte: una in casa e una fuori;
   - EDEN solo in trasferta fino al 31/10/2026;
   - sospensioni, conflitti impianto, giorno/ora/campo restano vincolanti.
*/
(async function(){
'use strict';

const SOURCE='calendar-v9-clean.js?v=9953ultrafast';
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

function v9RoundRobinRounds(inputNodes){
  const nodes=[...inputNodes];
  if(nodes.length%2){
    nodes.push({id:'BYE-'+Math.random().toString(36).slice(2),name:'RIPOSO',__bye:true});
  }

  const n=nodes.length;
  const arr=[...nodes];
  const rounds=[];

  for(let r=0;r<n-1;r++){
    const pairs=[];
    for(let i=0;i<n/2;i++){
      pairs.push([arr[i],arr[n-1-i]]);
    }
    rounds.push(pairs);

    /* rotazione: primo fisso, gli altri ruotano */
    const fixed=arr[0];
    const rest=arr.slice(1);
    rest.unshift(rest.pop());
    arr.splice(0,arr.length,fixed,...rest);
  }

  return rounds;
}
`;
  if(!src.includes(m1)) throw Error('Marker base non trovato');
  src=src.replace(m1,m1+p1);

  /* =========================
     SOLVER ANDATA ULTRA FAST
     ========================= */
  const s1=src.indexOf('function solveFirstLeg({');
  const s2=src.indexOf('/* Costruisce il ritorno speculare.', s1);
  if(s1<0 || s2<0) throw Error('Blocco solveFirstLeg non trovato');

  const fastFirst=`function solveFirstLeg({
  group,
  groupTeams,
  start,
  intervalWeeks,
  code,
  external
}){
  const roundTemplates=v9RoundRobinRounds(groupTeams);
  const totalRounds=roundTemplates.length;
  const chosen=[];

  /* equilibrio casa/trasferta semplice:
     penalizza chi ha già troppe gare consecutive dello stesso tipo */
  const homeCount=new Map();
  const awayCount=new Map();

  function count(map,id){ return map.get(String(id))||0; }
  function inc(map,id){ map.set(String(id),count(map,id)+1); }
  function dec(map,id){ map.set(String(id),Math.max(0,count(map,id)-1)); }

  function optionScore(pairs){
    let score=0;
    for(const [h,a] of pairs){
      score+=Math.abs((count(homeCount,h.id)+1)-count(awayCount,h.id));
      score+=Math.abs(count(homeCount,a.id)-(count(awayCount,a.id)+1));
    }
    return score;
  }

  function orientationsForTemplate(template,roundNo,anchor){
    const realPairs=template.filter(([a,b])=>!a.__bye&&!b.__bye);
    const out=[];
    const max=1<<realPairs.length;

    /* Solo orientazioni; niente ricalcolo degli accoppiamenti. */
    for(let mask=0;mask<max;mask++){
      const pairs=realPairs.map(([a,b],i)=>(mask&(1<<i))?[b,a]:[a,b]);
      const fixtures=pairs.map(([home,away])=>
        makeFixture(group,roundNo,home,away,anchor,code)
      );

      if(fixtures.some(v9SpecialHomeConstraintViolation)) continue;
      if(roundTouchesExcludedDate(fixtures,code)) continue;

      let ok=true;
      for(let i=0;i<fixtures.length;i++){
        if(conflictsAny(fixtures[i],fixtures.filter((_,j)=>j!==i))){
          ok=false; break;
        }
      }
      if(!ok) continue;
      if(!compatibleWithExternal(fixtures,external)) continue;

      out.push({pairs,fixtures,score:optionScore(pairs)});
    }

    out.sort((a,b)=>a.score-b.score);
    return out;
  }

  let nextBase=new Date(start);

  for(let i=0;i<roundTemplates.length;i++){
    const roundNo=i+1;
    let placed=false;

    for(let shift=0;shift<20;shift++){
      const anchor=addDays(nextBase,shift*7);
      const opts=orientationsForTemplate(roundTemplates[i],roundNo,anchor);

      if(!opts.length) continue;

      const opt=opts[0];
      chosen.push({
        roundNo,
        pairs:opt.pairs,
        firstFixtures:opt.fixtures,
        firstAnchor:anchor
      });

      for(const [h,a] of opt.pairs){
        inc(homeCount,h.id);
        inc(awayCount,a.id);
      }

      nextBase=addDays(anchor,intervalWeeks*7);
      placed=true;
      break;
    }

    if(!placed){
      throw new Error(
        'Non riesco a collocare la giornata di andata G'+roundNo+
        ' rispettando sospensioni, impianti e vincolo EDEN.'
      );
    }
  }

  return {chosen,totalRounds};
}

`;

  src=src.slice(0,s1)+fastFirst+src.slice(s2);

  /* =========================
     RITORNO NON SPECULARE ULTRA FAST
     ========================= */
  const r1=src.indexOf('function buildReturnLeg({');
  const r2=src.indexOf('window.buildCalendarPayload=async function(){', r1);
  if(r1<0 || r2<0) throw Error('Blocco buildReturnLeg non trovato');

  const fastReturn=`function buildReturnLeg({
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

  const remaining=[...sourceRounds];
  const returns=[];
  let nextBase=new Date(startAnchor);

  function tryRound(sr,returnRoundNo,anchor){
    const fixtures=sr.pairs
      .filter(([h,a])=>!h.__bye&&!a.__bye)
      .map(([h,a])=>makeFixture(group,returnRoundNo,a,h,anchor,code));

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

  for(let ri=0;ri<sourceRounds.length;ri++){
    const returnRoundNo=firstLeg.totalRounds+ri+1;
    let selectedIndex=-1;
    let selectedAnchor=null;
    let selectedFixtures=null;

    /* prova le giornate di andata rimaste in ordine diverso.
       È un greedy limitato: massimo R * 20 tentativi, niente esplosione combinatoria. */
    outer:
    for(let shift=0;shift<20;shift++){
      const anchor=addDays(nextBase,shift*7);

      for(let j=0;j<remaining.length;j++){
        const fixtures=tryRound(remaining[j],returnRoundNo,anchor);
        if(!fixtures) continue;

        selectedIndex=j;
        selectedAnchor=anchor;
        selectedFixtures=fixtures;
        break outer;
      }
    }

    if(selectedIndex<0){
      throw new Error(
        'Non riesco a collocare la giornata di ritorno G'+returnRoundNo+
        ' con il metodo veloce rispettando i vincoli.'
      );
    }

    const sr=remaining.splice(selectedIndex,1)[0];
    returns.push({
      roundNo:returnRoundNo,
      fixtures:selectedFixtures,
      anchor:selectedAnchor,
      sourceRoundNo:sr.sourceRoundNo
    });

    nextBase=addDays(selectedAnchor,intervalWeeks*7);
  }

  return returns;
}

`;

  src=src.slice(0,r1)+fastReturn+src.slice(r2);

  /* =========================
     SICUREZZE FINALI
     ========================= */
  const m4="  /* SICUREZZA FINALE:\\n     nessuna gara può essere su una data esclusa.\\n  */";
  const p4=`  /* V9.9.53 - SICUREZZA EDEN */
  for(const f of payload){
    if(v9SpecialHomeConstraintViolation(f)){
      throw new Error(
        \`Vincolo EDEN non rispettato: \${f._home_name} risulta in casa il \${f._local_date}.\`
      );
    }
  }

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
  const script=document.createElement('script');
  script.src=url;

  script.onload=()=>{
    URL.revokeObjectURL(url);
    installNotice();
    console.info('[V9.9.53] ULTRA FAST attivo');
  };

  script.onerror=()=>{
    URL.revokeObjectURL(url);
    showError('Errore avvio motore calendario');
  };

  document.body.appendChild(script);

}catch(e){
  showError(e?.message||String(e));
}

function showError(t){
  const b=document.createElement('div');
  b.style.cssText='position:fixed;left:15px;right:15px;bottom:15px;z-index:99999;padding:14px;border-radius:12px;background:#fdecef;border:1px solid #ce2b37;color:#7b1722;font:600 14px system-ui';
  b.textContent='Calendario: impossibile attivare V9.9.53 ULTRA FAST. '+t;
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
    '<b>V9.9.53 ULTRA FAST ATTIVA:</b> accoppiamenti round-robin deterministici, nessuna ricerca combinatoria globale. '+
    'Ritorno non speculare con una gara in casa e una fuori per ogni coppia. '+
    'Vincolo EDEN attivo su Serie B, Serie C e Coppa Italia: solo trasferta fino al 31/10/2026.';
  card.appendChild(n);
}
})();