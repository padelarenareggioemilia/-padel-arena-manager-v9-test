/* AICS Padel Championship V9 - correzione diagnostica conflitti calendario */
(function(){
  if(!/(^|\/)diagnostics\.html$/i.test(location.pathname)) return;

  function norm(v){
    return String(v||'').trim().toLowerCase().replace(/\s+/g,' ');
  }

  async function recalcExactCalendarConflicts(){
    const [fxRes,teamsRes]=await Promise.all([
      sb.from('fixtures').select('id,scheduled_at,home_team_id,away_team_id'),
      sb.from('teams').select('id,name,series,home_court,club_address,club_name,club_city')
    ]);
    if(fxRes.error) throw fxRes.error;
    if(teamsRes.error) throw teamsRes.error;

    const teams=new Map((teamsRes.data||[]).map(t=>[t.id,t]));
    const buckets=new Map();

    for(const f of (fxRes.data||[])){
      if(!f.scheduled_at || !f.home_team_id) continue;
      const home=teams.get(f.home_team_id);
      const away=teams.get(f.away_team_id);
      if(!home) continue;

      const court=String(home.home_court||'').trim();
      if(!court) continue;

      const instant=new Date(f.scheduled_at).toISOString();
      const key=instant+'|'+norm(court);
      const row={
        id:f.id,
        scheduled_at:f.scheduled_at,
        venue:court,
        home_team_id:f.home_team_id,
        away_team_id:f.away_team_id,
        label:(home.name||'Squadra casa')+' – '+(away?.name||'Squadra ospite')
      };
      if(!buckets.has(key)) buckets.set(key,[]);
      buckets.get(key).push(row);
    }

    const conflicts=[];
    for(const rows of buckets.values()){
      if(rows.length<2) continue;
      for(let i=0;i<rows.length-1;i++){
        for(let j=i+1;j<rows.length;j++){
          const a=rows[i],b=rows[j];
          conflicts.push({
            scheduled_at:a.scheduled_at,
            venue:a.venue,
            match_1:a.label,
            match_2:b.label,
            fixture_1_id:a.id,
            fixture_2_id:b.id
          });
        }
      }
    }
    return conflicts;
  }

  window.addEventListener('load',function(){
    const original=window.runDiagnostics;
    if(typeof original!=='function') return;

    window.runDiagnostics=async function(){
      await original();
      try{
        if(!report || !report.summary) return;
        const oldCount=Number(report.summary.fixture_conflicts||0);
        const exact=await recalcExactCalendarConflicts();
        report.fixture_conflicts=exact;
        report.summary.fixture_conflicts=exact.length;
        if(Number.isFinite(Number(report.summary.total_anomalies))){
          report.summary.total_anomalies=Math.max(
            0,
            Number(report.summary.total_anomalies)-oldCount+exact.length
          );
        }
        renderReport();
        const total=Number(report.summary.total_anomalies||0);
        msg(
          total
            ? `Diagnostica completata: ${total} segnalazioni da controllare.`
            : 'Diagnostica completata: nessuna anomalia rilevata.'
        );
      }catch(e){
        console.error('Correzione diagnostica conflitti:',e);
        msg(
          'Diagnostica completata, ma il ricalcolo dei conflitti calendario non è riuscito: '
          +(e.message||String(e)),
          true
        );
      }
    };
  });
})();
