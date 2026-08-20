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

/* 10.11 - VINCOLO STRUTTURALE "STADIO CONDIVISO"
   Due squadre appartengono allo stesso blocco se hanno:
   - stesso impianto/campo di casa;
   - stesso giorno casalingo;
   - stesso orario casalingo.

   In uno stesso turno può essercene UNA SOLA in casa.
   Se giocano tra loro è derby: una sola gara, quindi sempre valido.
*/
function sharedHomeSlotKey(team){
  if(!team) return '';

  const court=norm(team.home_court||'');
  const day=String(dayIndex(team.home_match_day));
  const time=String(normalizeTime(team.home_match_time)||'');

  if(!court || day==='undefined' || !time) return '';

  return `${court}|${day}|${time}`;
}

function sameSharedHomeSlotTeams(teamA,teamB){
  const a=sharedHomeSlotKey(teamA);
  const b=sharedHomeSlotKey(teamB);
  return !!a && a===b;
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

  /* VINCOLO PRINCIPALE 10.11:
     stesso impianto + stesso giorno casalingo + stesso orario casalingo
     = stesso "stadio condiviso".
     Due gare distinte non possono avere entrambe una squadra di quel blocco in casa
     nello stesso turno temporale.
  */
  if(
    a._shared_home_slot_key &&
    b._shared_home_slot_key &&
    a._shared_home_slot_key===b._shared_home_slot_key &&
    overlap(a,b)
  ){
    return true;
  }

  /* controllo classico di sicurezza sull'occupazione impianto */
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
    _round_anchor:dateKeyLocal(anchor),
    _facility_key:sharedFacilityKey(home,home.home_court),
    _shared_home_slot_key:sharedHomeSlotKey(home),
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
        _shared_home_slot_key:sharedHomeSlotKey(home),
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

    /* 10.11 - BLOCCO PREVENTIVO:
       se due gare distinte hanno squadre di casa appartenenti allo stesso
       blocco "impianto + giorno + ora", l'orientazione viene scartata SUBITO.
       Il GLOBAL SORT deve quindi provarne un'altra prima di accettare la giornata.
    */
    let sharedSlotViolation=false;

    for(let x=0;x<fixtures.length;x++){
      for(let y=x+1;y<fixtures.length;y++){
        if(
          fixtures[x]._shared_home_slot_key &&
          fixtures[x]._shared_home_slot_key===fixtures[y]._shared_home_slot_key
        ){
          sharedSlotViolation=true;
          break;
        }
      }
      if(sharedSlotViolation) break;
    }

    if(sharedSlotViolation){
      continue;
    }

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
  for(const f of fixtures){
    for(const e of (external||[])){
      if(sameLogicalMatch(f,e)) continue;

      /* stessa "casa condivisa" nello stesso intervallo:
         orientazione non accettabile */
      if(
        f._shared_home_slot_key &&
        e._shared_home_slot_key &&
        f._shared_home_slot_key===e._shared_home_slot_key &&
        overlap(f,e)
      ){
        return false;
      }

      if(realFacilityConflict(f,e)){
        return false;
      }
    }
  }

  return true;
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

    /* 10.10:
       Il girone corrente deve vedere ANCHE le partite già costruite
       degli altri gironi della stessa competizione.
       Questo evita che due gironi indipendenti assegnino due squadre
       dello stesso impianto contemporaneamente in casa.
    */
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
        /* Anche il ritorno deve rispettare gli altri gironi già costruiti */
        external:[
          ...external,
          ...payload.map(f=>({...f}))
        ]
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
        window.__v9LastConflict={
          payload:payload.map(f=>({...f})),
          fixture1:{...payload[i]},
          fixture2:{...payload[j]},
          index1:i,
          index2:j,
          competition_code:code,
          external:external.map(f=>({...f}))
        };

        setTimeout(()=>{
          try{ openSimpleConflictResolver(); }catch(_){}
        },0);

        const err=new Error('CONFLICT_ASSISTANT_OPENED');
        err.isConflictAssistant=true;
        throw err;
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
      '<b>Regola calendario:</b> GLOBAL SORT con alternanza obbligatoria delle squadre che condividono impianto, giorno e orario. '+
      'Le <b>date escluse già configurate</b> vengono rispettate secondo la loro applicazione: '+
      '<b>Tutte le competizioni</b> oppure la singola competizione selezionata. '+
      'Se una partita della giornata cadrebbe su una data esclusa, '+
      '<b>viene rinviata l’intera giornata</b> al blocco utile successivo. '+
      'Nessuna partita viene spostata da sola.';
  }
});



