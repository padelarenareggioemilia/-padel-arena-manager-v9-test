/* V9 DIAGNOSTICA CONFLITTI DEFINITIVA */
(function(){
'use strict';
if(!/(^|\/)diagnostics\.html$/i.test(location.pathname))return;
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
async function calc(){
 const [fr,tr]=await Promise.all([
  sb.from('fixtures').select('id,competition_code,round_number,scheduled_at,venue,home_team_id,away_team_id'),
  sb.from('teams').select('id,name,series,home_court')
 ]);
 if(fr.error)throw fr.error;if(tr.error)throw tr.error;
 const tm=new Map((tr.data||[]).map(t=>[t.id,t])), buckets=new Map();
 for(const f of fr.data||[]){
  if(!f.scheduled_at||!f.home_team_id)continue;
  const h=tm.get(f.home_team_id),a=tm.get(f.away_team_id);if(!h)continue;
  const venue=String(f.venue||h.home_court||'').trim();if(!venue)continue;
  const d=new Date(f.scheduled_at);if(Number.isNaN(d.getTime()))continue;
  const key=d.toISOString()+'||'+norm(venue);
  const x={...f,venue,home_name:h.name||'Squadra casa',away_name:a?.name||'Squadra ospite'};
  if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(x);
 }
 const out=[];
 for(const rows of buckets.values())for(let i=0;i<rows.length-1;i++)for(let j=i+1;j<rows.length;j++){
  const a=rows[i],b=rows[j];
  if(a.home_team_id===b.home_team_id)continue;
  out.push({scheduled_at:a.scheduled_at,venue:a.venue,
   competition_1:a.competition_code,round_1:a.round_number,
   competition_2:b.competition_code,round_2:b.round_number,
   match_1:`${a.home_name} – ${a.away_name}`,match_2:`${b.home_name} – ${b.away_name}`,
   reason:'Due squadre di casa diverse occupano lo stesso campo nello stesso giorno e alla stessa ora.'});
 }
 return out;
}
function install(){
 if(typeof window.runDiagnostics!=='function'||typeof window.renderReport!=='function'){setTimeout(install,50);return}
 if(window.__V9_DIAG_HOME_FIELD_FIX__)return;window.__V9_DIAG_HOME_FIELD_FIX__=true;
 const old=window.runDiagnostics;
 window.runDiagnostics=async function(){
  await old();
  try{
   const r=(typeof report!=='undefined')?report:window.report;if(!r?.summary)return;
   const before=Number(r.summary.fixture_conflicts||0), exact=await calc();
   r.fixture_conflicts=exact;r.summary.fixture_conflicts=exact.length;
   if(Number.isFinite(Number(r.summary.total_anomalies)))r.summary.total_anomalies=Math.max(0,Number(r.summary.total_anomalies)-before+exact.length);
   renderReport();
   const total=Number(r.summary.total_anomalies||0);
   msg(total?`Diagnostica completata: ${total} segnalazioni da controllare.`:'Diagnostica completata: nessuna anomalia rilevata.');
  }catch(e){console.error(e);msg('Errore nel ricalcolo dei conflitti calendario: '+(e.message||String(e)),true)}
 };
}
install();
})();