/* AICS Padel Championship Manager V9 - calendario stabile
   Unico scopo: sostituire la generazione dell'anteprima senza modificare database,
   login, squadre, capitani, giocatori o risultati.
*/
(function(){
'use strict';

const q=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,'0');
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();

function keyDate(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function fromDateKey(v){ const [y,m,d]=String(v).split('-').map(Number); return new Date(y,m-1,d,12,0,0,0); }
function plusDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function dur(t){ return Number(t?.match_slot_minutes||q('defaultSlotMinutes')?.value||120); }

function facility(t,venue){
  if(t?.facility_id) return `id:${t.facility_id}`;
  const a=[t?.club_address,t?.club_city,t?.club_province].map(norm).filter(Boolean).join('|');
  return a || `court:${norm(venue||t?.home_court||t?.id||'')}`;
}
function homeSlot(t){
  if(!t) return '';
  const c=norm(t.home_court||'');
  const d=dayIndex(t.home_match_day);
  const tm=normalizeTime(t.home_match_time);
  return c && d!==undefined && tm ? `${c}|${d}|${tm}` : '';
}
function pairKey(a,b){ return [String(a||''),String(b||'')].sort().join('|'); }

function occurrence(anchor,t){
  const di=dayIndex(t.home_match_day), tm=normalizeTime(t.home_match_time);
  if(di===undefined || !tm || !String(t.home_court||'').trim())
    throw new Error(`Completa giorno, ora e campo di casa per ${t.name}.`);
  const d=new Date(anchor);
  let guard=0;
  while(d.getDay()!==di && guard++<7) d.setDate(d.getDate()+1);
  const date=keyDate(d);
  const scheduled_at=localDateTimeToISO(date,tm);
  const local=localPartsFromISO(scheduled_at);
  return {scheduled_at,local};
}

function mk(group,roundNo,home,away,anchor,code){
  const o=occurrence(anchor,home);
  const f={
    competition_code:code, phase:'Girone', group_id:group.id, round_number:roundNo,
    home_team_id:home.id, away_team_id:away.id,
    scheduled_at:o.scheduled_at, venue:home.home_court,
    _home_name:home.name, _away_name:away.name,
    _configured_day:home.home_match_day,
    _configured_time:normalizeTime(home.home_match_time),
    _local_date:o.local.date, _local_time:o.local.time, _local_weekday:o.local.weekday,
    _facility_key:facility(home,home.home_court),
    _shared_home_slot_key:homeSlot(home),
    _duration_minutes:dur(home)
  };
  assertHomeRule(f);
  return f;
}

function rr(list){
  const a=[...list];
  if(a.length%2) a.push(null);
  const rounds=[];
  for(let r=0;r<a.length-1;r++){
    const pairs=[];
    for(let i=0;i<a.length/2;i++){
      const x=a[i], y=a[a.length-1-i];
      if(x&&y) pairs.push([x,y]);
    }
    rounds.push(pairs);
    a.splice(1,0,a.pop());
  }
  return rounds;
}

function blackoutSet(code){
  return new Set((blackouts||[])
    .filter(b=>{
      const c=String(b.competition_code||'ALL').toUpperCase();
      return c==='ALL'||c===String(code).toUpperCase();
    })
    .map(b=>String(b.blackout_date||'').slice(0,10))
    .filter(Boolean));
}

function externalIndex(code){
  const byFacility=new Map();
  for(const f of (allFixtures||[])){
    if(String(f.competition_code)===String(code)) continue;
    if(!f.scheduled_at) continue;
    const h=teams.find(t=>String(t.id)===String(f.home_team_id));
    if(!h) continue;
    const fk=facility(h,f.venue||h.home_court);
    if(!fk) continue;
    const start=new Date(f.scheduled_at).getTime();
    const row={start,end:start+dur(h)*60000,pair:pairKey(f.home_team_id,f.away_team_id)};
    if(!byFacility.has(fk)) byFacility.set(fk,[]);
    byFacility.get(fk).push(row);
  }
  return byFacility;
}

function interval(f){
  const start=new Date(f.scheduled_at).getTime();
  return {start,end:start+(f._duration_minutes||120)*60000};
}
function overlaps(a,b){ return a.start<b.end && b.start<a.end; }

function conflictWithIndex(f,index){
  const rows=index.get(f._facility_key)||[];
  const iv=interval(f), pk=pairKey(f.home_team_id,f.away_team_id);
  return rows.some(x=>x.pair!==pk && overlaps(iv,x));
}

function conflictWithin(f,chosen){
  const iv=interval(f);
  return chosen.some(x=>{
    if(pairKey(x.home_team_id,x.away_team_id)===pairKey(f.home_team_id,f.away_team_id)) return false;
    if(x._shared_home_slot_key && f._shared_home_slot_key &&
       x._shared_home_slot_key===f._shared_home_slot_key && overlaps(iv,interval(x))) return true;
    return x._facility_key && x._facility_key===f._facility_key && overlaps(iv,interval(x));
  });
}

/* Sceglie CASA/TRASFERTA globalmente per l'intera giornata.
   Con 3 gironi da 7: massimo 9 partite => massimo 512 orientamenti.
*/
function orientWholeRound(items,anchor,roundNo,code,external,already,excluded){
  let touchedBlackout=false;
  const chosen=[];

  function dfs(i){
    if(i===items.length) return chosen.slice();
    const it=items[i];
    const variants=[[it.a,it.b],[it.b,it.a]];
    for(const [home,away] of variants){
      const f=mk(it.group,roundNo,home,away,anchor,code);
      if(excluded.has(f._local_date)){ touchedBlackout=true; continue; }
      if(conflictWithIndex(f,external)) continue;
      if(conflictWithin(f,already)) continue;
      if(conflictWithin(f,chosen)) continue;
      chosen.push(f);
      const done=dfs(i+1);
      if(done) return done;
      chosen.pop();
    }
    return null;
  }
  return {rows:dfs(0),touchedBlackout};
}

function mirroredWholeRound(firstLegRows,anchor,roundNo,code,external,already,excluded){
  const rows=[];
  for(const old of firstLegRows){
    const group=groups.find(g=>String(g.id)===String(old.group_id));
    const home=teams.find(t=>String(t.id)===String(old.away_team_id));
    const away=teams.find(t=>String(t.id)===String(old.home_team_id));
    const f=mk(group,roundNo,home,away,anchor,code);
    if(excluded.has(f._local_date)) return {rows:null,blackout:true};
    if(conflictWithIndex(f,external)||conflictWithin(f,already)||conflictWithin(f,rows))
      return {rows:null,blackout:false};
    rows.push(f);
  }
  return {rows,blackout:false};
}

async function buildV9Calendar(){
  const startValue=q('startDate')?.value;
  if(!startValue) throw new Error('Inserisci la data di partenza.');

  await fetchData();
  if(!groups.length) throw new Error('Prima devi creare i gironi.');
  if(!validateTeams(false)) throw new Error('Completa prima giorno, ora e campo delle squadre.');

  const code=q('competition').value;
  const double=q('formula').value==='double';
  const interval=Math.max(1,Number(q('interval').value||1));
  const excluded=blackoutSet(code);
  const external=externalIndex(code);

  const groupRounds=groups.map(group=>{
    const gt=members.filter(m=>String(m.group_id)===String(group.id))
      .map(m=>teams.find(t=>String(t.id)===String(m.team_id))).filter(Boolean);
    return {group,rounds:rr(gt)};
  }).filter(x=>x.rounds.length);

  const totalRounds=Math.max(0,...groupRounds.map(x=>x.rounds.length));
  const payload=[], firstLeg=[];
  let anchor=fromDateKey(startValue);

  for(let r=0;r<totalRounds;r++){
    const items=[];
    for(const gr of groupRounds){
      for(const p of (gr.rounds[r]||[])) items.push({group:gr.group,a:p[0],b:p[1]});
    }

    let placed=null;
    /* Slittamento consentito SOLO quando la giornata tocca una data esclusa. */
    for(let blackoutShift=0;blackoutShift<20;blackoutShift++){
      const attempt=orientWholeRound(items,anchor,r+1,code,external,payload,excluded);
      if(attempt.rows){ placed=attempt.rows; break; }
      if(!attempt.touchedBlackout) break;
      anchor=plusDays(anchor,7);
    }
    if(!placed){
      throw new Error(`Giornata ${r+1}: conflitto reale di campo/impianto. Nessuna partita è stata spostata singolarmente.`);
    }

    payload.push(...placed);
    firstLeg.push(placed);
    anchor=plusDays(anchor,interval*7);
  }

  if(double){
    for(let r=0;r<firstLeg.length;r++){
      let placed=null;
      for(let blackoutShift=0;blackoutShift<20;blackoutShift++){
        const attempt=mirroredWholeRound(
          firstLeg[r],anchor,totalRounds+r+1,code,external,payload,excluded
        );
        if(attempt.rows){ placed=attempt.rows; break; }
        if(!attempt.blackout) break;
        anchor=plusDays(anchor,7);
      }
      if(!placed){
        throw new Error(`Giornata ${totalRounds+r+1}: conflitto reale nel ritorno speculare.`);
      }
      payload.push(...placed);
      anchor=plusDays(anchor,interval*7);
    }
  }

  auditHomeAwayRules(payload);
  payload._resolvedCount=0;
  return payload;
}

/* Override esplicito del CLICK, non del solo motore interno.
   Così il vecchio risolutore non viene più eseguito dall'Anteprima calendario.
*/
window.previewCalendar=async function(){
  const button=[...document.querySelectorAll('button')].find(b=>/Anteprima calendario/i.test(b.textContent||''));
  const oldText=button?.textContent;
  try{
    if(button){ button.disabled=true; button.textContent='Generazione…'; }
    msg('Generazione calendario V9 in corso…');
    pendingCalendar=await buildV9Calendar();
    renderPendingCalendar();
  }catch(error){
    pendingCalendar=[];
    q('calendarPreviewCard')?.classList.add('hidden');
    q('confirmCalendarBtn')?.classList.add('hidden');
    msg(error?.message||String(error),true);
  }finally{
    if(button){ button.disabled=false; button.textContent=oldText||'Anteprima calendario'; }
  }
};

window.buildCalendarPayload=buildV9Calendar;

/* Evita che il vecchio pulsante lanci il risolutore pesante. */
window.autoFixCalendarFromCurrentState=async function(){
  return window.previewCalendar();
};

document.querySelectorAll('div').forEach(el=>{
  if(/V10\.|V9\.9\.13 CALENDARIO AUTO|V9\.7 STABLE/.test(el.textContent||'') && el.style?.position==='fixed'){
    el.remove();
  }
});
const badge=document.createElement('div');
badge.textContent='V9 · CALENDARIO';
badge.style.cssText='position:fixed;right:8px;bottom:8px;z-index:9999;padding:5px 9px;border-radius:999px;background:#082f68;color:#fff;font:700 10px system-ui;opacity:.82';
document.body.appendChild(badge);

console.info('[AICS V9] calendario stabile attivo');
})();