/* =========================================================
   ASSISTENTE RISOLVI CONFLITTO - 10.9
   RISOLUZIONE A CATENA NELLA STESSA SETTIMANA

   VINCOLI INVIOLABILI:
   - MAI spostare una partita ad altra settimana;
   - MAI inventare giorno, ora o campo;
   - la squadra ospite è passiva;
   - derby valido;
   - ritorno speculare sempre aggiornato;
   - sospensioni/date escluse rispettate;
   - nessun nuovo conflitto con altre competizioni;
   - mostra SOLO soluzioni già verificate integralmente.
   ========================================================= */

function v9ClonePayload(payload){
  return (payload||[]).map(f=>({...f}));
}

function v9FindGroup(id){
  return groups.find(g=>String(g.id)===String(id));
}

function v9FindTeam(id){
  return teams.find(t=>String(t.id)===String(id));
}

function v9FixtureSignature(f){
  return [
    String(f.group_id||''),
    String(f.round_number||''),
    String(f.home_team_id||''),
    String(f.away_team_id||'')
  ].join('|');
}

function v9FindFixtureIndexBySignature(payload,fixture){
  const sig=v9FixtureSignature(fixture);
  return payload.findIndex(f=>v9FixtureSignature(f)===sig);
}

function v9MondayKey(iso){
  const d=new Date(iso);
  const delta=(d.getDay()+6)%7;
  d.setDate(d.getDate()-delta);
  return dateKeyLocal(d);
}

function v9SameWeek(a,b){
  return !!a?.scheduled_at && !!b?.scheduled_at &&
    v9MondayKey(a.scheduled_at)===v9MondayKey(b.scheduled_at);
}

/* restituisce il ritorno speculare di una gara, se presente */
function v9FindMirrorIndex(payload,fixture,indexToIgnore=-1){
  return payload.findIndex((f,j)=>
    j!==indexToIgnore &&
    String(f.group_id)===String(fixture.group_id) &&
    String(f.home_team_id)===String(fixture.away_team_id) &&
    String(f.away_team_id)===String(fixture.home_team_id)
  );
}

/* Inverte una gara SENZA cambiare settimana.
   Il nuovo giorno/ora/campo derivano esclusivamente dalla nuova squadra di casa.
   Anche il ritorno viene invertito automaticamente.
*/
function v9SwapFixtureAndMirror(payload,fixture){
  const idx=v9FindFixtureIndexBySignature(payload,fixture);
  if(idx<0) return false;

  const current=payload[idx];
  const group=v9FindGroup(current.group_id);
  const oldHome=v9FindTeam(current.home_team_id);
  const oldAway=v9FindTeam(current.away_team_id);

  if(!group||!oldHome||!oldAway||!current._round_anchor){
    return false;
  }

  const originalWeek=v9MondayKey(current.scheduled_at);
  const mirrorIndex=v9FindMirrorIndex(payload,current,idx);

  const swapped=makeFixture(
    group,
    current.round_number,
    oldAway,
    oldHome,
    fromDateKey(current._round_anchor),
    current.competition_code
  );

  /* VINCOLO: non deve uscire dalla settimana originale */
  if(v9MondayKey(swapped.scheduled_at)!==originalWeek){
    return false;
  }

  payload[idx]=swapped;
  payload[idx]._resolution='Inversione casa/trasferta';

  if(mirrorIndex>=0){
    const mirror=payload[mirrorIndex];
    const mirrorGroup=v9FindGroup(mirror.group_id);
    const mirrorHome=v9FindTeam(mirror.home_team_id);
    const mirrorAway=v9FindTeam(mirror.away_team_id);

    if(!mirrorGroup||!mirrorHome||!mirrorAway||!mirror._round_anchor){
      return false;
    }

    const mirrorWeek=v9MondayKey(mirror.scheduled_at);

    const swappedMirror=makeFixture(
      mirrorGroup,
      mirror.round_number,
      mirrorAway,
      mirrorHome,
      fromDateKey(mirror._round_anchor),
      mirror.competition_code
    );

    if(v9MondayKey(swappedMirror.scheduled_at)!==mirrorWeek){
      return false;
    }

    payload[mirrorIndex]=swappedMirror;
    payload[mirrorIndex]._resolution='Ritorno speculare aggiornato';
  }

  return true;
}

/* Elenca TUTTI i conflitti reali interni */
function v9InternalConflicts(payload){
  const out=[];

  for(let i=0;i<payload.length;i++){
    for(let j=i+1;j<payload.length;j++){
      if(realFacilityConflict(payload[i],payload[j])){
        out.push({
          i,j,
          a:payload[i],
          b:payload[j]
        });
      }
    }
  }

  return out;
}

