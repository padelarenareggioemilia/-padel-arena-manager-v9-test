/*
 AICS PADEL CHAMPIONSHIP MANAGER V9
 MOTORE CALENDARIO PULITO 9.2.0

 REGOLE:
 - ogni giornata è un blocco temporale;
 - l'intervallo tra giornate è rigido;
 - una sospensione/festività sposta l'intera giornata;
 - solo la squadra di casa determina giorno, ora e campo;
 - squadre con stesso campo+giorno+ora vengono alternate:
   in ogni giornata una è in casa e l'altra in trasferta;
 - il ritorno è lo specchio esatto dell'andata;
 - nessun anticipo/posticipo automatico di singole partite;
 - nessun assistente di "riparazione" per questi conflitti.
*/
(function(){
  'use strict';

  const $id = id => document.getElementById(id);
  const DAY_MS = 24*60*60*1000;

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

  /*
   * Identifica lo SLOT CASALINGO.
   * Due squadre hanno lo stesso slot se usano lo stesso impianto/campo,
   * lo stesso giorno e la stessa ora.
   */
  function homeSlotKey(team){
    if(!team) return '';

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

    return [
      facility,
      normalizeText(team.home_match_day),
      normalizeTime(team.home_match_time)||''
    ].join('||');
  }

  function sharedSlotGroups(teamList){
    const map=new Map();
    for(const team of teamList){
      const key=homeSlotKey(team);
      if(!key) continue;
      if(!map.has(key)) map.set(key,[]);
      map.get(key).push(team.id);
    }
    return [...map.entries()]
      .filter(([,ids])=>ids.length>1)
      .map(([key,ids])=>({key,ids:new Set(ids)}));
  }

  /*
   * Questa è la regola fondamentale.
   *
   * Per ogni giornata proviamo tutte le possibili orientazioni delle partite.
   * Con 6 squadre sono 3 partite => solo 8 combinazioni.
   *
   * Per ogni gruppo di squadre che condivide lo stesso slot:
   * - non possono essere due contemporaneamente in casa;
   * - in andata/ritorno non possono essere due contemporaneamente in trasferta,
   *   altrimenti nel ritorno sarebbero entrambe in casa.
   *
   * Con due squadre che condividono il campo significa semplicemente:
   * UNA CASA + UNA TRASFERTA, in ogni giornata.
   */
  function orientRoundSafely(pairs,slotGroups,isDouble){
    const count=pairs.length;
    const possibilities=1<<count;

    for(let mask=0;mask<possibilities;mask++){
      const oriented=pairs.map(([a,b],i)=>
        (mask&(1<<i)) ? [b,a] : [a,b]
      );

      let valid=true;

      for(const group of slotGroups){
        let homes=0;
        let aways=0;

        for(const [home,away] of oriented){
          if(group.ids.has(home.id)) homes++;
          if(group.ids.has(away.id)) aways++;
        }

        // Un solo campo/slot: massimo una squadra del gruppo può essere in casa.
        if(homes>1){
          valid=false;
          break;
        }

        // Se c'è ritorno, anche il lato "trasferta" deve essere unico:
        // al ritorno diventerà il lato casa.
        if(isDouble && aways>1){
          valid=false;
          break;
        }
      }

      if(valid) return oriented;
    }

    throw new Error(
      'Impossibile costruire la giornata rispettando l’alternanza casa/trasferta delle squadre che condividono lo stesso campo.'
    );
  }

  function nextHomeOccurrence(anchor,team){
    const target=dayIndex(team.home_match_day);
    const time=normalizeTime(team.home_match_time);

    if(target===undefined || !time){
      throw new Error(`Dati giorno/orario incompleti per ${team.name}`);
    }

    const d=new Date(anchor.getFullYear(),anchor.getMonth(),anchor.getDate(),12,0,0,0);

    let guard=0;
    while(d.getDay()!==target && guard++<7){
      d.setDate(d.getDate()+1);
    }

    return {
      date:d,
      key:dateKeyLocal(d),
      time
    };
  }

  function dateIsBlackout(key,competitionCode){
    return (blackouts||[]).some(b =>
      b.blackout_date===key &&
      (b.competition_code==='ALL' || b.competition_code===competitionCode)
    );
  }

  /*
   * Se anche UNA partita della giornata cade su una data esclusa,
   * spostiamo l'INTERA giornata di una settimana.
   */
  function allowedRoundAnchor(orientedPairs,desiredAnchor,competitionCode){
    let anchor=new Date(
      desiredAnchor.getFullYear(),
      desiredAnchor.getMonth(),
      desiredAnchor.getDate(),
      12,0,0,0
    );

    for(let safety=0;safety<60;safety++){
      const blocked=orientedPairs.some(([home])=>{
        const slot=nextHomeOccurrence(anchor,home);
        return dateIsBlackout(slot.key,competitionCode);
      });

      if(!blocked) return anchor;
      anchor=addDays(anchor,7);
    }

    throw new Error('Impossibile collocare la giornata: troppe date escluse consecutive.');
  }

  function makeFixture(group,roundNumber,home,away,roundAnchor,competitionCode){
    const slot=nextHomeOccurrence(roundAnchor,home);
    const scheduledAt=localDateTimeToISO(slot.key,slot.time);
    const local=localPartsFromISO(scheduledAt);

    const fixture={
      competition_code:competitionCode,
      phase:'Girone',
      group_id:group.id,
      round_number:roundNumber,
      home_team_id:home.id,
      away_team_id:away.id,
      scheduled_at:scheduledAt,
      venue:home.home_court,
      _home_name:home.name,
      _away_name:away.name,
      _configured_day:home.home_match_day,
      _configured_time:slot.time,
      _local_date:local.date,
      _local_time:local.time,
      _local_weekday:local.weekday,
      _facility_key:facilityKey(home,home.home_court),
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

  function sameFacilityMoment(a,b){
    if(!a||!b) return false;
    if(!a._facility_key || a._facility_key!==b._facility_key) return false;
    return new Date(a.scheduled_at).getTime()===new Date(b.scheduled_at).getTime();
  }

  /*
   * NUOVO GENERATORE.
   * Non chiama autoResolveConflicts: il calendario deve nascere corretto.
   */
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

    for(const group of groups){
      const groupTeams=members
        .filter(m=>m.group_id===group.id)
        .map(m=>teams.find(t=>t.id===m.team_id))
        .filter(Boolean);

      const groupsSharing=sharedSlotGroups(groupTeams);
      const raw=roundRobin(groupTeams);

      // Orientiamo l'ANDATA una volta sola.
      // La regola "home unico + away unico" garantisce anche il ritorno.
      const firstLeg=raw.map(round=>
        orientRoundSafely(round,groupsSharing,isDouble)
      );

      const allRounds=[
        ...firstLeg,
        ...(isDouble
          ? firstLeg.map(round=>round.map(([home,away])=>[away,home]))
          : [])
      ];

      let previousAnchor=null;

      for(let index=0;index<allRounds.length;index++){
        const roundNumber=index+1;
        const pairs=allRounds[index];

        // G1 parte dalla data iniziale.
        // Ogni nuova giornata parte dalla POSIZIONE REALE della precedente
        // + intervallo. Quindi G7 e G8 non possono mai collassare insieme.
        const desiredAnchor=previousAnchor===null
          ? start
          : addDays(previousAnchor,intervalWeeks*7);

        const anchor=allowedRoundAnchor(pairs,desiredAnchor,code);

        for(const [home,away] of pairs){
          payload.push(
            makeFixture(group,roundNumber,home,away,anchor,code)
          );
        }

        previousAnchor=anchor;
      }
    }

    /*
     * Verifica finale: stesso campo + stesso istante nello stesso turno.
     * Se succede, non apriamo nessun assistente: blocchiamo il salvataggio
     * perché significherebbe che il generatore non ha rispettato la regola.
     */
    const conflicts=[];
    for(let i=0;i<payload.length;i++){
      for(let j=i+1;j<payload.length;j++){
        const a=payload[i],b=payload[j];

        if(a.group_id!==b.group_id) continue;
        if(a.round_number!==b.round_number) continue;

        if(sameFacilityMoment(a,b)){
          conflicts.push({a,b});
        }
      }
    }

    if(conflicts.length){
      const c=conflicts[0];
      throw new Error(
        `ERRORE GENERATORE: ${c.a._home_name} e ${c.b._home_name} risultano ancora in casa sullo stesso campo e orario. Calendario non salvato.`
      );
    }

    payload._calendarDiagnosis={
      totalMatches:payload.length,
      conflictsDetected:0,
      conflictsSolved:0,
      conflictsUnresolved:0,
      progression:'OK'
    };

    return payload;
  };

  /*
   * Disattiviamo completamente la vecchia riparazione automatica:
   * niente inversioni tardive, niente ± settimane.
   */
  window.autoResolveConflicts=function(payload,competitionCode){
    const existing=(allFixtures||[])
      .filter(f=>!(f.competition_code===competitionCode && f.phase==='Girone'))
      .map(enrichExistingFixture);

    return {
      resolved:[],
      changed:[],
      unresolved:[],
      remainingFacilityConflicts:[],
      remainingTeamConflicts:[],
      existing
    };
  };

  window.autoFixAllCalendarConflicts=function(payload,competitionCode,existingOverride){
    return {
      resolved:[],
      changed:[],
      unresolved:[],
      remainingFacilityConflicts:[],
      remainingTeamConflicts:[],
      existing:existingOverride||[]
    };
  };

  window.collectCalendarConflicts=function(){ return []; };
  window.createSuggestionAttempts=function(){ return []; };

  /*
   * Se per qualsiasi motivo il vecchio assistente fosse ancora aperto
   * da uno stato precedente, lo chiudiamo.
   */
  try{
    if(typeof closeConflictAssistant==='function') closeConflictAssistant();
  }catch(_){}

  /*
   * Nasconde il vecchio pulsante "Risolvi automaticamente anomalie".
   */
  [...document.querySelectorAll('button')].forEach(btn=>{
    if(/Risolvi automaticamente anomalie/i.test(btn.textContent||'')){
      btn.style.display='none';
    }
  });

  /*
   * Sostituisce il vecchio testo che descriveva inversioni e spostamenti.
   */
  [...document.querySelectorAll('.notice')].forEach(box=>{
    if(/primo slot futuro|inversione casa\/trasferta|accavallamenti/i.test(box.textContent||'')){
      box.innerHTML=
        '<b>Regola calendario:</b> la giornata viene costruita già correttamente. '+
        'Le squadre che condividono campo, giorno e ora vengono alternate automaticamente '+
        '<b>una in casa e una in trasferta</b>. Il ritorno è speculare. '+
        'Nessuna singola partita viene spostata automaticamente di settimana.';
    }
  });

  /*
   * TASTO ELIMINA TUTTE LE PARTITE con doppia conferma.
   */
  const actions=document.querySelector('section.card .actions');
  if(actions && !document.getElementById('deleteAllFixturesBtn')){
    const btn=document.createElement('button');
    btn.id='deleteAllFixturesBtn';
    btn.className='btn danger';
    btn.type='button';
    btn.textContent='🗑 Elimina tutte le partite';
    actions.appendChild(btn);

    btn.addEventListener('click',async function(){
      const code=$id('competition')?.value;
      if(!code) return;

      const label=$id('competition')?.selectedOptions?.[0]?.textContent||code;

      if(!confirm(
        `ATTENZIONE\n\nStai per eliminare TUTTE le partite di ${label}.\n\nVuoi continuare?`
      )){
        return;
      }

      if(prompt(
        `Seconda conferma: scrivi ELIMINA per cancellare tutte le partite di ${label}.`
      )!=='ELIMINA'){
        return;
      }

      try{
        btn.disabled=true;
        btn.textContent='Eliminazione in corso…';

        const res=await s.from('fixtures')
          .delete()
          .eq('competition_code',code);

        if(res.error) throw res.error;

        pendingCalendar=[];
        fixtures=[];
        allFixtures=(allFixtures||[])
          .filter(f=>f.competition_code!==code);

        if(typeof clearCalendarPreview==='function'){
          clearCalendarPreview();
        }

        await fetchData();
        if(typeof renderFixtures==='function'){
          renderFixtures();
        }

        msg(`✅ Tutte le partite di ${label} sono state eliminate.`);
      }catch(e){
        msg(
          `Errore durante l’eliminazione: ${e?.message||String(e)}`,
          true
        );
      }finally{
        btn.disabled=false;
        btn.textContent='🗑 Elimina tutte le partite';
      }
    });
  }

  console.info('[V9 calendario] Motore pulito 9.2.0 caricato.');
})();
