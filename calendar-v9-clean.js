/* calendar-v9-clean.js - V9 SIMPLE 10.7
   GLOBAL SORT + SOSPENSIONI ORIGINALI PER DATA

   Regola sospensioni:
   - usa ESATTAMENTE le date presenti in calendar_blackouts;
   - ogni riga può valere per ALL oppure per una singola competition_code;
   - il motore genera UNA GIORNATA INTERA;
   - se anche UNA partita della giornata cade su una data esclusa applicabile,
     NON sposta quella partita: sposta L'INTERA GIORNATA al blocco successivo;
   - poi riprova accoppiamenti + CASA/TRASFERTA con il GLOBAL SORT;
   - il ritorno resta speculare;
   - nessuna interpretazione artificiale "settimana bloccata".
*/
(function(){
'use strict';

const $id=id=>document.getElementById(id);
const norm=v=>String(v??'')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,' ')
  .replace(/\s+/g,' ').trim();
const pad=n=>String(n).padStart(2,'0');

function fromDateKey(k){
  const [y,m,d]=String(k).split('-').map(Number);
  return new Date(y,m-1,d,12,0,0,0);
}
function addDays(d,n){
  const x=new Date(d);
  x.setDate(x.getDate()+n);
  return x;
}
function dateKeyLocal(d){
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function durationMinutes(team){
  return Number(team?.match_slot_minutes||$id('defaultSlotMinutes')?.value||120);
}
function pairKeyIds(a,b){
  return [String(a),String(b)].sort().join('|');
}

function sharedFacilityKey(team,venue){
  if(team?.facility_id) return `id:${team.facility_id}`;

  try{
    if(typeof facilityKey==='function'){
      const k=facilityKey(team,venue||team?.home_court);
      if(k) return `v9:${String(k)}`;
    }
  }catch(_){}

  const addr=[team?.club_address,team?.club_city]
    .map(norm).filter(Boolean).join('|');

  if(addr) return `addr:${addr}`;

  return `court:${norm(venue||team?.home_court||team?.id||'')}`;
}

function overlap(a,b){
  if(!a?.scheduled_at||!b?.scheduled_at) return false;

  const a0=new Date(a.scheduled_at).getTime();
  const b0=new Date(b.scheduled_at).getTime();
  const a1=a0+(a._duration_minutes||120)*60000;
  const b1=b0+(b._duration_minutes||120)*60000;

  return a0<b1 && b0<a1;
}

function sameLogicalMatch(a,b){
  if(a?.id&&b?.id&&String(a.id)===String(b.id)) return true;

  return pairKeyIds(a?.home_team_id,a?.away_team_id)===
         pairKeyIds(b?.home_team_id,b?.away_team_id);
}

function realFacilityConflict(a,b){
  if(!a||!b||sameLogicalMatch(a,b)) return false;
  if(!a._facility_key||!b._facility_key) return false;

  return a._facility_key===b._facility_key && overlap(a,b);
}

/* =========================
   SOSPENSIONI ORIGINALI
   ========================= */

function blackoutApplies(row,competitionCode){
  const scope=String(row?.competition_code||'ALL').toUpperCase();
  const code=String(competitionCode||'').toUpperCase();

  return scope==='ALL' || scope===code;
}

function excludedDateSet(competitionCode){
  return new Set(
    (blackouts||[])
      .filter(row=>blackoutApplies(row,competitionCode))
      .map(row=>String(row.blackout_date||'').slice(0,10))
      .filter(Boolean)
  );
}

function fixtureFallsOnExcludedDate(fixture,competitionCode){
  if(!fixture?.scheduled_at) return false;

  const date=dateKeyLocal(new Date(fixture.scheduled_at));
  return excludedDateSet(competitionCode).has(date);
}

function roundTouchesExcludedDate(fixtures,competitionCode){
  return fixtures.some(f=>fixtureFallsOnExcludedDate(f,competitionCode));
}

function homeOccurrence(anchor,team){
  const targetDay=dayIndex(team.home_match_day);
  const hhmm=normalizeTime(team.home_match_time);

  if(targetDay===undefined){
    throw new Error(`Manca il giorno di casa per ${team.name}.`);
  }
  if(!hhmm){
    throw new Error(`Manca l'orario di casa per ${team.name}.`);
  }
  if(!String(team.home_court||'').trim()){
    throw new Error(`Manca il campo di casa per ${team.name}.`);
  }

  const d=new Date(anchor);
  let guard=0;

  while(d.getDay()!==targetDay && guard++<7){
    d.setDate(d.getDate()+1);
  }

  const date=dateKeyLocal(d);

  return {
    date,
    time:hhmm,
    scheduled_at:localDateTimeToISO(date,hhmm),
    venue:team.home_court
  };
}

function makeFixture(group,roundNumber,home,away,anchor,competitionCode){
  const occ=homeOccurrence(anchor,home);
  const local=localPartsFromISO(occ.scheduled_at);

  const fixture={
    competition_code:competitionCode,
    phase:'Girone',
    group_id:group.id,
    round_number:roundNumber,
    home_team_id:home.id,
    away_team_id:away.id,
    scheduled_at:occ.scheduled_at,
    venue:home.home_court,

    _home_name:home.name,
    _away_name:away.name,
    _configured_day:home.home_match_day,
    _configured_time:occ.time,
    _local_date:local.date,
    _local_time:local.time,
    _local_weekday:local.weekday,
    _facility_key:sharedFacilityKey(home,home.home_court),
    _duration_minutes:durationMinutes(home)
  };

  if(typeof assertHomeRule==='function'){
    assertHomeRule(fixture);
  }

  return fixture;
}

function externalFixtures(code){
  return (allFixtures||[])
    .filter(f=>f.competition_code!==code)
    .map(f=>{
      const home=teams.find(t=>String(t.id)===String(f.home_team_id));
      const away=teams.find(t=>String(t.id)===String(f.away_team_id));

      if(!home||!f.scheduled_at) return null;

      return {
        ...f,
        _home_name:home.name,
        _away_name:away?.name||f.away_placeholder||'Ospite',
        _facility_key:sharedFacilityKey(home,f.venue||home.home_court),
        _duration_minutes:durationMinutes(home)
      };
    })
    .filter(Boolean);
}

function conflictsAny(f,others){
  return others.some(o=>realFacilityConflict(f,o));
}

/* Tutti gli accoppiamenti possibili della giornata */
function generateMatchings(nodes,usedPairs){
  const out=[];

  function rec(remaining,pairs){
    if(!remaining.length){
      out.push(pairs.slice());
      return;
    }

    const a=remaining[0];

    for(let i=1;i<remaining.length;i++){
      const b=remaining[i];

      if(a.__bye||b.__bye){
        const next=remaining.filter((_,idx)=>idx!==0&&idx!==i);
        rec(next,[...pairs,[a,b]]);
        continue;
      }

      const key=pairKeyIds(a.id,b.id);
      if(usedPairs.has(key)) continue;

      const next=remaining.filter((_,idx)=>idx!==0&&idx!==i);
      rec(next,[...pairs,[a,b]]);
    }
  }

  rec(nodes,[]);
  return out;
}

/* Tutte le orientazioni CASA/TRASFERTA valide della giornata */
function orientationOptions(matching,group,roundNo,anchor,code){
  const realPairs=matching.filter(([a,b])=>!a.__bye&&!b.__bye);
  const out=[];

  for(let mask=0;mask<(1<<realPairs.length);mask++){
    const pairs=realPairs.map(([a,b],i)=>
      (mask&(1<<i))?[b,a]:[a,b]
    );

    const fixtures=pairs.map(([home,away])=>
      makeFixture(group,roundNo,home,away,anchor,code)
    );

    /* Se una gara cade su data esclusa, questa orientazione
       NON è valida in questo weekend. */
    if(roundTouchesExcludedDate(fixtures,code)){
      continue;
    }

    let valid=true;

    for(let i=0;i<fixtures.length;i++){
      if(conflictsAny(
        fixtures[i],
        fixtures.filter((_,j)=>j!==i)
      )){
        valid=false;
        break;
      }
    }

    if(valid){
      out.push({pairs,fixtures});
    }
  }

  return out;
}

function mirroredFixtures(option,group,roundNo,anchor,code){
  return option.pairs.map(([home,away])=>
    makeFixture(group,roundNo,away,home,anchor,code)
  );
}

function compatibleWithExternal(fixtures,external){
  return !fixtures.some(f=>conflictsAny(f,external));
}

/* Cerca opzioni valide per una giornata.
   Se il weekend non permette NESSUNA opzione perché tocca sospensioni
   o crea conflitti, sposta TUTTA LA GIORNATA al weekend successivo.
*/
function findRoundCandidates({
  nodes,
  usedPairs,
  group,
  roundNo,
  baseAnchor,
  intervalWeeks,
  code,
  isDouble,
  totalRounds,
  external,
  minReturnAnchor
}){
  const MAX_WEEK_SHIFTS=60;

  for(let shift=0;shift<MAX_WEEK_SHIFTS;shift++){
    const anchor=addDays(baseAnchor,shift*7);

    let matchings=generateMatchings(nodes,usedPairs);

    /* Derby / squadre stesso impianto prima */
    matchings.sort((a,b)=>{
      function score(m){
        let s=0;
        for(const [x,y] of m){
          if(x.__bye||y.__bye) continue;
          if(sharedFacilityKey(x,x.home_court)===sharedFacilityKey(y,y.home_court)){
            s+=10;
          }
        }
        return s;
      }
      return score(b)-score(a);
    });

    const candidates=[];

    for(const matching of matchings){
      const options=orientationOptions(
        matching,group,roundNo,anchor,code
      );

      for(const option of options){
        if(!compatibleWithExternal(option.fixtures,external)){
          continue;
        }

        candidates.push({
          matching,
          option,
          anchor
        });
      }
    }

    if(candidates.length){
      return candidates;
    }
  }

  return [];
}

/* GLOBAL SORT DELL'ANDATA.
   Gli anchor delle giornate sono dinamici:
   la successiva parte dall'ultima giornata realmente collocata
   + intervalWeeks.
*/
function solveFirstLeg({
  group,
  groupTeams,
  start,
  intervalWeeks,
  code,
  external
}){
  const nodes=[...groupTeams];

  if(nodes.length%2){
    nodes.push({
      id:`BYE-${group.id}`,
      name:'RIPOSO',
      __bye:true
    });
  }

  const totalRounds=nodes.length-1;
  const usedPairs=new Set();
  const chosen=[];

  function rec(roundIndex,nextBaseAnchor){
    if(roundIndex===totalRounds){
      return true;
    }

    const roundNo=roundIndex+1;

    const candidates=findRoundCandidates({
      nodes,
      usedPairs,
      group,
      roundNo,
      baseAnchor:nextBaseAnchor,
      intervalWeeks,
      code,
      external
    });

    for(const candidate of candidates){
      const added=[];

      for(const [a,b] of candidate.matching){
        if(a.__bye||b.__bye) continue;

        const key=pairKeyIds(a.id,b.id);
        usedPairs.add(key);
        added.push(key);
      }

      chosen.push({
        roundNo,
        pairs:candidate.option.pairs,
        firstFixtures:candidate.option.fixtures,
        firstAnchor:candidate.anchor
      });

      const next=addDays(
        candidate.anchor,
        intervalWeeks*7
      );

      if(rec(roundIndex+1,next)){
        return true;
      }

      chosen.pop();
      added.forEach(k=>usedPairs.delete(k));
    }

    return false;
  }

  if(!rec(0,start)){
    throw new Error(
      `Non riesco a costruire l'andata del girone ${group.name||''} `+
      `rispettando sospensioni e impianti condivisi.`
    );
  }

  return {
    chosen,
    totalRounds
  };
}

/* Costruisce il ritorno speculare.
   Anche qui, se una giornata speculare cade su una sospensione,
   sposta L'INTERA GIORNATA al weekend successivo.
*/
function buildReturnLeg({
  group,
  firstLeg,
  startAnchor,
  intervalWeeks,
  code,
  external
}){
  const returns=[];
  let nextBase=new Date(startAnchor);

  for(let i=0;i<firstLeg.chosen.length;i++){
    const first=firstLeg.chosen[i];
    const returnRoundNo=first.roundNo+firstLeg.totalRounds;

    let placed=false;

    for(let shift=0;shift<60;shift++){
      const anchor=addDays(nextBase,shift*7);

      const fixtures=first.pairs.map(([home,away])=>
        makeFixture(
          group,
          returnRoundNo,
          away,
          home,
          anchor,
          code
        )
      );

      if(roundTouchesExcludedDate(fixtures,code)){
        continue;
      }

      let internalConflict=false;

      for(let x=0;x<fixtures.length;x++){
        if(
          conflictsAny(
            fixtures[x],
            fixtures.filter((_,j)=>j!==x)
          )
        ){
          internalConflict=true;
          break;
        }
      }

      if(internalConflict){
        continue;
      }

      if(!compatibleWithExternal(fixtures,external)){
        continue;
      }

      returns.push({
        roundNo:returnRoundNo,
        fixtures,
        anchor
      });

      nextBase=addDays(anchor,intervalWeeks*7);
      placed=true;
      break;
    }

    if(!placed){
      throw new Error(
        `Non riesco a collocare la giornata di ritorno G${returnRoundNo} `+
        `rispettando le sospensioni configurate.`
      );
    }
  }

  return returns;
}

window.buildCalendarPayload=async function(){
  if(!$id('startDate')?.value){
    throw new Error('Inserisci la data di partenza.');
  }

  await fetchData();

  if(!groups.length){
    throw new Error('Prima devi creare i gironi.');
  }

  if(!validateTeams(false)){
    throw new Error(
      'Completa prima giorno, ora e campo delle squadre.'
    );
  }

  const code=$id('competition').value;
  const isDouble=$id('formula').value==='double';
  const intervalWeeks=Number($id('interval').value||1);
  const start=fromDateKey($id('startDate').value);
  const external=externalFixtures(code);
  const payload=[];

  for(const group of groups){
    const groupTeams=members
      .filter(m=>String(m.group_id)===String(group.id))
      .map(m=>teams.find(
        t=>String(t.id)===String(m.team_id)
      ))
      .filter(Boolean);

    if(groupTeams.length<2) continue;

    const firstLeg=solveFirstLeg({
      group,
      groupTeams,
      start,
      intervalWeeks,
      code,
      external
    });

    firstLeg.chosen.forEach(r=>
      payload.push(...r.firstFixtures)
    );

    if(isDouble){
      const lastFirstAnchor=
        firstLeg.chosen[firstLeg.chosen.length-1].firstAnchor;

      const returnStart=addDays(
        lastFirstAnchor,
        intervalWeeks*7
      );

      const returns=buildReturnLeg({
        group,
        firstLeg,
        startAnchor:returnStart,
        intervalWeeks,
        code,
        external
      });

      returns.forEach(r=>
        payload.push(...r.fixtures)
      );
    }
  }

  /* SICUREZZA FINALE:
     nessuna gara può essere su una data esclusa.
  */
  for(const f of payload){
    if(fixtureFallsOnExcludedDate(f,code)){
      throw new Error(
        `ERRORE INTERNO: ${f._home_name} – ${f._away_name} `+
        `è stata collocata su una data esclusa (${f._local_date}).`
      );
    }
  }

  /* Controllo finale reale impianti */
  for(let i=0;i<payload.length;i++){
    for(let j=i+1;j<payload.length;j++){
      if(realFacilityConflict(payload[i],payload[j])){
        throw new Error(
          `Conflitto reale residuo: `+
          `${payload[i]._home_name} – ${payload[i]._away_name} e `+
          `${payload[j]._home_name} – ${payload[j]._away_name}.`
        );
      }
    }

    if(conflictsAny(payload[i],external)){
      throw new Error(
        `Conflitto reale con un'altra competizione: `+
        `${payload[i]._home_name} – ${payload[i]._away_name}.`
      );
    }
  }

  payload.sort((a,b)=>
    (a.round_number-b.round_number) ||
    (new Date(a.scheduled_at)-new Date(b.scheduled_at))
  );

  payload._calendarDiagnosis={
    totalMatches:payload.length,
    conflictsDetected:0,
    conflictsSolved:0,
    conflictsUnresolved:0,
    progression:'OK',
    rule:
      'GLOBAL SORT + sospensioni originali: '+
      'se una giornata tocca una data esclusa, viene spostata interamente.'
  };

  return payload;
};

/* Nessuna vecchia riparazione automatica */
window.autoResolveConflicts=function(){
  return {
    resolved:[],
    changed:[],
    unresolved:[],
    remainingFacilityConflicts:[],
    remainingTeamConflicts:[],
    existing:[]
  };
};

window.autoFixAllCalendarConflicts=window.autoResolveConflicts;
window.collectCalendarConflicts=function(){return[]};
window.createSuggestionAttempts=function(){return[]};

try{
  if(typeof closeConflictAssistant==='function'){
    closeConflictAssistant();
  }
}catch(_){}

[...document.querySelectorAll('button')].forEach(btn=>{
  if(/Risolvi automaticamente anomalie/i.test(
    btn.textContent||''
  )){
    btn.style.display='none';
  }
});

[...document.querySelectorAll('.notice')].forEach(box=>{
  if(/regola calendario|inversione casa\/trasferta|accavallamenti/i.test(
    box.textContent||''
  )){
    box.innerHTML=
      '<b>Regola calendario:</b> GLOBAL SORT con derby e impianti condivisi. '+
      'Le <b>date escluse già configurate</b> vengono rispettate secondo la loro applicazione: '+
      '<b>Tutte le competizioni</b> oppure la singola competizione selezionata. '+
      'Se una partita della giornata cadrebbe su una data esclusa, '+
      '<b>viene rinviata l’intera giornata</b> al blocco utile successivo. '+
      'Nessuna partita viene spostata da sola.';
  }
});

console.info(
  '[V9 calendario] Motore 10.7 GLOBAL SORT + SOSPENSIONI ORIGINALI attivo'
);

})();