function v9ValidateCandidate(payload,code,external){
  for(const f of payload){
    if(fixtureFallsOnExcludedDate(f,code)){
      return {
        ok:false,
        reason:`${f._home_name} – ${f._away_name} finirebbe su una data esclusa (${f._local_date}).`
      };
    }
  }

  const internal=v9InternalConflicts(payload);

  if(internal.length){
    return {
      ok:false,
      reason:`Rimarrebbero ${internal.length} conflitti interni.`,
      conflicts:internal
    };
  }

  for(const f of payload){
    if(conflictsAny(f,external||[])){
      return {
        ok:false,
        reason:`${f._home_name} – ${f._away_name} entrerebbe in conflitto con un'altra competizione.`
      };
    }
  }

  return {
    ok:true,
    reason:'Calendario verificato: nessun conflitto residuo.'
  };
}

/* Candidati alla catena:
   tutte le gare della STESSA SETTIMANA delle due gare in conflitto.
   Questo permette A->trasferta, che crea un problema su B,
   quindi B->trasferta, ecc. senza mai uscire dal turno.
*/
function v9ChainCandidateFixtures(ctx){
  const weeks=new Set([
    v9MondayKey(ctx.fixture1.scheduled_at),
    v9MondayKey(ctx.fixture2.scheduled_at)
  ]);

  const seen=new Set();
  const list=[];

  for(const f of ctx.payload){
    if(!weeks.has(v9MondayKey(f.scheduled_at))) continue;

    const sig=v9FixtureSignature(f);
    if(seen.has(sig)) continue;

    /* non includere nello stesso set il ritorno di questa gara:
       viene gestito automaticamente da v9SwapFixtureAndMirror */
    const reverseSig=[
      String(f.group_id||''),
      '',
      String(f.away_team_id||''),
      String(f.home_team_id||'')
    ].join('|');

    seen.add(sig);
    list.push({...f});
  }

  /* Metti davanti le due gare originariamente in conflitto */
  list.sort((a,b)=>{
    const aHit=sameLogicalMatch(a,ctx.fixture1)||sameLogicalMatch(a,ctx.fixture2);
    const bHit=sameLogicalMatch(b,ctx.fixture1)||sameLogicalMatch(b,ctx.fixture2);
    return Number(bHit)-Number(aHit);
  });

  return list;
}

function v9StateKey(swappedIndexes){
  return [...swappedIndexes].sort((a,b)=>a-b).join(',');
}

/* BFS:
   cerca le soluzioni con MENO inversioni possibili.
   Ogni stato è un insieme di gare invertite.
*/
function v9SearchChainSolutions(ctx,maxSolutions=6){
  const candidates=v9ChainCandidateFixtures(ctx);
  const external=ctx.external||[];

  /* Sicurezza prestazioni: in una giornata reale dovrebbero essere poche.
     Se fossero molte, lavoriamo sulle prime 16, privilegiando quelle
     che appartengono alla componente di conflitto. */
  const usable=candidates.slice(0,16);

  const queue=[[]];
  const visited=new Set(['']);
  const solutions=[];
  let explored=0;
  const MAX_STATES=12000;

  while(queue.length && explored<MAX_STATES && solutions.length<maxSolutions){
    const state=queue.shift();
    explored++;

    const candidate=v9ClonePayload(ctx.payload);
    let applied=true;

    for(const idx of state){
      if(!v9SwapFixtureAndMirror(candidate,usable[idx])){
        applied=false;
        break;
      }
    }

    if(!applied) continue;

    const check=v9ValidateCandidate(
      candidate,
      ctx.competition_code,
      external
    );

    if(check.ok && state.length>0){
      solutions.push({
        swappedIndexes:[...state],
        payload:candidate,
        reason:check.reason,
        title:
          state.length===1
            ? 'Risolvi con 1 inversione'
            : `Risolvi con ${state.length} inversioni`,
        description:state.map(idx=>{
          const f=usable[idx];
          return `${f._home_name} – ${f._away_name}`;
        }).join('  +  ')
      });

      /* BFS garantisce che le prime siano le più semplici */
      continue;
    }

    /* Espandi solo se ha ancora senso.
       Aggiunge un'altra inversione successiva all'ultima,
       evitando duplicati di stato. */
    const startAt=state.length ? state[state.length-1]+1 : 0;

    for(let i=startAt;i<usable.length;i++){
      const next=[...state,i];
      const key=v9StateKey(next);

      if(visited.has(key)) continue;
      visited.add(key);

      /* Limite ragionevole: oltre 6 inversioni la soluzione
         diventa poco comprensibile per l'utente. */
      if(next.length<=6){
        queue.push(next);
      }
    }
  }

  /* deduplica soluzioni equivalenti */
  const unique=[];
  const solutionKeys=new Set();

  for(const s of solutions){
    const key=s.payload.map(f=>
      `${f.group_id}|${f.round_number}|${f.home_team_id}|${f.away_team_id}`
    ).join('§');

    if(solutionKeys.has(key)) continue;
    solutionKeys.add(key);
    unique.push(s);
  }

  return {
    solutions:unique,
    candidates:usable,
    explored
  };
}

