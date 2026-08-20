/* calendar-v9-clean.js - V9 SIMPLE 10.5 GLOBAL SORT + INTERRUZIONI
 *
 * BASE IDENTICA ALLA 10.4 GLOBAL SORT.
 * UNICA AGGIUNTA:
 * - legge le interruzioni/festività già presenti in calendar_blackouts;
 * - se una settimana contiene una data esclusa valida per la competizione,
 *   salta l'intera settimana e colloca la giornata nella prima settimana utile successiva;
 * - nessun'altra logica del sorteggio viene modificata.
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
  if(a?.id && b?.id && String(a.id)===String(b.id)) return true;
  const ak=pairKeyIds(a?.home_team_id,a?.away_team_id);
  const bk=pairKeyIds(b?.home_team_id,b?.away_team_id);
  return ak===bk;
}

function realFacilityConflict(a,b){
  if(!a||!b) return false;
  if(sameLogicalMatch(a,b)) return false;
  if(!a._facility_key||!b._facility_key) return false;
  return a._facility_key===b._facility_key && overlap(a,b);
}

/* =========================
   INTERRUZIONI / FESTIVITÀ
   ========================= */

/* True se la data è esclusa per la competizione corrente */
function isBlackoutDate(dateKey,competitionCode){
  return (blackouts||[]).some(b=>{
    const code=String(b.competition_code||'ALL').toUpperCase();
    return String(b.blackout_date||'')===dateKey &&
      (code==='ALL' || code===String(competitionCode).toUpperCase());
  });
}

/* Restituisce lunedì della settimana della data */
function mondayOfWeek(d){
  const x=new Date(d);
  const day=(x.getDay()+6)%7;
  x.setDate(x.getDate()-day);
  x.setHours(12,0,0,0);
  return x;
}

/* Se QUALSIASI blackout della competizione cade nella settimana,
   la settimana viene considerata interrotta e non ospita una giornata.
*/
function weekIsBlocked(anchor,competitionCode){
  const monday=mondayOfWeek(anchor);
  for(let i=0;i<7;i++){
    const d=addDays(monday,i);
    if(isBlackoutDate(dateKeyLocal(d),competitionCode)){
      return true;
    }
  }
  return false;
}

/* Calcola la settimana effettiva della giornata N:
   avanza di intervalWeeks, ma salta tutte le settimane bloccate.
*/
function buildRoundAnchors(start,totalRounds,intervalWeeks,competitionCode){
  const anchors=[];
  let cursor=new Date(start);

  while(anchors.length<totalRounds){
    while(weekIsBlocked(cursor,competitionCode)){
      cursor=addDays(cursor,7);
    }

    anchors.push(new Date(cursor));

    cursor=addDays(cursor,intervalWeeks*7);
  }

  return anchors;
}

