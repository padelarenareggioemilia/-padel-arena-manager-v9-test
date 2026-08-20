/* V9 DIAGNOSTICA CONFLITTI - deduplica definitiva
   Mostra una sola riga per ogni collisione reale:
   due squadre di casa DIVERSE + stesso impianto/campo + stessa data/ora.
*/
(function(){
'use strict';
if(!/(^|\/)diagnostics\.html$/i.test(location.pathname)) return;

const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();

async function calc(){
 const [fr,tr]=await Promise.all([
  sb.from('fixtures').select('id,competition_code,round_number,scheduled_at,venue,home_team_id,away_team_id'),
  sb.from('teams').select('id,name,series,home_court')
 ]);
 if(fr.error) throw fr.error;
 if(tr.error) throw tr.error;

 const tm=new Map((tr.data||[]).map(t=>[String(t.id),t]));
 const slots=new Map();

 for(const f of fr.data||[]){
  if(!f.scheduled_at || !f.home_team_id) continue;
  const h=tm.get(String(f.home_team_id)), a=tm.get(String(f.away_team_id));
  if(!h) continue;
  const venue=String(f.venue||h.home_court||'').trim();
  if(!venue) continue;
  const d=new Date(f.scheduled_at);
  if(Number.isNaN(d.getTime())) continue;
  const slot=d.toISOString()+'||'+norm(venue);
  const row={...f,venue,home_name:h.name||'Squadra casa',away_name:a?.name||'Squadra ospite'};
  if(!slots.has(slot)) slots.set(slot,[]);
  slots.get(slot).push(row);
 }

 const out=[], seen=new Set();
 for(const [slot,rows] of slots){
  /* Una sola occorrenza per partita e per squadra di casa nello slot */
  const uniqueFixtures=[...new Map(rows.map(r=>[String(r.id),r])).values()];
  const byHome=new Map();
  for(const r of uniqueFixtures) if(!byHome.has(String(r.home_team_id))) byHome.set(String(r.home_team_id),r);
  const homes=[...byHome.values()];
  if(homes.length<2) continue;

  /* Una collisione per coppia di squadre di casa, indipendente dall'ordine */
  for(let i=0;i<homes.length-1;i++) for(let j=i+1;j<homes.length;j++){
   const a=homes[i],b=homes[j];
   const ids=[String(a.home_team_id),String(b.home_team_id)].sort();
   const key=slot+'||'+ids.join('||');
   if(seen.has(key)) continue;
   seen.add(key);
   out.push({
    scheduled_at:a.scheduled_at,
    venue:a.venue,
    match_1:`${a.home_name} – ${a.away_name}`,
    match_2:`${b.home_name} – ${b.away_name}`,
    competition_1:a.competition_code||'—',
    round_1:a.round_number??'—',
    competition_2:b.competition_code||'—',
    round_2:b.round_number??'—',
    reason:'DA RISOLVERE: due squadre di casa diverse occupano lo stesso impianto/campo nello stesso giorno e alla stessa ora.'
   });
  }
 }
 return out;
}

function install(){
 if(typeof window.runDiagnostics!=='function'||typeof window.renderReport!=='function'){
  setTimeout(install,50); return;
 }
 if(window.__V9_DIAG_DEDUP_FIX__) return;
 window.__V9_DIAG_DEDUP_FIX__=true;
 const original=window.runDiagnostics;

 window.runDiagnostics=async function(){
  await original();
  try{
   const r=(typeof report!=='undefined')?report:window.report;
   if(!r?.summary) return;
   const before=Number(r.summary.fixture_conflicts||0);
   const exact=await calc();
   r.fixture_conflicts=exact;
   r.summary.fixture_conflicts=exact.length;
   if(Number.isFinite(Number(r.summary.total_anomalies))){
    r.summary.total_anomalies=Math.max(0,Number(r.summary.total_anomalies)-before+exact.length);
   }
   renderReport();
   const total=Number(r.summary.total_anomalies||0);
   msg(total?`Diagnostica completata: ${total} segnalazioni da controllare.`:'Diagnostica completata: nessuna anomalia rilevata.');
  }catch(e){
   console.error(e);
   msg('Errore nel ricalcolo dei conflitti calendario: '+(e.message||String(e)),true);
  }
 };
}
install();
})();