function closeSimpleConflictResolver(){
  document.getElementById('v9SimpleConflictResolver')?.remove();
}

function applySimpleConflictSolution(index){
  const ctx=window.__v9LastConflict;
  if(!ctx) return;

  const result=v9SearchChainSolutions(ctx);
  const selected=result.solutions[index];

  if(!selected) return;

  pendingCalendar=selected.payload.map(f=>({...f}));

  closeSimpleConflictResolver();

  if(typeof renderPendingCalendar==='function'){
    renderPendingCalendar();
  }else if(
    typeof groupedFixturesHtml==='function' &&
    typeof renderPreviewMatch==='function' &&
    document.getElementById('calendarPreview')
  ){
    document.getElementById('calendarPreview').innerHTML=
      groupedFixturesHtml(pendingCalendar,renderPreviewMatch);

    document.getElementById('calendarPreviewCard')?.classList.remove('hidden');
    document.getElementById('confirmCalendarBtn')?.classList.remove('hidden');
  }

  if(typeof msg==='function'){
    msg(
      `✅ Soluzione applicata in anteprima: ${selected.title}. `+
      `Inversioni: ${selected.description}. `+
      `Settimane, sospensioni, orari e campi restano conformi alle regole. `+
      `Controlla l'anteprima e poi conferma il salvataggio.`
    );
  }
}