/* Per il ritorno continuiamo DOPO l'ultima giornata di andata,
   saltando ancora le settimane interrotte.
*/
function buildReturnAnchors(afterDate,totalRounds,intervalWeeks,competitionCode){
  const anchors=[];
  let cursor=addDays(afterDate,intervalWeeks*7);

  while(anchors.length<totalRounds){
    while(weekIsBlocked(cursor,competitionCode)){
      cursor=addDays(cursor,7);
    }

    anchors.push(new Date(cursor));
    cursor=addDays(cursor,intervalWeeks*7);
  }

  return anchors;
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

  const f={
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

  if(typeof assertHomeRule==='function') assertHomeRule(f);

  return f;
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

      if(a.__bye || b.__bye){
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

function orientationOptions(matching,group,roundNo,anchor,code){
  const realPairs=matching.filter(([a,b])=>!a.__bye&&!b.__bye);
  const out=[];

  for(let mask=0;mask<(1<<realPairs.length);mask++){
    const pairs=realPairs.map(([a,b],i)=>
      (mask&(1<<i)) ? [b,a] : [a,b]
    );

    const fixtures=pairs.map(([home,away])=>
      makeFixture(group,roundNo,home,away,anchor,code)
    );

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
    if(conflictsAny(f,external)) return false;
  }
  return true;
}

function solveGroup({
  group,
  groupTeams,
  firstAnchors,
  returnAnchors,
  code,
  isDouble,
  external
}){
  const nodes=[...groupTeams];

  if(nodes.length%2){
    nodes.push({id:`BYE-${group.id}`,name:'RIPOSO',__bye:true});
  }

  const totalRounds=nodes.length-1;
  const chosen=[];
  const usedPairs=new Set();

  function matchingScore(matching){
    let score=0;

    for(const [a,b] of matching){
      if(a.__bye||b.__bye) continue;

      const ka=sharedFacilityKey(a,a.home_court);
      const kb=sharedFacilityKey(b,b.home_court);

      if(ka===kb) score+=10;
    }

    return score;
  }

  function rec(roundIndex){
    if(roundIndex===totalRounds){
      return true;
    }

    const roundNo=roundIndex+1;
    const firstAnchor=firstAnchors[roundIndex];
    const returnAnchor=isDouble ? returnAnchors[roundIndex] : null;

    let matchings=generateMatchings(nodes,usedPairs);
    matchings.sort((a,b)=>matchingScore(b)-matchingScore(a));

    for(const matching of matchings){
      let options=orientationOptions(
        matching,
        group,
        roundNo,
        firstAnchor,
        code
      );

      for(const option of options){
        if(!compatibleWithExternal(option.fixtures,external)){
          continue;
        }

        let returnFixtures=[];

        if(isDouble){
          returnFixtures=mirroredFixtures(
            option,
            group,
            roundNo+totalRounds,
            returnAnchor,
            code
          );

          let returnOk=true;

          for(let i=0;i<returnFixtures.length;i++){
            if(
              conflictsAny(
                returnFixtures[i],
                returnFixtures.filter((_,j)=>j!==i)
              ) ||
              conflictsAny(returnFixtures[i],external)
            ){
              returnOk=false;
              break;
            }
          }

          if(!returnOk) continue;
        }

        const added=[];

        for(const [a,b] of matching){
          if(a.__bye||b.__bye) continue;

          const key=pairKeyIds(a.id,b.id);
          usedPairs.add(key);
          added.push(key);
        }

        chosen.push({
          roundNo,
          firstFixtures:option.fixtures,
          returnFixtures
        });

        if(rec(roundIndex+1)){
          return true;
        }

        chosen.pop();

        for(const key of added){
          usedPairs.delete(key);
        }
      }
    }

    return false;
  }

  if(!rec(0)){
    throw new Error(
      `Non riesco a costruire un calendario completo per il girone ${group.name||''} `+
      `rispettando impianti condivisi e interruzioni. Nessuna partita è stata spostata singolarmente.`
    );
  }

  return chosen;
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
    throw new Error('Completa prima giorno, ora e campo delle squadre.');
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
      .map(m=>teams.find(t=>String(t.id)===String(m.team_id)))
      .filter(Boolean);

    if(groupTeams.length<2) continue;

    const nodeCount=groupTeams.length%2 ? groupTeams.length+1 : groupTeams.length;
    const totalRounds=nodeCount-1;

    /* costruzione delle settimane utili, saltando festività/interruzioni */
    const firstAnchors=buildRoundAnchors(
      start,
      totalRounds,
      intervalWeeks,
      code
    );

    const returnAnchors=isDouble
      ? buildReturnAnchors(
          firstAnchors[firstAnchors.length-1],
          totalRounds,
          intervalWeeks,
          code
        )
      : [];

    const solved=solveGroup({
      group,
      groupTeams,
      firstAnchors,
      returnAnchors,
      code,
      isDouble,
      external
    });

    for(const round of solved){
      payload.push(...round.firstFixtures);
    }

    if(isDouble){
      for(const round of solved){
        payload.push(...round.returnFixtures);
      }
    }
  }

  for(let i=0;i<payload.length;i++){
    for(let j=i+1;j<payload.length;j++){
      if(realFacilityConflict(payload[i],payload[j])){
        throw new Error(
          `Conflitto reale residuo: ${payload[i]._home_name} – ${payload[i]._away_name} `+
          `e ${payload[j]._home_name} – ${payload[j]._away_name} `+
          `occupano contemporaneamente lo stesso impianto.`
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
    rule:'GLOBAL SORT + interruzioni: accoppiamenti e casa/trasferta costruiti insieme, settimane festive saltate, ritorno speculare.'
  };

  return payload;
};

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
  if(/Risolvi automaticamente anomalie/i.test(btn.textContent||'')){
    btn.style.display='none';
  }
});

[...document.querySelectorAll('.notice')].forEach(box=>{
  if(/regola calendario|inversione casa\/trasferta|accavallamenti/i.test(box.textContent||'')){
    box.innerHTML=
      '<b>Regola calendario:</b> il sorteggio costruisce insieme <b>accoppiamenti e CASA ↔ TRASFERTA</b>. '+
      'Le squadre che condividono un campo vengono alternate come negli stadi condivisi nel calcio. '+
      'Le <b>interruzioni/festività già configurate vengono rispettate</b>: la settimana viene saltata e il campionato riprende dalla prima settimana utile. '+
      'Il ritorno è speculare e nessuna singola partita viene spostata arbitrariamente.';
  }
});

console.info('[V9 calendario] Motore 10.5 GLOBAL SORT + INTERRUZIONI attivo');

})();