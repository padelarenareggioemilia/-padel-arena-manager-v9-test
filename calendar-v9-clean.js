/*
 AICS PADEL CHAMPIONSHIP MANAGER V9
 CALENDARIO SEMPLICE 9.3.2

 - giornate fisse
 - solo inversione casa/trasferta
 - ritorno speculare
 - ignora TUTTE le vecchie partite della competizione che si sta rigenerando
 - mantiene il controllo sulle altre competizioni
 - ripristina "Elimina tutte le partite" con doppia conferma
*/
(function(){
  'use strict';

  const $id = id => document.getElementById(id);

  function pad(n){ return String(n).padStart(2,'0'); }
  function dateKeyLocal(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
  function fromDateKey(key){ const [y,m,d]=String(key).split('-').map(Number); return new Date(y,m-1,d,12,0,0,0); }
  function addDays(d,days){ const x=new Date(d.getFullYear(),d.getMonth(),d.getDate(),12,0,0,0); x.setDate(x.getDate()+days); return x; }
  function normalizeText(v){
    return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  }

  function homeSlot(team){
    if(!team) throw new Error('Squadra non valida.');
    const targetDay=dayIndex(team.home_match_day);
    const time=normalizeTime(team.home_match_time);
    if(targetDay===undefined || !time) throw new Error(`Giorno/orario casalingo incompleto per ${team.name}.`);

    let facility='';
    if(typeof facilityKey==='function') facility=facilityKey(team,team.home_court)||'';
    if(!facility){
      facility=[team.home_court,team.club_address,team.club_city].map(normalizeText).filter(Boolean).join('|');
    }

    return {dayIndex:targetDay,time,facility,venue:team.home_court||''};
  }

  function occurrenceInRound(anchor,team){
    const slot=homeSlot(team);
    const d=new Date(anchor.getFullYear(),anchor.getMonth(),anchor.getDate(),12,0,0,0);
    let guard=0;
    while(d.getDay()!==slot.dayIndex && guard++<7) d.setDate(d.getDate()+1);
    const dateKey=dateKeyLocal(d);
    return {
      scheduled_at:localDateTimeToISO(dateKey,slot.time),
      dateKey,time:slot.time,facility:slot.facility,venue:slot.venue
    };
  }

  function conflictKey(occ){ return `${new Date(occ.scheduled_at).toISOString()}||${occ.facility}`; }

  function existingHomeOccupancy(competitionCode){
    const map=new Map();

    for(const f of (allFixtures||[])){
      // IMPORTANTE: ignora QUALSIASI vecchia partita della competizione che stiamo rigenerando.
      if(f.competition_code===competitionCode) continue;

      const home=teams.find(t=>t.id===f.home_team_id);
      if(!home || !f.scheduled_at) continue;

      let facility='';
      if(typeof facilityKey==='function') facility=facilityKey(home,f.venue||home.home_court)||'';
      if(!facility){
        facility=[f.venue||home.home_court,home.club_address,home.club_city]
          .map(normalizeText).filter(Boolean).join('|');
      }

      const key=`${new Date(f.scheduled_at).toISOString()}||${facility}`;
      if(!map.has(key)) map.set(key,[]);
      map.get(key).push(f);
    }

    return map;
  }

  function isBlackout(occ,competitionCode){
    return (blackouts||[]).some(b =>
      b.blackout_date===occ.dateKey &&
      (b.competition_code==='ALL' || b.competition_code===competitionCode)
    );
  }

  function validateOrientation(orientedPairs,anchor,competitionCode,occupiedExternal){
    const used=new Map();

    for(const [home] of orientedPairs){
      const occ=occurrenceInRound(anchor,home);

      if(isBlackout(occ,competitionCode)){
        return {ok:false,reason:`${home.name} giocherebbe in una data esclusa (${occ.dateKey}).`};
      }

      const key=conflictKey(occ);

      if(used.has(key)){
        return {ok:false,reason:`${home.name} e ${used.get(key).name} sarebbero entrambe in casa sullo stesso campo, giorno e ora.`};
      }

      if(occupiedExternal.has(key)){
        return {ok:false,reason:`${home.name} entrerebbe in conflitto con una partita di un'altra competizione già salvata sullo stesso campo, giorno e ora.`};
      }

      used.set(key,home);
    }

    return {ok:true};
  }

  function chooseOrientation(rawPairs,firstAnchor,returnAnchor,competitionCode,occupiedExternal,isDouble){
    const count=rawPairs.length;
    const possibilities=1<<count;
    let lastReason='';

    for(let mask=0;mask<possibilities;mask++){
      const first=rawPairs.map(([a,b],i)=>(mask&(1<<i)) ? [b,a] : [a,b]);

      const checkFirst=validateOrientation(first,firstAnchor,competitionCode,occupiedExternal);
      if(!checkFirst.ok){ lastReason=checkFirst.reason; continue; }

      if(isDouble){
        const second=first.map(([home,away])=>[away,home]);
        const checkReturn=validateOrientation(second,returnAnchor,competitionCode,occupiedExternal);
        if(!checkReturn.ok){ lastReason=checkReturn.reason; continue; }
      }

      return first;
    }

    throw new Error(`Nessuna inversione casa/trasferta risolve questa giornata. ${lastReason||''}`);
  }

  function makeFixture(group,roundNumber,home,away,anchor,competitionCode){
    const occ=occurrenceInRound(anchor,home);
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
      _facility_key:occ.facility,
      _facility_label:[home.home_court,home.club_address,home.club_city].filter(Boolean).join(' · '),
      _duration_minutes:matchDurationMinutes(home)
    };

    assertHomeRule(fixture);
    return fixture;
  }

  window.buildCalendarPayload=async function(){
    if(!$id('startDate')?.value) throw new Error('Inserisci la data di partenza.');

    await fetchData();

    if(!groups.length) throw new Error('Prima devi creare i gironi.');
    if(!validateTeams(false)) throw new Error('Correggi prima i dati delle squadre indicati sopra.');

    const code=$id('competition').value;
    const formula=$id('formula').value;
    const isDouble=formula==='double';
    const intervalWeeks=Number($id('interval').value||1);
    const start=fromDateKey($id('startDate').value);

    const payload=[];
    const occupiedExternal=existingHomeOccupancy(code);

    for(const group of groups){
      const groupTeams=members
        .filter(m=>m.group_id===group.id)
        .map(m=>teams.find(t=>t.id===m.team_id))
        .filter(Boolean);

      const rawRounds=roundRobin(groupTeams);
      const firstLegCount=rawRounds.length;
      const chosenFirstLeg=[];

      for(let i=0;i<firstLegCount;i++){
        const firstAnchor=addDays(start,i*intervalWeeks*7);
        const returnAnchor=isDouble ? addDays(start,(i+firstLegCount)*intervalWeeks*7) : null;

        chosenFirstLeg.push(
          chooseOrientation(rawRounds[i],firstAnchor,returnAnchor,code,occupiedExternal,isDouble)
        );
      }

      for(let i=0;i<chosenFirstLeg.length;i++){
        const roundNumber=i+1;
        const anchor=addDays(start,i*intervalWeeks*7);
        for(const [home,away] of chosenFirstLeg[i]){
          payload.push(makeFixture(group,roundNumber,home,away,anchor,code));
        }
      }

      if(isDouble){
        for(let i=0;i<chosenFirstLeg.length;i++){
          const roundNumber=i+1+firstLegCount;
          const anchor=addDays(start,(i+firstLegCount)*intervalWeeks*7);
          for(const [home,away] of chosenFirstLeg[i]){
            payload.push(makeFixture(group,roundNumber,away,home,anchor,code));
          }
        }
      }
    }

    const seen=new Map();

    for(const f of payload){
      const key=`${new Date(f.scheduled_at).toISOString()}||${f._facility_key}`;

      if(seen.has(key)){
        const other=seen.get(key);
        throw new Error(`Calendario non salvato: ${other._home_name} e ${f._home_name} risultano entrambe in casa sullo stesso campo, giorno e ora.`);
      }

      if(occupiedExternal.has(key)){
        throw new Error(`Calendario non salvato: ${f._home_name} entra in conflitto con una partita di un'altra competizione già salvata sullo stesso campo, giorno e ora.`);
      }

      seen.set(key,f);
    }

    payload._calendarDiagnosis={
      totalMatches:payload.length,
      conflictsDetected:0,
      conflictsSolved:0,
      conflictsUnresolved:0,
      progression:'OK',
      rule:'Solo inversione casa/trasferta. Nessuno spostamento di giornata.'
    };

    return payload;
  };

  window.autoResolveConflicts=function(){
    return {resolved:[],changed:[],unresolved:[],remainingFacilityConflicts:[],remainingTeamConflicts:[],existing:[]};
  };
  window.autoFixAllCalendarConflicts=window.autoResolveConflicts;
  window.collectCalendarConflicts=function(){ return []; };
  window.createSuggestionAttempts=function(){ return []; };

  try{ if(typeof closeConflictAssistant==='function') closeConflictAssistant(); }catch(_){}

  [...document.querySelectorAll('button')].forEach(btn=>{
    if(/Risolvi automaticamente anomalie/i.test(btn.textContent||'')) btn.style.display='none';
  });

  [...document.querySelectorAll('.notice')].forEach(box=>{
    if(/primo slot futuro|inversione casa\/trasferta|accavallamenti|regola calendario/i.test(box.textContent||'')){
      box.innerHTML=
        '<b>Regola calendario:</b> le giornate restano fisse. '+
        'Se due squadre condividono lo stesso impianto, giorno e ora, il sistema prova soltanto '+
        '<b>l’inversione casa/trasferta</b>. Il ritorno viene invertito automaticamente. '+
        'Nessuna partita viene spostata di settimana.';
    }
  });

  // TASTO ELIMINA TUTTE: inserito accanto ai comandi reali "Anteprima calendario / Aggiorna elenco"
  function installDeleteAllButton(){
    if(document.getElementById('deleteAllFixturesBtn')) return true;

    const buttons=[...document.querySelectorAll('button')];
    const previewBtn=buttons.find(b=>/anteprima calendario/i.test((b.textContent||'').trim()));
    const refreshBtn=buttons.find(b=>/aggiorna elenco/i.test((b.textContent||'').trim()));
    const anchor=previewBtn||refreshBtn;
    if(!anchor) return false;

    const actions=anchor.closest('.actions')||anchor.parentElement;
    if(!actions) return false;

    const btn=document.createElement('button');
    btn.id='deleteAllFixturesBtn';
    btn.className='btn danger';
    btn.type='button';
    btn.textContent='🗑 Elimina tutte le partite';

    if(refreshBtn && refreshBtn.parentElement===actions){
      refreshBtn.insertAdjacentElement('afterend',btn);
    }else{
      actions.appendChild(btn);
    }

    btn.addEventListener('click',async function(){
      const code=$id('competition')?.value;
      if(!code) return;

      const label=$id('competition')?.selectedOptions?.[0]?.textContent||code;

      if(!confirm(
        `ATTENZIONE\n\nStai per eliminare TUTTE le partite di ${label}.\n\nVuoi continuare?`
      )) return;

      if(prompt(
        `Seconda conferma: scrivi ELIMINA per cancellare tutte le partite di ${label}.`
      )!=='ELIMINA') return;

      try{
        btn.disabled=true;
        btn.textContent='Eliminazione in corso…';

        // usa il client Supabase già presente nella pagina
        const client=(typeof sb!=='undefined'&&sb)||(typeof s!=='undefined'&&s);
        if(!client) throw new Error('Client database non disponibile.');

        const res=await client.from('fixtures').delete().eq('competition_code',code);
        if(res.error) throw res.error;

        if(typeof pendingCalendar!=='undefined') pendingCalendar=[];
        if(typeof fixtures!=='undefined') fixtures=[];
        if(typeof allFixtures!=='undefined') allFixtures=(allFixtures||[]).filter(f=>f.competition_code!==code);

        if(typeof clearCalendarPreview==='function') clearCalendarPreview();
        if(typeof fetchData==='function') await fetchData();
        if(typeof renderFixtures==='function') renderFixtures();

        msg(`✅ Tutte le partite di ${label} sono state eliminate.`);
      }catch(e){
        msg(`Errore eliminazione: ${e?.message||String(e)}`,true);
      }finally{
        btn.disabled=false;
        btn.textContent='🗑 Elimina tutte le partite';
      }
    });

    return true;
  }

  if(!installDeleteAllButton()){
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if(installDeleteAllButton()||tries>=40) clearInterval(timer);
    },250);
  }

  console.info('[V9 calendario] Motore semplice 9.3.2 attivo');
})();