function openSimpleConflictResolver(){
  closeSimpleConflictResolver();

  const ctx=window.__v9LastConflict;
  if(!ctx) return;

  const search=v9SearchChainSolutions(ctx,6);
  const solutions=search.solutions;

  const overlay=document.createElement('div');
  overlay.id='v9SimpleConflictResolver';
  overlay.className='conflict-overlay';

  const cards=solutions.length
    ? solutions.map((s,i)=>`
      <div class="solution-card ok">
        <h3>✅ ${esc(s.title)}</h3>
        <div>
          <b>Catena:</b> ${esc(s.description)}
        </div>
        <div class="reason">
          ${esc(s.reason)}
        </div>
        <div class="solution-actions">
          <button class="btn primary btn-mini"
            onclick="applySimpleConflictSolution(${i})">
            Applica questa soluzione
          </button>
        </div>
      </div>
    `).join('')
    : `
      <div class="solution-card no">
        <h3>❌ Nessuna catena valida trovata</h3>
        <div class="reason">
          Sono state provate combinazioni di inversioni CASA ↔ TRASFERTA
          sulle gare della stessa settimana, fino a 6 inversioni concatenate,
          senza spostare partite, cambiare orari/campi o violare sospensioni.
          Nessuna partita è stata modificata.
        </div>
      </div>
    `;

  overlay.innerHTML=`
    <div class="conflict-card">
      <div class="conflict-head">
        <div>
          <h2 style="margin:0 0 5px">Risolvi conflitto</h2>
          <div style="color:#627b97">
            Ricerca a catena nella stessa settimana + vincolo strutturale di alternanza casa/trasferta.
            ${search.explored} combinazioni analizzate.
          </div>
        </div>
        <button class="btn secondary"
          onclick="closeSimpleConflictResolver()">
          Chiudi
        </button>
      </div>

      <div class="conflict-match" style="margin-top:14px">
        ${esc(ctx.fixture1._home_name)} – ${esc(ctx.fixture1._away_name)}
        <br>
        <span style="font-weight:600">conflitto campo con</span>
        <br>
        ${esc(ctx.fixture2._home_name)} – ${esc(ctx.fixture2._away_name)}
      </div>

      <div class="notice" style="margin-top:12px">
        <b>Regole bloccate:</b>
        stessa settimana, nessun anticipo/posticipo,
        giorno/ora/campo solo della squadra di casa,
        ospite passivo, derby valido,
        ritorno speculare, sospensioni rispettate
        e nessun nuovo conflitto con altre competizioni.
      </div>

      <div class="conflict-grid">
        ${cards}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}

window.openSimpleConflictResolver=openSimpleConflictResolver;
window.closeSimpleConflictResolver=closeSimpleConflictResolver;
window.applySimpleConflictSolution=applySimpleConflictSolution;



/* =========================
   ELIMINA TUTTE - 10.7.2
   SOLO questa funzione.
   ========================= */
function installDeleteAllButton(){
  let btn=document.getElementById('deleteAllFixturesBtn');

  if(!btn){
    const buttons=[...document.querySelectorAll('button')];
    const previewBtn=buttons.find(b=>/anteprima calendario/i.test((b.textContent||'').trim()));
    const refreshBtn=buttons.find(b=>/aggiorna elenco/i.test((b.textContent||'').trim()));
    const anchor=refreshBtn||previewBtn;
    if(!anchor) return false;

    btn=document.createElement('button');
    btn.id='deleteAllFixturesBtn';
    btn.type='button';
    btn.className='btn danger';
    btn.textContent='🗑 Elimina tutte le partite';
    anchor.insertAdjacentElement('afterend',btn);
  }

  /* sostituisce eventuali listener vecchi */
  const clean=btn.cloneNode(true);
  btn.replaceWith(clean);
  btn=clean;

  btn.addEventListener('click',async function(ev){
    ev.preventDefault();
    ev.stopPropagation();

    const code=$id('competition')?.value;
    const label=$id('competition')?.selectedOptions?.[0]?.textContent?.trim()||code;
    if(!code) return;

    if(!confirm(`Eliminare TUTTE le partite di ${label}?`)) return;

    try{
      btn.disabled=true;
      btn.textContent='Eliminazione…';

      const client=(typeof sb!=='undefined'&&sb)||(typeof s!=='undefined'&&s);
      if(!client) throw new Error('Client database non disponibile.');

      /* Conta PRIMA */
      const beforeRes=await client
        .from('fixtures')
        .select('id',{count:'exact',head:true})
        .eq('competition_code',code);
      if(beforeRes.error) throw beforeRes.error;
      const before=beforeRes.count||0;

      /* Cancella SOLO la competizione selezionata */
      const delRes=await client
        .from('fixtures')
        .delete()
        .eq('competition_code',code);
      if(delRes.error) throw delRes.error;

      /* Verifica DIRETTAMENTE il DB */
      const verifyRes=await client
        .from('fixtures')
        .select('id',{count:'exact',head:true})
        .eq('competition_code',code);
      if(verifyRes.error) throw verifyRes.error;

      const remaining=verifyRes.count||0;
      if(remaining!==0){
        throw new Error(`Il database contiene ancora ${remaining} partite di ${label}.`);
      }

      /* Svuota anche ogni cache locale della competizione eliminata */
      if(typeof pendingCalendar!=='undefined') pendingCalendar=[];

      if(typeof allFixtures!=='undefined' && Array.isArray(allFixtures)){
        allFixtures=allFixtures.filter(f=>String(f.competition_code)!==String(code));
      }

      if(typeof fixtures!=='undefined' && Array.isArray(fixtures)){
        fixtures=fixtures.filter(f=>String(f.competition_code)!==String(code));
      }

      /* Ricarica la fonte dati reale */
      if(typeof fetchData==='function'){
        await fetchData();
      }

      /* Ricostruisce la lista, senza riusare HTML precedente */
      const likelyContainers=[
        'fixturesList','fixtureList','calendarList','matchesList',
        'savedFixtures','savedMatches','fixturesContainer'
      ];
      for(const id of likelyContainers){
        const el=document.getElementById(id);
        if(el) el.innerHTML='';
      }

      if(typeof renderFixtures==='function') renderFixtures();
      else if(typeof renderCalendar==='function') renderCalendar();
      else if(typeof renderMatches==='function') renderMatches();

      /* Se il progetto usa un renderer non intercettato,
         il reload garantisce comunque la sincronizzazione DB/UI. */
      const success=`✅ Eliminate ${before} partite di ${label}.`;

      try{
        if(typeof msg==='function') msg(success);
      }catch(_){}

      setTimeout(()=>{
        window.location.reload();
      },350);

    }catch(e){
      const text=`Errore eliminazione: ${e?.message||String(e)}`;
      try{
        if(typeof msg==='function') msg(text,true);
        else alert(text);
      }catch(_){
        alert(text);
      }

      btn.disabled=false;
      btn.textContent='🗑 Elimina tutte le partite';
    }
  });

  return true;
}

if(!installDeleteAllButton()){
  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    if(installDeleteAllButton()||tries>=40) clearInterval(timer);
  },250);
}

console.info(
  '[V9 calendario] Motore 10.11 GLOBAL SORT + SOSPENSIONI + DELETE ALL attivo'
);

})();