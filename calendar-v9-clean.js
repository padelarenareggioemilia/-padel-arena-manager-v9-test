/* calendar-v9-clean.js - V9 SIMPLE 10.3 DERBY / IMPIANTI CONDIVISI
 *
 * PRINCIPIO:
 * - ogni squadra gioca una volta per giornata (round-robin)
 * - giorno/ora/campo dipendono SOLO dalla squadra di casa
 * - la squadra ospite non impone disponibilità
 * - se due squadre condividono lo stesso impianto/giorno/ora,
 *   il motore coordina CASA/TRASFERTA come negli stadi condivisi nel calcio
 * - se le due squadre giocano tra loro, è un derby: UNA SOLA partita, nessun conflitto
 * - il ritorno è speculare
 * - nessuna partita viene spostata di settimana
 *
 * DIFFERENZA CHIAVE:
 * La scelta casa/trasferta non viene più fatta "una giornata isolata alla volta".
 * Il motore cerca una combinazione coerente sull'INTERO calendario di andata,
 * poi costruisce il ritorno speculare.
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
function pairKeyByIds(a,b){
  return [a,b].filter(Boolean).map(String).sort().join('|');
}
function pairKey(f){
  return pairKeyByIds(f.home_team_id,f.away_team_id);
}
function samePair(a,b){
  const x=pairKey(a),y=pairKey(b);
  return !!x&&x===y;
}
function sameFixture(a,b){
  return !!a.id&&!!b.id&&String(a.id)===String(b.id);
}
function durationMinutes(team){
  return Number(team?.match_slot_minutes||$id('defaultSlotMinutes')?.value||120);
}

/* Impianto condiviso.
   Se esiste facility_id usiamo quello.
   Altrimenti usiamo indirizzo/città; se mancano, fallback sul nome campo.
*/
function sharedFacilityKey(team,venue){
  if(team?.facility_id) return `id:${team.facility_id}`;

  const address=[
    team?.club_address,
    team?.club_city
  ].map(norm).filter(Boolean).join('|');

  if(address) return `addr:${address}`;

  return `court:${norm(venue||team?.home_court||team?.id||'')}`;
}

function overlap(a,b){
  if(!a.scheduled_at||!b.scheduled_at)return false;

  const as=new Date(a.scheduled_at).getTime();
  const bs=new Date(b.scheduled_at).getTime();

  const ae=as+(a._duration_minutes||120)*60000;
  const be=bs+(b._duration_minutes||120)*60000;

  return as<be&&bs<ae;
}

/* Un derby non è mai un conflitto: è una singola gara.
   Il conflitto reale è solo tra DUE GARE DISTINTE che occupano
   lo stesso impianto nello stesso intervallo.
*/
function realConflict(a,b){
  if(a===b||sameFixture(a,b)||samePair(a,b)) return false;
  if(!a._facility_key||!b._facility_key) return false;

  return a._facility_key===b._facility_key && overlap(a,b);
}

