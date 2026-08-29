// V9.9.34 - FIX selezione multi-squadra
// Sostituisci con questo il vecchio captain-multiteam.js

(async function(){
  const selectedTeam=new URLSearchParams(location.search).get('team');
  if(!selectedTeam)return;

  // Lascia terminare il caricamento storico della pagina,
  // poi forza la squadra realmente selezionata.
  await new Promise(r=>setTimeout(r,500));

  try{
    const session=await sb.auth.getSession();
    if(!session.data.session){
      location.replace('login.html?v=9934');
      return;
    }

    const ar=await sb.rpc('get_my_account_accesses');
    if(ar.error)throw ar.error;

    const ctx=Array.isArray(ar.data)?(ar.data[0]||{}):(ar.data||{});
    const teams=Array.isArray(ctx.staff_teams)?ctx.staff_teams:[];
    const access=teams.find(x=>String(x.team_id)===String(selectedTeam));

    if(!access){
      throw new Error('Questa squadra non risulta associata al tuo account.');
    }

    staffRole=access.role||'captain';

    // IMPORTANTE: carica espressamente il team_id ricevuto dall'account-home.
    const rr=await sb.rpc('get_my_captain_portal_for_team',{
      p_team_id:selectedTeam
    });
    if(rr.error)throw rr.error;

    data=Array.isArray(rr.data)?rr.data[0]:rr.data;

    if(!data?.ok){
      throw new Error(data?.message||'Squadra non collegata.');
    }

    // Protezione contro il ritorno accidentale alla prima squadra.
    if(data.team_id && String(data.team_id)!==String(selectedTeam)){
      throw new Error('Il server ha restituito una squadra diversa da quella selezionata.');
    }

    let ed={};
    teamEditEnabled=false;

    if(staffRole==='captain'){
      const es=await sb.rpc('captain_get_own_team_edit_state',{
        p_team_id:selectedTeam
      });

      if(!es.error){
        ed=Array.isArray(es.data)?(es.data[0]||{}):(es.data||{});
        teamEditEnabled=ed?.captain_team_edit_enabled===true;
      }
    }

    data.team={...(data.team||{}),...(ed||{})};

    await loadTeamHub();
    await loadTeamDocuments();

    const t=data.team||{};

    teamName.textContent=t.name||'Squadra';
    teamMeta.textContent=[t.series,t.club_name,t.club_city]
      .filter(Boolean).join(' Â· ');
    captainMeta.textContent=`Capitano: ${t.captain_name||''}`;

    heroTitle.textContent=
      staffRole==='secretary'?'Area Segretario':'Area Capitano';
    heroSub.textContent=t.name||'AICS Padel Championship';

    teamLogo.src=t.logo_url||'';
    teamLogo.style.visibility=t.logo_url?'visible':'hidden';

    playersKpi.textContent=
      arr(data.players).filter(x=>x.status==='approved').length;
    pendingKpi.textContent=
      arr(data.players).filter(x=>x.status==='pending').length;
    lineupsKpi.textContent=arr(data.lineups).length;
    futureKpi.textContent=
      arr(data.fixtures).filter(x=>!done(x)).length;

    const firstGroup=arr(data.groups)[0];
    const rows=firstGroup?standings(firstGroup):[];
    const pos=rows.findIndex(x=>String(x.id)===String(selectedTeam));

    positionKpi.textContent=pos>=0?`${pos+1}Â°`:'â';
    pointsKpi.textContent=pos>=0?rows[pos].pt:0;

    status.textContent=
      (staffRole==='secretary'?'Accesso segretario':'Accesso capitano')+
      ' Â· '+(t.name||'Squadra');
    status.className='notice ok';

    app.classList.remove('hidden');

    if(staffRole==='secretary'){
      document.querySelector('[data-view="secretaries"]')?.remove();
      document.querySelector('[data-view="management"]')?.remove();

      if(typeof staffModeBtn!=='undefined'&&staffModeBtn){
        staffModeBtn.textContent='ModalitÃ  Segretario';
      }
    }

    render();

    // Torna alla scelta squadra/modalitÃ .
    const hero=document.querySelector('.hero');
    if(hero&&!document.getElementById('accountChooserBtn')){
      const b=document.createElement('button');
      b.id='accountChooserBtn';
      b.className='btn secondary';
      b.textContent='Cambia squadra / modalitÃ ';
      b.onclick=()=>location.href='account-home.html?v=9934';
      hero.appendChild(b);
    }

    // Evita che "Aggiorna" richiami il vecchio loadAll(),
    // che selezionerebbe nuovamente la prima squadra.
    const refresh=document.querySelector(
      '.identity button[onclick="loadAll()"]'
    );
    if(refresh){
      refresh.onclick=()=>location.reload();
    }

  }catch(e){
    status.textContent=
      'Errore selezione squadra: '+(e?.message||String(e));
    status.className='notice err';
    app.classList.add('hidden');
  }
})();
