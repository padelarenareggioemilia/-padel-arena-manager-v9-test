// V9.9.33 - patch multi-squadra per captain-home.html
// Caricare questo file e aggiungere <script src="captain-multiteam.js?v=9933"></script> subito prima di </body>.
(async function(){
  const selectedTeam=new URLSearchParams(location.search).get('team');
  if(!selectedTeam)return;

  // attende il primo caricamento della pagina storica e poi riallinea alla squadra scelta
  await new Promise(r=>setTimeout(r,350));
  try{
    const rr=await sb.rpc('get_my_captain_portal_for_team',{p_team_id:selectedTeam});
    if(rr.error)throw rr.error;
    data=Array.isArray(rr.data)?rr.data[0]:rr.data;
    if(!data?.ok)throw new Error(data?.message||'Squadra non collegata.');

    const mr=await sb.rpc('get_my_account_accesses');
    const ctx=Array.isArray(mr.data)?mr.data[0]:mr.data;
    const access=(ctx?.staff_teams||[]).find(x=>x.team_id===selectedTeam);
    staffRole=access?.role||'captain';

    let ed={};
    if(staffRole==='captain'){
      const es=await sb.rpc('captain_get_own_team_edit_state',{p_team_id:data.team_id});
      if(!es.error)ed=Array.isArray(es.data)?es.data[0]:es.data;
      teamEditEnabled=ed?.captain_team_edit_enabled===true;
    }
    data.team={...(data.team||{}),...(ed||{})};

    await loadTeamHub();
    await loadTeamDocuments();

    const t=data.team||{};
    teamName.textContent=t.name||'Squadra';
    teamMeta.textContent=[t.series,t.club_name,t.club_city].filter(Boolean).join(' · ');
    captainMeta.textContent=`Capitano: ${t.captain_name||''}`;
    heroTitle.textContent=staffRole==='secretary'?'Area Segretario':'Area Capitano';
    heroSub.textContent=t.name||'AICS Padel Championship';
    teamLogo.src=t.logo_url||'';
    teamLogo.style.visibility=t.logo_url?'visible':'hidden';

    const firstGroup=arr(data.groups)[0],rows=firstGroup?standings(firstGroup):[],pos=rows.findIndex(x=>x.id===data.team_id);
    playersKpi.textContent=arr(data.players).filter(x=>x.status==='approved').length;
    pendingKpi.textContent=arr(data.players).filter(x=>x.status==='pending').length;
    lineupsKpi.textContent=arr(data.lineups).length;
    futureKpi.textContent=arr(data.fixtures).filter(x=>!done(x)).length;
    positionKpi.textContent=pos>=0?`${pos+1}°`:'–';
    pointsKpi.textContent=pos>=0?rows[pos].pt:0;
    status.textContent=(staffRole==='secretary'?'Accesso segretario':'Accesso capitano')+' · '+(t.name||'Squadra');
    status.className='notice ok';
    app.classList.remove('hidden');
    render();

    // pulsante rapido per tornare alla scelta ruolo/squadra
    const hero=document.querySelector('.hero');
    if(hero&&!document.getElementById('accountChooserBtn')){
      const b=document.createElement('button');
      b.id='accountChooserBtn';b.className='btn secondary';b.textContent='Cambia squadra / modalità';
      b.onclick=()=>location.href='account-home.html?v=9933';
      hero.appendChild(b);
    }
  }catch(e){
    status.textContent='Errore selezione squadra: '+(e.message||e);
    status.className='notice err';
  }
})();