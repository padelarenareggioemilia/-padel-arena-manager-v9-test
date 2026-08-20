/*
 AICS PADEL CHAMPIONSHIP MANAGER V9
 CALENDARIO SEMPLICE 9.3.0

 PRINCIPIO:
 - le giornate NON si spostano;
 - il giorno/ora/campo dipendono SOLO dalla squadra di casa;
 - per evitare conflitti si prova SOLO CASA <-> TRASFERTA;
 - il ritorno è sempre lo specchio esatto dell'andata;
 - se nessuna inversione risolve, il calendario NON viene salvato e segnala il caso.
*/
(function(){
  'use strict';

  const $id = id => document.getElementById(id);

  function pad(n){ return String(n).padStart(2,'0'); }

  function dateKeyLocal(d){
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  function fromDateKey(key){
    const [y,m,d]=String(key).split('-').map(Number);
    return new Date(y,m-1,d,12,0,0,0);
  }

  function addDays(d,days){
    const x=new Date(d.getFullYear(),d.getMonth(),d.getDate(),12,0,0,0);
    x.setDate(x.getDate()+days);
    return x;
  }

  function normalizeText(v){
    return String(v??'')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function homeSlot(team){
    if(!team) throw new Error('Squadra non valida.');

    const targetDay=dayIndex(team.home_match_day);
    const time=normalizeTime(team.home_match_time);

    if(targetDay===undefined || !time){
      throw new Error(`Giorno/orario casalingo incompleto per ${team.name}.`);
    }

    let facility='';
    if(typeof facilityKey==='function'){
      facility=facilityKey(team,team.home_court)||'';
    }
    if(!facility){
      facility=[
        team.home_court,
        team.club_address,
        team.club_city
      ].map(normalizeText).filter(Boolean).join('|');
    }

    return {
      dayIndex:targetDay,
      time,
      facility,
      venue:team.home_court||''
    };
  }

  function occurrenceInRound(anchor,team){
    const slot=homeSlot(team);
    const d=new Date(anchor.getFullYear(),anchor.getMonth(),anchor.getDate(),12,0,0,0);
    let guard=0;
    while(d.getDay()!==slot.dayIndex && guard++<7) d.setDate(d.getDate()+1);

    const dateKey=dateKeyLocal(d);
    const iso=localDateTimeToISO(dateKey,slot.time);

    return {
      scheduled_at:iso,
      dateKey,
      time:slot.time,
      facility:slot.facility,
      venue:slot.venue
    };
  }

  function conflictKey(occ){
    return `${new Date(occ.scheduled_at).toISOString()}||${occ.facility}`;
  }

  function existingHomeOccupancy(competitionCode){
    const map=new Map();

    for(const f of (allFixtures||[])){
      // Ignora le partite della competizione che stiamo rigenerando.
      if(f.competition_code===competitionCode && f.phase==='Girone') continue;

      const home=teams.find(t=>t.id===f.home_team_id);
      if(!home || !f.scheduled_at) continue;

      let facility='';
      if(typeof facilityKey==='function'){
        facility=facilityKey(home,f.venue||home.home_court)||'';
      }
      if(!facility){
        facility=[
          f.venue||home.home_court,
          home.club_address,
          home.club_city
        ].map(normalizeText).filter(Boolean).join('|');
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

    for(const [home,away] of orientedPairs){
      const occ=occurrenceInRound(anchor,home);

      if(isBlackout(occ,competitionCode)){
        return {
          ok:false,
          reason:`${home.name} giocherebbe in una data esclusa (${occ.dateKey}).`
        };
      }

      const key=conflictKey(occ);

      if(used.has(key)){
        return {
          ok:false,
          reason:`${home.name} e ${used.get(key).name} sarebbero entrambe in casa sullo stesso campo, giorno e ora.`
        };
      }

      if(occupiedExternal.has(key)){
        return {
          ok:false,
          reason:`${home.name} entrerebbe in conflitto con una partita già salvata sullo stesso campo, giorno e ora.`
        };
      }

      used.set(key,home);
    }

    return {ok:true};
  }

  /*
   * Prova soltanto le inversioni casa/trasferta.
   * Con 3 partite in una giornata sono appena 8 combinazioni.
   *
   * Se c'è andata+ritorno, la combinazione viene accettata SOLO se
   * funziona sia all'andata sia nel ritorno speculare.
   */
  function chooseOrientation(rawPairs,firstAnchor,returnAnchor,competitionCode,occupiedExternal,isDouble){
    const count=rawPairs.length;
    const possibilities=1<<count;
    let lastReason='';

    for(let mask=0;mask<possibilities;mask++){
      const first=rawPairs.map(([a,b],i)=>
        (mask&(1<<i)) ? [b,a] : [a,b]
      );

      const checkFirst=validateOrientation(
        first,
        firstAnchor,
        competitionCode,
        occupiedExternal
      );

      if(!checkFirst.ok){
        lastReason=checkFirst.reason;
        continue;
      }

      if(isDouble){
        const second=first.map(([home,away])=>[away,home]);

        const checkReturn=validateOrientation(
          second,
          returnAnchor,
          competitionCode,
          occupiedExternal
        );

        if(!checkReturn.ok){
          lastReason=checkReturn.reason;
          continue;
        }
      }

      return first;
    }

    throw new Error(
      `Nessuna inversione casa/trasferta risolve questa giornata. ${lastReason||''}`
    );
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
      _facility_label:[
        home.home_court,
        home.club_address,
        home.club_city
      ].filter(Boolean).join(' · '),
      _duration_minutes:matchDurationMinutes(home)
    };

    assertHomeRule(fixture);
    return fixture;
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
      throw new Error('Correggi prima i dati delle squadre indicati sopra.');
    }

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

      /*
       * Le date sono matematiche e NON cambiano:
       * G1 = start
       * G2 = start + intervallo
       * G3 = start + 2*intervallo
       * ...
       */
      for(let i=0;i<firstLegCount;i++){
        const firstAnchor=addDays(start,i*intervalWeeks*7);
        const returnAnchor=isDouble
          ? addDays(start,(i+firstLegCount)*intervalWeeks*7)
          : null;

        const chosen=chooseOrientation(
          rawRounds[i],
          firstAnchor,
          returnAnchor,
          code,
          occupiedExternal,
          isDouble
        );

        chosenFirstLeg.push(chosen);
      }

      // ANDATA
      for(let i=0;i<chosenFirstLeg.length;i++){
        const roundNumber=i+1;
        const anchor=addDays(start,i*intervalWeeks*7);

        for(const [home,away] of chosenFirstLeg[i]){
          payload.push(
            makeFixture(group,roundNumber,home,away,anchor,code)
          );
        }
      }

      // RITORNO = specchio esatto dell'andata
      if(isDouble){
        for(let i=0;i<chosenFirstLeg.length;i++){
          const roundNumber=i+1+firstLegCount;
          const anchor=addDays(start,(i+firstLegCount)*intervalWeeks*7);

          for(const [home,away] of chosenFirstLeg[i]){
            payload.push(
              makeFixture(group,roundNumber,away,home,anchor,code)
            );
          }
        }
      }
    }

    /*
     * Controllo finale semplicissimo:
     * nello stesso istante e stesso impianto non possono esserci
     * due squadre di casa diverse.
     */
    const seen=new Map();

    for(const f of payload){
      const key=`${new Date(f.scheduled_at).toISOString()}||${f._facility_key}`;

      if(seen.has(key)){
        const other=seen.get(key);
        throw new Error(
          `Calendario non salvato: ${other._home_name} e ${f._home_name} risultano entrambe in casa sullo stesso campo, giorno e ora.`
        );
      }

      if(occupiedExternal.has(key)){
        throw new Error(
          `Calendario non salvato: ${f._home_name} entra in conflitto con una partita già salvata sullo stesso campo, giorno e ora.`
        );
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

  // Nessuna correzione successiva: il calendario deve nascere già corretto.
  window.autoResolveConflicts=function(payload,competitionCode){
    return {
      resolved:[],
      changed:[],
      unresolved:[],
      remainingFacilityConflicts:[],
      remainingTeamConflicts:[],
      existing:[]
    };
  };

  window.autoFixAllCalendarConflicts=function(){
    return {
      resolved:[],
      changed:[],
      unresolved:[],
      remainingFacilityConflicts:[],
      remainingTeamConflicts:[],
      existing:[]
    };
  };

  window.collectCalendarConflicts=function(){ return []; };
  window.createSuggestionAttempts=function(){ return []; };

  try{
    if(typeof closeConflictAssistant==='function') closeConflictAssistant();
  }catch(_){}

  [...document.querySelectorAll('button')].forEach(btn=>{
    if(/Risolvi automaticamente anomalie/i.test(btn.textContent||'')){
      btn.style.display='none';
    }
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

  console.info('[V9 calendario] Motore semplice 9.3.0 attivo');
})();