function homeOccurrence(anchor,team){
  const targetDay=dayIndex(team.home_match_day);
  const time=normalizeTime(team.home_match_time);

  if(targetDay===undefined || !time || !String(team.home_court||'').trim()){
    throw new Error(`Completa giorno, ora e campo di casa per ${team.name}.`);
  }

  const d=new Date(anchor);
  let guard=0;

  while(d.getDay()!==targetDay && guard++<7){
    d.setDate(d.getDate()+1);
  }

  const date=dateKeyLocal(d);

  return {
    scheduled_at:localDateTimeToISO(date,time),
    venue:team.home_court,
    time,
    date
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

  assertHomeRule(fixture);
  return fixture;
}

/* vecchie gare della competizione che stiamo rigenerando: IGNORATE
   altre competizioni: considerate solo come reali occupazioni dell'impianto
*/
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

function fixturesConflictWith(candidate,others){
  return others.some(o=>realConflict(candidate,o));
}

/* Tutte le possibili orientazioni di UNA giornata */
function roundOrientations(rawPairs,group,roundNumber,anchor,code){
  const options=[];

  for(let mask=0;mask<(1<<rawPairs.length);mask++){
    const pairs=rawPairs.map(([a,b],i)=>(mask&(1<<i))?[b,a]:[a,b]);

    const fixtures=pairs.map(([home,away])=>
      makeFixture(group,roundNumber,home,away,anchor,code)
    );

    let internalConflict=false;

    for(let i=0;i<fixtures.length;i++){
      if(fixturesConflictWith(
        fixtures[i],
        fixtures.filter((_,j)=>j!==i)
      )){
        internalConflict=true;
        break;
      }
    }

    if(!internalConflict){
      options.push({pairs,fixtures});
    }
  }

  return options;
}

/* Verifica anche il ritorno speculare di un'opzione */
function mirroredReturnFixtures(option,group,roundNumber,anchor,code){
  return option.pairs.map(([home,away])=>
    makeFixture(group,roundNumber,away,home,anchor,code)
  );
}

/* BACKTRACKING GLOBALE:
   sceglie una orientazione per ogni giornata considerando insieme
   tutte le giornate dell'andata e, se richiesto, il ritorno speculare.
*/
function solveGroupCalendar({
  group,
  rawRounds,
  start,
  intervalWeeks,
  code,
  isDouble,
  external
}){
  const n=rawRounds.length;
  const roundOptions=[];

  for(let i=0;i<n;i++){
    const firstAnchor=addDays(start,i*intervalWeeks*7);
    const returnAnchor=isDouble
      ? addDays(start,(i+n)*intervalWeeks*7)
      : null;

    const options=roundOrientations(
      rawRounds[i],
      group,
      i+1,
      firstAnchor,
      code
    );

    const valid=[];

    for(const option of options){
      let ok=true;

      /* conflitti con altre competizioni nell'andata */
      for(const f of option.fixtures){
        if(fixturesConflictWith(f,external)){
          ok=false;
          break;
        }
      }

      if(!ok) continue;

      let returnFixtures=[];

      if(isDouble){
        returnFixtures=mirroredReturnFixtures(
          option,
          group,
          i+1+n,
          returnAnchor,
          code
        );

        for(let x=0;x<returnFixtures.length;x++){
          const others=returnFixtures.filter((_,j)=>j!==x);

          if(
            fixturesConflictWith(returnFixtures[x],others) ||
            fixturesConflictWith(returnFixtures[x],external)
          ){
            ok=false;
            break;
          }
        }
      }

      if(ok){
        valid.push({
          pairs:option.pairs,
          firstFixtures:option.fixtures,
          returnFixtures
        });
      }
    }

    if(!valid.length){
      throw new Error(
        `Giornata ${i+1}: nessuna combinazione CASA/TRASFERTA è compatibile `+
        `con gli impianti condivisi, mantenendo fisso il turno.`
      );
    }

    roundOptions.push(valid);
  }

  const chosen=new Array(n);

  function backtrack(index,selectedFirst,selectedReturn){
    if(index===n) return true;

    for(const option of roundOptions[index]){
      let ok=true;

      /* Le giornate sono su settimane diverse, quindi di norma non
         si sovrappongono. Questo controllo resta come sicurezza. */
      for(const f of option.firstFixtures){
        if(fixturesConflictWith(f,selectedFirst)){
          ok=false;
          break;
        }
      }

      if(ok && isDouble){
        for(const f of option.returnFixtures){
          if(fixturesConflictWith(f,selectedReturn)){
            ok=false;
            break;
          }
        }
      }

      if(!ok) continue;

      chosen[index]=option;

      if(backtrack(
        index+1,
        [...selectedFirst,...option.firstFixtures],
        [...selectedReturn,...option.returnFixtures]
      )){
        return true;
      }

      chosen[index]=null;
    }

    return false;
  }

  if(!backtrack(0,[],[])){
    throw new Error(
      `Non esiste una combinazione globale CASA/TRASFERTA per il girone `+
      `senza sovrapporre due gare distinte sullo stesso impianto condiviso.`
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

    const rawRounds=roundRobin(groupTeams);
    const chosen=solveGroupCalendar({
      group,
      rawRounds,
      start,
      intervalWeeks,
      code,
      isDouble,
      external
    });

    for(const option of chosen){
      payload.push(...option.firstFixtures);
    }

    if(isDouble){
      for(const option of chosen){
        payload.push(...option.returnFixtures);
      }
    }
  }

  /* verifica globale finale tra più gironi */
  for(let i=0;i<payload.length;i++){
    for(let j=i+1;j<payload.length;j++){
      if(realConflict(payload[i],payload[j])){
        throw new Error(
          `Conflitto reale residuo: ${payload[i]._home_name} – ${payload[i]._away_name} `+
          `e ${payload[j]._home_name} – ${payload[j]._away_name} `+
          `occupano contemporaneamente lo stesso impianto condiviso.`
        );
      }
    }

    if(fixturesConflictWith(payload[i],external)){
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
    rule:'Gestione tipo derby/stadio condiviso: alternanza casa/trasferta, ritorno speculare, nessuno spostamento.'
  };

  return payload;
};

/* Disattiva definitivamente le vecchie riparazioni automatiche */
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

/* Nasconde eventuali vecchi pulsanti di riparazione */
[...document.querySelectorAll('button')].forEach(btn=>{
  if(/Risolvi automaticamente anomalie/i.test(btn.textContent||'')){
    btn.style.display='none';
  }
});

/* Spiegazione coerente con la nuova logica */
[...document.querySelectorAll('.notice')].forEach(box=>{
  if(/regola calendario|inversione casa\/trasferta|accavallamenti/i.test(box.textContent||'')){
    box.innerHTML=
      '<b>Regola calendario:</b> gli impianti condivisi vengono gestiti come gli stadi condivisi nel calcio. '+
      'Se due squadre usano lo stesso campo nello stesso giorno/orario, il sistema coordina automaticamente '+
      '<b>CASA ↔ TRASFERTA</b>. Se giocano tra loro è un derby: una sola gara, nessun conflitto. '+
      'Il ritorno è speculare e <b>nessuna partita viene spostata di settimana</b>.';
  }
});

console.info('[V9 calendario] Motore 10.3 DERBY / IMPIANTI CONDIVISI attivo');

})();