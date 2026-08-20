/* calendar-v9-clean.js - V9 SIMPLE 10.1
   Una partita non può essere in conflitto con sé stessa o con la stessa coppia di squadre.
   Conflitto reale solo tra due partite distinte, stesso impianto, intervalli sovrapposti.
*/
(function(){
'use strict';
const $id=id=>document.getElementById(id);
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const pad=n=>String(n).padStart(2,'0');
function fromDateKey(k){const [y,m,d]=String(k).split('-').map(Number);return new Date(y,m-1,d,12,0,0,0)}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function dateKeyLocal(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function pairKey(f){return [f.home_team_id,f.away_team_id].filter(Boolean).map(String).sort().join('|')}
function samePair(a,b){const x=pairKey(a),y=pairKey(b);return !!x&&x===y}
function sameFixture(a,b){return !!a.id&&!!b.id&&String(a.id)===String(b.id)}
function durationMinutes(team){return Number(team?.match_slot_minutes||$id('defaultSlotMinutes')?.value||120)}
function realFacilityKey(team,venue){
  if(team?.facility_id)return `id:${team.facility_id}`;
  if(typeof facilityKey==='function'){const k=facilityKey(team,venue||team?.home_court);if(k)return String(k)}
  return [venue||team?.home_court,team?.club_address,team?.club_city].map(norm).filter(Boolean).join('|')||`team:${team?.id||''}`;
}
function overlap(a,b){
  if(!a.scheduled_at||!b.scheduled_at)return false;
  const as=new Date(a.scheduled_at).getTime(),bs=new Date(b.scheduled_at).getTime();
  const ae=as+(a._duration_minutes||120)*60000,be=bs+(b._duration_minutes||120)*60000;
  return as<be&&bs<ae;
}
function realConflict(a,b){
  if(a===b||sameFixture(a,b)||samePair(a,b))return false;
  return !!a._facility_key&&a._facility_key===b._facility_key&&overlap(a,b);
}
function homeOccurrence(anchor,team){
  const targetDay=dayIndex(team.home_match_day),time=normalizeTime(team.home_match_time);
  if(targetDay===undefined||!time||!String(team.home_court||'').trim())throw new Error(`Completa giorno, ora e campo di casa per ${team.name}.`);
  const d=new Date(anchor);let guard=0;while(d.getDay()!==targetDay&&guard++<7)d.setDate(d.getDate()+1);
  const date=dateKeyLocal(d);return{scheduled_at:localDateTimeToISO(date,time),venue:team.home_court,time,date};
}
function makeFixture(group,roundNumber,home,away,anchor,competitionCode){
  const occ=homeOccurrence(anchor,home),local=localPartsFromISO(occ.scheduled_at);
  const f={competition_code:competitionCode,phase:'Girone',group_id:group.id,round_number:roundNumber,home_team_id:home.id,away_team_id:away.id,scheduled_at:occ.scheduled_at,venue:home.home_court,_home_name:home.name,_away_name:away.name,_configured_day:home.home_match_day,_configured_time:occ.time,_local_date:local.date,_local_time:local.time,_local_weekday:local.weekday,_facility_key:realFacilityKey(home,home.home_court),_facility_label:[home.home_court,home.club_address,home.club_city].filter(Boolean).join(' · '),_duration_minutes:durationMinutes(home)};
  assertHomeRule(f);return f;
}
function externalFixtures(code){
  return (allFixtures||[]).filter(f=>f.competition_code!==code).map(f=>{
    const home=teams.find(t=>String(t.id)===String(f.home_team_id)),away=teams.find(t=>String(t.id)===String(f.away_team_id));
    if(!home||!f.scheduled_at)return null;
    return{...f,_home_name:home.name,_away_name:away?.name||f.away_placeholder||'Ospite',_facility_key:realFacilityKey(home,f.venue||home.home_court),_duration_minutes:durationMinutes(home)};
  }).filter(Boolean);
}
function orientationIsValid(pairs,group,roundNumber,anchor,code,external){
  const fixtures=pairs.map(([home,away])=>makeFixture(group,roundNumber,home,away,anchor,code));
  for(let i=0;i<fixtures.length;i++){
    const others=[...fixtures.filter((_,j)=>j!==i),...external];
    if(others.some(o=>realConflict(fixtures[i],o)))return false;
  }
  return true;
}
function chooseOrientation(rawPairs,group,roundNumber,firstAnchor,returnAnchor,code,external,isDouble){
  for(let mask=0;mask<(1<<rawPairs.length);mask++){
    const first=rawPairs.map(([a,b],i)=>(mask&(1<<i))?[b,a]:[a,b]);
    if(!orientationIsValid(first,group,roundNumber,firstAnchor,code,external))continue;
    if(isDouble){
      const ret=first.map(([home,away])=>[away,home]);
      if(!orientationIsValid(ret,group,roundNumber,returnAnchor,code,external))continue;
    }
    return first;
  }
  throw new Error(`Giornata ${roundNumber}: tutte le possibili inversioni casa/trasferta mantengono una reale sovrapposizione dello stesso impianto.`);
}
window.buildCalendarPayload=async function(){
  if(!$id('startDate')?.value)throw new Error('Inserisci la data di partenza.');
  await fetchData();
  if(!groups.length)throw new Error('Prima devi creare i gironi.');
  if(!validateTeams(false))throw new Error('Completa prima giorno, ora e campo delle squadre.');
  const code=$id('competition').value,isDouble=$id('formula').value==='double',intervalWeeks=Number($id('interval').value||1),start=fromDateKey($id('startDate').value),external=externalFixtures(code),payload=[];
  for(const group of groups){
    const groupTeams=members.filter(m=>String(m.group_id)===String(group.id)).map(m=>teams.find(t=>String(t.id)===String(m.team_id))).filter(Boolean);
    const rounds=roundRobin(groupTeams),n=rounds.length,chosen=[];
    for(let i=0;i<n;i++){
      const firstAnchor=addDays(start,i*intervalWeeks*7),returnAnchor=isDouble?addDays(start,(i+n)*intervalWeeks*7):null;
      chosen.push(chooseOrientation(rounds[i],group,i+1,firstAnchor,returnAnchor,code,external,isDouble));
    }
    chosen.forEach((pairs,i)=>pairs.forEach(([home,away])=>payload.push(makeFixture(group,i+1,home,away,addDays(start,i*intervalWeeks*7),code))));
    if(isDouble)chosen.forEach((pairs,i)=>pairs.forEach(([home,away])=>payload.push(makeFixture(group,i+1+n,away,home,addDays(start,(i+n)*intervalWeeks*7),code))));
  }
  for(let i=0;i<payload.length;i++)for(let j=i+1;j<payload.length;j++)if(realConflict(payload[i],payload[j]))throw new Error(`Conflitto reale residuo: ${payload[i]._home_name} – ${payload[i]._away_name} e ${payload[j]._home_name} – ${payload[j]._away_name} occupano contemporaneamente lo stesso impianto.`);
  payload._calendarDiagnosis={totalMatches:payload.length,conflictsDetected:0,conflictsSolved:0,conflictsUnresolved:0,progression:'OK',rule:'Solo inversione casa/trasferta; nessuno spostamento di giornata.'};
  return payload;
};
window.autoResolveConflicts=function(){return{resolved:[],changed:[],unresolved:[],remainingFacilityConflicts:[],remainingTeamConflicts:[],existing:[]}};
window.autoFixAllCalendarConflicts=window.autoResolveConflicts;
window.collectCalendarConflicts=function(){return[]};
window.createSuggestionAttempts=function(){return[]};
try{if(typeof closeConflictAssistant==='function')closeConflictAssistant()}catch(_){}
[...document.querySelectorAll('button')].forEach(btn=>{if(/Risolvi automaticamente anomalie/i.test(btn.textContent||''))btn.style.display='none'});
[...document.querySelectorAll('.notice')].forEach(box=>{if(/primo slot futuro|inversione casa\/trasferta|accavallamenti|regola calendario/i.test(box.textContent||''))box.innerHTML='<b>Regola calendario:</b> giorno, ora e campo dipendono solo dalla squadra di casa. La squadra ospite non impone disponibilità. Un conflitto esiste solo tra <b>due partite distinte</b> che occupano realmente lo stesso impianto nello stesso intervallo. Il sistema prova solo <b>CASA ↔ TRASFERTA</b>. Nessuna partita viene spostata di settimana.'});
console.info('[V9 calendario] Motore semplice 10.1 attivo');
})();