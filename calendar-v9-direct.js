/* V9 CALENDAR 10.13 DIRECT
   Calendario diretto, senza ricerca combinatoria globale.
   Regole preservate:
   - round robin classico
   - giorno/ora/campo della squadra di casa
   - ritorno speculare
   - date escluse: se una giornata le intercetta, si sposta l'intera giornata
   - impianti condivisi: si tenta solo l'orientamento casa/trasferta della giornata
   - nessuna partita viene spostata da sola
*/
(function(){
'use strict';

const $id=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,'0');
const norm=v=>String(v??'')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,' ')
  .replace(/\s+/g,' ').trim();

function fromKey(k){
  const [y,m,d]=String(k).split('-').map(Number);
  return new Date(y,m-1,d,12,0,0,0);
}
function addDays(d,n){
  const x=new Date(d);
  x.setDate(x.getDate()+n);
  return x;
}
function dateKey(d){
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function pairKey(a,b){
  return [String(a),String(b)].sort().join('|');
}
function duration(team){
  return Number(team?.match_slot_minutes||$id('defaultSlotMinutes')?.value||120);
}
function sharedHomeSlotKey(team){
  if(!team) return '';
  const court=norm(team.home_court||'');
  const day=String(dayIndex(team.home_match_day));
  const time=String(normalizeTime(team.home_match_time)||'');
  if(!court || day==='undefined' || !time) return '';
  return `${court}|${day}|${time}`;
}
function facilityKeyDirect(team,venue){
  if(team?.facility_id) return `id:${team.facility_id}`;
  try{
    if(typeof facilityKey==='function'){
      const k=facilityKey(team,venue||team?.home_court);
      if(k) return `v9:${String(k)}`;
    }
  }catch(_){}
  const addr=[team?.club_address,team?.club_city,team?.club_province]
    .map(norm).filter(Boolean).join('|');
  return addr || `court:${norm(venue||team?.home_court||team?.id||'')}`;
}
function overlap(a,b){
  if(!a?.scheduled_at||!b?.scheduled_at) return false;
  const a0=new Date(a.scheduled_at).getTime();
  const b0=new Date(b.scheduled_at).getTime();
  const a1=a0+(a._duration_minutes||120)*60000;
  const b1=b0+(b._duration_minutes||120)*60000;
  return a0<b1 && b0<a1;
}
function sameLogical(a,b){
  if(a?.id&&b?.id&&String(a.id)===String(b.id)) return true;
  return pairKey(a?.home_team_id,a?.away_team_id)===pairKey(b?.home_team_id,b?.away_team_id);
}
function realConflict(a,b){
  if(!a||!b||sameLogical(a,b)||!overlap(a,b)) return false;
  if(a._shared_home_slot_key && a._shared_home_slot_key===b._shared_home_slot_key) return true;
  return !!a._facility_key && a._facility_key===b._facility_key;
}
function blackoutApplies(row,code){
  const scope=String(row?.competition_code||'ALL').toUpperCase();
  const cc=String(code||'').toUpperCase();
  return scope==='ALL'||scope===cc;
}
function fixtureOnBlackout(f,code){
  const dk=dateKey(new Date(f.scheduled_at));
  return (blackouts||[]).some(b=>blackoutApplies(b,code)&&String(b.blackout_date||'').slice(0,10)===dk);
}
function homeOccurrence(anchor,team){
  const target=dayIndex(team.home_match_day);
  const hhmm=normalizeTime(team.home_match_time);
  if(target===undefined) throw new Error(`Manca il giorno di casa per ${team.name}.`);
  if(!hhmm) throw new Error(`Manca l'orario di casa per ${team.name}.`);
  if(!String(team.home_court||'').trim()) throw new Error(`Manca il campo di casa per ${team.name}.`);
  const d=new Date(anchor);
  let guard=0;
  while(d.getDay()!==target && guard++<7) d.setDate(d.getDate()+1);
  const dk=dateKey(d);
  return {
    scheduled_at:localDateTimeToISO(dk,hhmm),
    venue:team.home_court,
    time:hhmm
  };
}
function makeFixture(group,roundNo,home,away,anchor,code){
  const occ=homeOccurrence(anchor,home);
  const local=localPartsFromISO(occ.scheduled_at);
  const f={
    competition_code:code,
    phase:'Girone',
    group_id:group.id,
    round_number:roundNo,
    home_team_id:home.id,
    away_team_id:away.id,
    scheduled_at:occ.scheduled_at,
    venue:occ.venue,
    _home_name:home.name,
    _away_name:away.name,
    _configured_day:home.home_match_day,
    _configured_time:occ.time,
    _local_date:local.date,
    _local_time:local.time,
    _local_weekday:local.weekday,
    _round_anchor:dateKey(anchor),
    _facility_key:facilityKeyDirect(home,occ.venue),
    _shared_home_slot_key:sharedHomeSlotKey(home),
    _duration_minutes:duration(home)
  };
  if(typeof assertHomeRule==='function') assertHomeRule(f);
  return f;
}
function externalFixtures(code){
  return (allFixtures||[])
    .filter(f=>String(f.competition_code)!==String(code))
    .map(f=>{
      const home=teams.find(t=>String(t.id)===String(f.home_team_id));
      const away=teams.find(t=>String(t.id)===String(f.away_team_id));
      if(!home||!f.scheduled_at) return null;
      return {
        ...f,
        _home_name:home.name,
        _away_name:away?.name||f.away_placeholder||'Ospite',
        _facility_key:facilityKeyDirect(home,f.venue||home.home_court),
        _shared_home_slot_key:sharedHomeSlotKey(home),
        _duration_minutes:duration(home)
      };
    }).filter(Boolean);
}
function roundRobin(list){
  const a=[...list];
  if(a.length%2) a.push(null);
  const rounds=[];
  for(let r=0;r<a.length-1;r++){
    const pairs=[];
    for(let i=0;i<a.length/2;i++){
      const x=a[i],y=a[a.length-1-i];
      if(x&&y) pairs.push([x,y]);
    }
    rounds.push(pairs);
    a.splice(1,0,a.pop());
  }
  return rounds;
}
function rowsConflict(rows,external){
  for(let i=0;i<rows.length;i++){
    for(let j=i+1;j<rows.length;j++){
      if(realConflict(rows[i],rows[j])) return true;
    }
    for(const e of external||[]){
      if(realConflict(rows[i],e)) return true;
    }
  }
  return false;
}

/* Prova SOLO le orientazioni casa/trasferta della giornata.
   Max 3 partite per un girone da 7 = 8 combinazioni.
*/
function orientRound(rawPairs,group,roundNo,anchor,code,external){
  const max=1<<rawPairs.length;
  for(let mask=0;mask<max;mask++){
    const oriented=rawPairs.map(([a,b],i)=>(mask&(1<<i))?[b,a]:[a,b]);
    const rows=oriented.map(([home,away])=>makeFixture(group,roundNo,home,away,anchor,code));
    if(rows.some(f=>fixtureOnBlackout(f,code))) continue;
    if(!rowsConflict(rows,external)) return {oriented,rows};
  }
  return null;
}

function placeRound(rawPairs,group,roundNo,startAnchor,intervalWeeks,code,external){
  for(let shift=0;shift<60;shift++){
    const anchor=addDays(startAnchor,shift*7);
    const opt=orientRound(rawPairs,group,roundNo,anchor,code,external);
    if(opt) return {...opt,anchor};
  }
  return null;
}

window.buildCalendarPayload=async function(){
  const startValue=$id('startDate')?.value;
  if(!startValue) throw new Error('Inserisci la data di partenza.');

  await fetchData();
  if(!groups.length) throw new Error('Prima devi creare i gironi.');
  if(!validateTeams(false)) throw new Error('Completa prima giorno, ora e campo delle squadre.');

  const code=$id('competition').value;
  const intervalWeeks=Number($id('interval').value||1);
  const isDouble=$id('formula').value==='double';
  const start=fromKey(startValue);
  const external=externalFixtures(code);
  const payload=[];

  for(const group of groups){
    const groupTeams=members
      .filter(m=>String(m.group_id)===String(group.id))
      .map(m=>teams.find(t=>String(t.id)===String(m.team_id)))
      .filter(Boolean);

    if(groupTeams.length<2) continue;

    const rounds=roundRobin(groupTeams);
    const chosen=[];
    let nextAnchor=new Date(start);

    for(let i=0;i<rounds.length;i++){
      const placed=placeRound(
        rounds[i],
        group,
        i+1,
        nextAnchor,
        intervalWeeks,
        code,
        [...external,...payload]
      );

      if(!placed){
        throw new Error(
          `Giornata ${i+1} del ${group.group_name||group.name||'girone'}: `+
          `non esiste una combinazione CASA/TRASFERTA valida senza conflitti.`
        );
      }

      chosen.push(placed);
      payload.push(...placed.rows);
      nextAnchor=addDays(placed.anchor,intervalWeeks*7);
    }

    if(isDouble){
      for(let i=0;i<chosen.length;i++){
        const first=chosen[i];
        let placedReturn=null;

        for(let shift=0;shift<60&&!placedReturn;shift++){
          const anchor=addDays(nextAnchor,shift*7);
          const rows=first.oriented.map(([home,away])=>
            makeFixture(
              group,
              i+1+chosen.length,
              away,
              home,
              anchor,
              code
            )
          );

          if(rows.some(f=>fixtureOnBlackout(f,code))) continue;
          if(rowsConflict(rows,[...external,...payload])) continue;

          placedReturn={rows,anchor};
        }

        if(!placedReturn){
          throw new Error(
            `Ritorno G${i+1+chosen.length} del ${group.group_name||group.name||'girone'}: `+
            `nessuno slot valido trovato mantenendo il ritorno speculare.`
          );
        }

        payload.push(...placedReturn.rows);
        nextAnchor=addDays(placedReturn.anchor,intervalWeeks*7);
      }
    }
  }

  /* controllo finale rapido */
  for(let i=0;i<payload.length;i++){
    if(fixtureOnBlackout(payload[i],code)){
      throw new Error(`Errore interno: partita su data esclusa ${payload[i]._local_date}.`);
    }
    for(let j=i+1;j<payload.length;j++){
      if(realConflict(payload[i],payload[j])){
        throw new Error(
          `Conflitto reale residuo: ${payload[i]._home_name} – ${payload[i]._away_name} / `+
          `${payload[j]._home_name} – ${payload[j]._away_name}.`
        );
      }
    }
    for(const e of external){
      if(realConflict(payload[i],e)){
        throw new Error(
          `Conflitto reale con altra competizione: ${payload[i]._home_name} – ${payload[i]._away_name}.`
        );
      }
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
    rule:'V10.13 DIRECT · round robin diretto · max 8 orientazioni per giornata · ritorno speculare · sospensioni a giornata'
  };

  return payload;
};

for(const box of document.querySelectorAll('.notice')){
  if(/regola calendario|global sort|inversione casa\/trasferta|accavallamenti/i.test(box.textContent||'')){
    box.innerHTML=
      '<b>Regola calendario:</b> motore DIRECT. '+
      'Ogni giornata viene costruita direttamente e prova soltanto le possibili orientazioni CASA ↔ TRASFERTA. '+
      'Le date escluse fanno slittare l’intera giornata. '+
      'Il ritorno resta speculare e nessuna partita viene spostata da sola.';
  }
}

console.info('[V9 calendario] 10.13 DIRECT attivo');
})();
