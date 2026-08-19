window.PAM_V9_CONFIG = {
  supabaseUrl: "https://ggnmpzfuqchcwzgaxxzx.supabase.co",
  supabasePublishableKey: "sb_publishable_JJUF1lt3lob4r0z2UBTOiw_2YUjk18m",
  version: "9.1.1-calendar-fix"
};

/*
 * V9 - FIX CALENDARIZZAZIONE CASA/TRASFERTA
 * Regola:
 * - conflitto SOLO quando due gare hanno due squadre di casa
 *   sullo stesso impianto/campo, stesso giorno e stessa ora;
 * - la disponibilità della squadra ospite NON genera conflitto;
 * - nessun anticipo/posticipo di settimane;
 * - risoluzione tramite inversione casa/trasferta della gara
 *   e inversione coordinata della corrispondente gara di ritorno;
 * - diagnosi: conflitti rilevati, risolti, irrisolti.
 *
 * Patch isolata alla sola pagina calendar.html.
 */
(function () {
  const isCalendar = /(^|\/)calendar\.html(?:$|[?#])/i.test(location.pathname + location.search + location.hash)
    || /(^|\/)calendar\.html$/i.test(location.pathname);
  if (!isCalendar) return;

  window.addEventListener('load', function () {
    setTimeout(function installV9CalendarFix() {
      try {
        const sameStart = (a,b) => {
          if (!a?.scheduled_at || !b?.scheduled_at) return false;
          return new Date(a.scheduled_at).getTime() === new Date(b.scheduled_at).getTime();
        };

        const exactFacilityConflict = (a,b) => {
          if (!a || !b || a === b) return false;
          if (!a._facility_key || !b._facility_key) return false;
          return a._facility_key === b._facility_key && sameStart(a,b);
        };

        const uniqueConflictPairs = (payload, existing=[]) => {
          const all = [...payload, ...existing];
          const pairs = [];
          for (let i=0;i<all.length;i++) {
            for (let j=i+1;j<all.length;j++) {
              const a=all[i], b=all[j];
              if (!exactFacilityConflict(a,b)) continue;
              if (!payload.includes(a) && !payload.includes(b)) continue;
              pairs.push({a,b});
            }
          }
          return pairs;
        };

        const snapshot = (m) => m ? {
          home_team_id:m.home_team_id,
          away_team_id:m.away_team_id,
          scheduled_at:m.scheduled_at,
          venue:m.venue,
          _home_name:m._home_name,
          _away_name:m._away_name,
          _configured_day:m._configured_day,
          _configured_time:m._configured_time,
          _local_date:m._local_date,
          _local_time:m._local_time,
          _local_weekday:m._local_weekday,
          _facility_key:m._facility_key,
          _facility_label:m._facility_label,
          _duration_minutes:m._duration_minutes,
          _resolution:m._resolution,
          _manual_exception:m._manual_exception
        } : null;

        const restore = (m,s) => {
          if (!m || !s) return;
          Object.assign(m,s);
        };

        const findReturnFixture = (match,payload) => {
          if (!match) return null;
          return payload.find(x =>
            x !== match &&
            x.group_id === match.group_id &&
            x.home_team_id === match.away_team_id &&
            x.away_team_id === match.home_team_id
          ) || null;
        };

        const applySwap = (match, competitionCode, label) => {
          const candidate = candidateSwapHome(match, competitionCode);
          if (!candidate) return false;
          updateMatchSchedule(
            match,
            candidate.home,
            candidate.away,
            candidate.scheduledAt,
            label
          );
          return true;
        };

        const pairCreatesConflict = (changed, payload, existing) => {
          const all=[...payload,...existing];
          return changed.some(m =>
            all.some(other => other !== m && exactFacilityConflict(m,other))
          );
        };

        const tryCoordinatedSwap = (match,payload,existing,competitionCode) => {
          if (!match) return null;

          const reverse = findReturnFixture(match,payload);
          // Se è andata/ritorno, la compensazione sul ritorno è obbligatoria.
          const doubleFormula = document.getElementById('formula')?.value === 'double';
          if (doubleFormula && !reverse) return null;

          const s1=snapshot(match);
          const s2=snapshot(reverse);

          const oldHome = teamById(match.home_team_id);
          const oldAway = teamById(match.away_team_id);
          const oldRound = match.round_number;

          if (!applySwap(
            match,
            competitionCode,
            `AUTO · inversione casa/trasferta G${oldRound}: ${oldAway?.name||'ospite'} in casa`
          )) return null;

          if (reverse) {
            if (!applySwap(
              reverse,
              competitionCode,
              `AUTO · compensazione ritorno: ${oldHome?.name||'squadra'} in casa`
            )) {
              restore(match,s1);
              restore(reverse,s2);
              return null;
            }
          }

          const changed=[match,reverse].filter(Boolean);
          if (pairCreatesConflict(changed,payload,existing)) {
            restore(match,s1);
            restore(reverse,s2);
            return null;
          }

          return {match,reverse};
        };

        // Sovrascrive il concetto di conflitto: SOLO stesso impianto + stessa identica ora.
        window.hasFacilityConflict = function(match, others) {
          return (others||[]).some(other => exactFacilityConflict(match,other));
        };

        // La disponibilità/occupazione della squadra ospite NON è un criterio di conflitto calendario.
        window.hasTeamConflict = function() {
          return false;
        };

        window.detectFacilityConflicts = function(matches) {
          const list=matches||[];
          const conflicts=[];
          for(let i=0;i<list.length;i++){
            for(let j=i+1;j<list.length;j++){
              if(exactFacilityConflict(list[i],list[j])) conflicts.push({a:list[i],b:list[j]});
            }
          }
          return conflicts;
        };

        window.candidateIsValid = function(candidate,match,working,existing) {
          if(!candidate) return false;
          const test={...match};
          updateMatchSchedule(test,candidate.home,candidate.away,candidate.scheduledAt,'test');
          const others=[
            ...(working||[]).filter(item=>item!==match),
            ...(existing||[])
          ];
          return !hasFacilityConflict(test,others);
        };

        window.collectCalendarConflicts = function(payload,existing) {
          const set=new Set();
          uniqueConflictPairs(payload,existing||[]).forEach(c=>{
            if(payload.includes(c.a)) set.add(c.a);
            if(payload.includes(c.b)) set.add(c.b);
          });
          return [...set];
        };

        window.autoResolveConflicts = function(payload,competitionCode) {
          const existing=(allFixtures||[])
            .filter(f=>!(f.competition_code===competitionCode && f.phase==='Girone'))
            .map(enrichExistingFixture);

          const initialPairs=uniqueConflictPairs(payload,existing);
          const initialCount=initialPairs.length;
          const changed=new Set();

          let safety=Math.max(20,payload.length*4);
          while(safety-->0) {
            const pairs=uniqueConflictPairs(payload,existing);
            if(!pairs.length) break;

            const c=pairs[0];
            let solved=null;

            // Prova prima a invertire la seconda gara del conflitto.
            if(payload.includes(c.b)) {
              solved=tryCoordinatedSwap(c.b,payload,existing,competitionCode);
            }
            // Se non funziona, prova la prima.
            if(!solved && payload.includes(c.a)) {
              solved=tryCoordinatedSwap(c.a,payload,existing,competitionCode);
            }

            if(!solved) break;
            changed.add(solved.match);
            if(solved.reverse) changed.add(solved.reverse);
          }

          const remainingPairs=uniqueConflictPairs(payload,existing);
          const unresolved=[...new Set(
            remainingPairs.flatMap(c=>[c.a,c.b]).filter(m=>payload.includes(m))
          )];

          const solvedConflicts=Math.max(0,initialCount-remainingPairs.length);

          payload._calendarDiagnosis={
            totalMatches:payload.length,
            conflictsDetected:initialCount,
            conflictsSolved:solvedConflicts,
            conflictsUnresolved:remainingPairs.length,
            changedMatches:changed.size
          };

          return {
            resolved:[...changed],
            changed:[...changed],
            unresolved,
            remainingFacilityConflicts:remainingPairs,
            remainingTeamConflicts:[],
            existing,
            conflictsDetected:initialCount,
            conflictsSolved:solvedConflicts,
            conflictsUnresolved:remainingPairs.length
          };
        };

        window.autoFixAllCalendarConflicts = function(payload,competitionCode,existingOverride) {
          const existing=existingOverride || (allFixtures||[])
            .filter(f=>!(f.competition_code===competitionCode && f.phase==='Girone'))
            .map(enrichExistingFixture);

          const initialPairs=uniqueConflictPairs(payload,existing);
          const changed=new Set();

          let safety=Math.max(20,payload.length*4);
          while(safety-->0) {
            const pairs=uniqueConflictPairs(payload,existing);
            if(!pairs.length) break;
            const c=pairs[0];

            let solved=null;
            if(payload.includes(c.b)) solved=tryCoordinatedSwap(c.b,payload,existing,competitionCode);
            if(!solved && payload.includes(c.a)) solved=tryCoordinatedSwap(c.a,payload,existing,competitionCode);

            if(!solved) break;
            changed.add(solved.match);
            if(solved.reverse) changed.add(solved.reverse);
          }

          const remainingPairs=uniqueConflictPairs(payload,existing);
          const unresolved=[...new Set(
            remainingPairs.flatMap(c=>[c.a,c.b]).filter(m=>payload.includes(m))
          )];
          const solvedConflicts=Math.max(0,initialPairs.length-remainingPairs.length);

          payload._calendarDiagnosis={
            totalMatches:payload.length,
            conflictsDetected:initialPairs.length,
            conflictsSolved:solvedConflicts,
            conflictsUnresolved:remainingPairs.length,
            changedMatches:changed.size
          };

          return {
            changed:[...changed],
            resolved:[...changed],
            unresolved,
            remainingFacilityConflicts:remainingPairs,
            remainingTeamConflicts:[],
            existing,
            conflictsDetected:initialPairs.length,
            conflictsSolved:solvedConflicts,
            conflictsUnresolved:remainingPairs.length
          };
        };

        window.showAutoFixSummary = function(result,payload) {
          const d=payload?._calendarDiagnosis || {
            totalMatches:payload?.length||0,
            conflictsDetected:result?.conflictsDetected||0,
            conflictsSolved:result?.conflictsSolved||0,
            conflictsUnresolved:result?.conflictsUnresolved||0
          };

          const base =
            `Diagnosi calendario: ${d.totalMatches} partite analizzate · `+
            `${d.conflictsDetected} conflitti campo rilevati · `+
            `${d.conflictsSolved} risolti automaticamente · `+
            `${d.conflictsUnresolved} non risolti.`;

          if(d.conflictsUnresolved===0) {
            msg(`✅ ${base} Nessuna partita è stata spostata di settimana.`);
          } else {
            msg(
              `⚠️ ${base} I conflitti residui richiedono una scelta manuale. `+
              `Nessuna partita è stata spostata automaticamente di settimana.`,
              true
            );
          }
        };

        // Elimina dai testi diagnostici ogni riferimento a disponibilità della squadra ospite
        // o ricerca di settimane precedenti/successive.
        window.explainConflict = function(match,payload,existing) {
          const home=teamById(match.home_team_id);
          const away=teamById(match.away_team_id);
          const all=[...(payload||[]).filter(x=>x!==match),...(existing||[])];
          const same=all.filter(other=>exactFacilityConflict(match,other));
          const reasons=[];
          if(same.length){
            reasons.push(
              `Conflitto campo: ${home?.name||'Squadra di casa'} condivide stesso impianto, giorno e ora con `+
              same.map(x=>`${x._home_name} – ${x._away_name}`).join(', ')+'.'
            );
          } else {
            reasons.push('Nessun conflitto campo reale rilevato.');
          }
          if(away) reasons.push(`${away.name} è in trasferta: la sua disponibilità abituale non viene considerata.`);
          return {
            reasons,
            checks:[
              'Stesso impianto/campo',
              'Stesso giorno e stessa ora',
              'Inversione coordinata casa/trasferta',
              'Compensazione automatica nella gara di ritorno'
            ]
          };
        };

        console.info('[V9 calendario] Fix casa/trasferta installato');
      } catch (e) {
        console.error('[V9 calendario] Errore installazione fix', e);
      }
    }, 0);
  });
})();

/* V9 - TASTO ELIMINA TUTTE LE PARTITE DELLA COMPETIZIONE SELEZIONATA */
(function(){
  const isCalendar = /(^|\/)calendar\.html(?:$|[?#])/i.test(location.pathname + location.search + location.hash)
    || /(^|\/)calendar\.html$/i.test(location.pathname);
  if(!isCalendar) return;

  window.addEventListener('load', function(){
    setTimeout(function(){
      try{
        const actions = document.querySelector('section.card .actions');
        if(!actions || document.getElementById('deleteAllFixturesBtn')) return;

        const btn = document.createElement('button');
        btn.id = 'deleteAllFixturesBtn';
        btn.className = 'btn danger';
        btn.type = 'button';
        btn.textContent = '🗑 Elimina tutte le partite';
        actions.appendChild(btn);

        btn.addEventListener('click', async function(){
          try{
            const code = document.getElementById('competition')?.value;
            if(!code) return alert('Seleziona prima una competizione.');

            const label = document.getElementById('competition')?.selectedOptions?.[0]?.textContent || code;

            const first = confirm(
              `ATTENZIONE\n\nStai per eliminare TUTTE le partite di ${label}.\n`+
              `L'operazione non può essere annullata.\n\nVuoi continuare?`
            );
            if(!first) return;

            const typed = prompt(
              `Per confermare definitivamente l'eliminazione di tutte le partite di ${label}, `+
              `scrivi ELIMINA`
            );
            if(typed !== 'ELIMINA') {
              alert('Eliminazione annullata.');
              return;
            }

            btn.disabled = true;
            btn.textContent = 'Eliminazione in corso…';

            const res = await s.from('fixtures').delete().eq('competition_code', code);
            if(res.error) throw res.error;

            pendingCalendar = [];
            fixtures = [];
            allFixtures = (allFixtures || []).filter(f => f.competition_code !== code);

            if(typeof clearCalendarPreview === 'function') clearCalendarPreview();
            if(typeof loadFixtures === 'function') await loadFixtures();

            if(typeof msg === 'function'){
              msg(`✅ Tutte le partite di ${label} sono state eliminate.`);
            } else {
              alert(`Tutte le partite di ${label} sono state eliminate.`);
            }
          }catch(err){
            console.error(err);
            if(typeof msg === 'function'){
              msg('Errore durante l’eliminazione: '+(err?.message || String(err)), true);
            } else {
              alert('Errore durante l’eliminazione: '+(err?.message || String(err)));
            }
          }finally{
            btn.disabled = false;
            btn.textContent = '🗑 Elimina tutte le partite';
          }
        });
      }catch(e){
        console.error('[V9 calendario] errore tasto elimina tutte le partite', e);
      }
    },0);
  });
})();

/* V9 - FIX PROGRESSIONE GIORNATE: UNA GIORNATA = UNA SETTIMANA */
(function(){
  const isCalendar = /(^|\/)calendar\.html(?:$|[?#])/i.test(location.pathname + location.search + location.hash)
    || /(^|\/)calendar\.html$/i.test(location.pathname);
  if(!isCalendar) return;

  window.addEventListener('load', function(){
    setTimeout(function(){
      try{
        /*
         * Sostituisce la generazione del calendario con una progressione rigida:
         * G1 = offset 0
         * G2 = offset 1
         * ...
         * ritorno = continua dopo l'ultima giornata di andata
         * Nessuna giornata può condividere lo stesso offset/settimana.
         */
        window.buildCalendarPayload = async function(){
          if(!$('startDate').value) throw new Error('Inserisci la data di partenza.');
          await fetchData();
          if(!groups.length) throw new Error('Prima devi creare i gironi.');
          if(!validateTeams(false)) throw new Error('Correggi prima i dati delle squadre indicati sopra.');

          const formula=$('formula').value;
          const intervalWeeks=Number($('interval').value);
          const code=$('competition').value;
          const payload=[];

          let globalRoundNumber = 1;
          let globalRoundOffset = 0;

          for(const group of groups){
            const groupTeams=members
              .filter(member=>member.group_id===group.id)
              .map(member=>teams.find(team=>team.id===member.team_id))
              .filter(Boolean);

            const rounds=roundRobin(groupTeams);

            // ANDATA: ogni giornata usa un offset distinto e progressivo.
            rounds.forEach((pairs,index)=>{
              const roundNumber = globalRoundNumber++;
              const roundOffset = globalRoundOffset++;

              pairs.forEach(([home,away])=>{
                const homeSchedule=scheduleHomeFixture(
                  $('startDate').value,
                  home,
                  roundOffset,
                  code,
                  intervalWeeks
                );
                const local=localPartsFromISO(homeSchedule.scheduledAt);

                payload.push({
                  competition_code:code,
                  phase:'Girone',
                  group_id:group.id,
                  round_number:roundNumber,
                  home_team_id:home.id,
                  away_team_id:away.id,
                  scheduled_at:homeSchedule.scheduledAt,
                  venue:homeSchedule.venue,
                  _home_name:home.name,
                  _away_name:away.name,
                  _configured_day:home.home_match_day,
                  _configured_time:homeSchedule.configuredTime,
                  _local_date:local.date,
                  _local_time:local.time,
                  _local_weekday:local.weekday,
                  _facility_key:facilityKey(home,home.home_court),
                  _facility_label:[home.home_court,home.club_address,home.club_city].filter(Boolean).join(' · '),
                  _duration_minutes:matchDurationMinutes(home)
                });

                assertHomeRule(payload[payload.length-1]);
              });
            });

            // RITORNO: continua DOPO l'ultima giornata di andata.
            if(formula==='double'){
              rounds.forEach((pairs,index)=>{
                const roundNumber = globalRoundNumber++;
                const roundOffset = globalRoundOffset++;

                pairs.forEach(([first,second])=>{
                  const home=second;
                  const away=first;

                  const homeSchedule=scheduleHomeFixture(
                    $('startDate').value,
                    home,
                    roundOffset,
                    code,
                    intervalWeeks
                  );
                  const local=localPartsFromISO(homeSchedule.scheduledAt);

                  payload.push({
                    competition_code:code,
                    phase:'Girone',
                    group_id:group.id,
                    round_number:roundNumber,
                    home_team_id:home.id,
                    away_team_id:away.id,
                    scheduled_at:homeSchedule.scheduledAt,
                    venue:homeSchedule.venue,
                    _home_name:home.name,
                    _away_name:away.name,
                    _configured_day:home.home_match_day,
                    _configured_time:homeSchedule.configuredTime,
                    _local_date:local.date,
                    _local_time:local.time,
                    _local_weekday:local.weekday,
                    _facility_key:facilityKey(home,home.home_court),
                    _facility_label:[home.home_court,home.club_address,home.club_city].filter(Boolean).join(' · '),
                    _duration_minutes:matchDurationMinutes(home)
                  });

                  assertHomeRule(payload[payload.length-1]);
                });
              });
            }
          }

          // Progressione già garantita matematicamente da roundOffset:
          // ogni nuova giornata incrementa l'offset di 1 e scheduleHomeFixture
          // applica intervalWeeks. Non confrontiamo le date effettive delle singole
          // gare, perché squadre diverse possono avere giorni casalinghi diversi.
          const roundNumbers=[...new Set(payload.map(m=>m.round_number))].sort((a,b)=>a-b);

          const resolution=autoResolveConflicts(payload,code);

          if(
            resolution.unresolved.length ||
            resolution.remainingFacilityConflicts.length
          ){
            const conflictMatch=
              resolution.unresolved[0] ||
              resolution.remainingFacilityConflicts[0]?.a;

            const attempts=createSuggestionAttempts(
              conflictMatch,
              payload,
              resolution.existing||[],
              code
            );

            openConflictAssistant(
              conflictMatch,
              payload,
              resolution.existing||[],
              attempts
            );

            const err=new Error('CONFLICT_ASSISTANT_OPENED');
            err.isConflictAssistant=true;
            throw err;
          }

          auditHomeAwayRules(payload);

          payload._resolvedCount=resolution.resolved.length;
          payload._calendarDiagnosis={
            ...(payload._calendarDiagnosis||{}),
            totalRounds:roundNumbers.length,
            progression:'OK'
          };

          return payload;
        };

        console.info('[V9 calendario] Fix progressione giornate installato');
      }catch(e){
        console.error('[V9 calendario] errore fix progressione giornate', e);
      }
    },0);
  });
})();

/* V9 - FIX ASSISTENTE CONFLITTI: NIENTE ANTICIPI/POSTICIPI */
(function(){
  const isCalendar = /(^|\/)calendar\.html(?:$|[?#])/i.test(location.pathname + location.search + location.hash)
    || /(^|\/)calendar\.html$/i.test(location.pathname);
  if(!isCalendar) return;

  window.addEventListener('load', function(){
    setTimeout(function(){
      try{
        /*
         * L'assistente può proporre SOLO:
         * 1) inversione coordinata casa/trasferta;
         * 2) compensazione automatica della gara di ritorno.
         * Non propone MAI anticipi/posticipi.
         */
        window.createSuggestionAttempts = function(match,payload,existing,competitionCode){
          const attempts=[];
          if(!match) return attempts;

          const home=teamById(match.home_team_id);
          const away=teamById(match.away_team_id);
          const reverse=(payload||[]).find(x =>
            x!==match &&
            x.group_id===match.group_id &&
            x.home_team_id===match.away_team_id &&
            x.away_team_id===match.home_team_id
          );

          const swap=candidateSwapHome(match,competitionCode);
          let ok=false;
          let reason='';

          if(!swap){
            reason='Impossibile costruire l’inversione casa/trasferta.';
          }else if(document.getElementById('formula')?.value==='double' && !reverse){
            reason='Non è stata trovata la corrispondente gara di ritorno da compensare.';
          }else{
            const test={...match};
            try{
              updateMatchSchedule(test,swap.home,swap.away,swap.scheduledAt,'test');
              const others=[
                ...(payload||[]).filter(x=>x!==match && x!==reverse),
                ...(existing||[])
              ];
              ok=!hasFacilityConflict(test,others);

              if(ok && reverse){
                const reverseSwap=candidateSwapHome(reverse,competitionCode);
                if(!reverseSwap){
                  ok=false;
                  reason='La gara di ritorno non può essere compensata.';
                }else{
                  const testReturn={...reverse};
                  updateMatchSchedule(
                    testReturn,
                    reverseSwap.home,
                    reverseSwap.away,
                    reverseSwap.scheduledAt,
                    'test ritorno'
                  );
                  const returnOthers=[
                    ...(payload||[]).filter(x=>x!==match && x!==reverse),
                    test,
                    ...(existing||[])
                  ];
                  if(hasFacilityConflict(testReturn,returnOthers)){
                    ok=false;
                    reason='L’inversione risolve l’andata ma crea un conflitto nella gara di ritorno.';
                  }
                }
              }

              if(!ok && !reason){
                reason='L’inversione casa/trasferta crea un altro conflitto sul campo.';
              }
            }catch(e){
              ok=false;
              reason=e?.message||String(e);
            }
          }

          attempts.push({
            title:'Inverti casa/trasferta + compensa ritorno',
            ok,
            description: reverse
              ? `${away?.name||'Squadra ospite'} gioca in casa in questa gara; nel ritorno ${home?.name||'Squadra'} torna automaticamente in casa. Nessuna settimana viene spostata.`
              : `${away?.name||'Squadra ospite'} gioca in casa. Nessuna settimana viene spostata.`,
            reason,
            _v9CoordinatedSwap:true
          });

          return attempts;
        };

        const oldApply=window.applySuggestedConflictSolution;
        window.applySuggestedConflictSolution = function(index){
          try{
            const ctx=activeConflict;
            const attempt=ctx?.attempts?.[index];
            if(!ctx || !attempt) return;

            if(!attempt._v9CoordinatedSwap){
              return oldApply ? oldApply(index) : undefined;
            }
            if(!attempt.ok){
              if(typeof assistantMsg==='function'){
                assistantMsg(attempt.reason||'Soluzione non applicabile.',true);
              }
              return;
            }

            const match=ctx.match;
            const payload=ctx.payload||[];
            const existing=ctx.existing||[];
            const code=document.getElementById('competition')?.value;
            const reverse=payload.find(x =>
              x!==match &&
              x.group_id===match.group_id &&
              x.home_team_id===match.away_team_id &&
              x.away_team_id===match.home_team_id
            );

            const s1={...match};
            const s2=reverse?{...reverse}:null;

            const swap=candidateSwapHome(match,code);
            updateMatchSchedule(
              match,swap.home,swap.away,swap.scheduledAt,
              'MANUALE · inversione coordinata casa/trasferta'
            );

            if(reverse){
              const rs=candidateSwapHome(reverse,code);
              updateMatchSchedule(
                reverse,rs.home,rs.away,rs.scheduledAt,
                'MANUALE · compensazione automatica ritorno'
              );
            }

            const changed=[match,reverse].filter(Boolean);
            const all=[...payload,...existing];
            const bad=changed.some(m=>all.some(o=>o!==m && hasFacilityConflict(m,[o])));
            if(bad){
              Object.assign(match,s1);
              if(reverse&&s2)Object.assign(reverse,s2);
              if(typeof assistantMsg==='function'){
                assistantMsg('Inversione annullata: creerebbe un altro conflitto campo.',true);
              }
              return;
            }

            pendingCalendar=payload;
            closeConflictAssistant();
            if(typeof renderPendingCalendar==='function')renderPendingCalendar();

            const remaining=collectCalendarConflicts(payload,existing);
            if(remaining.length){
              const next=remaining[0];
              const nextAttempts=createSuggestionAttempts(next,payload,existing,code);
              openConflictAssistant(next,payload,existing,nextAttempts);
              if(typeof assistantMsg==='function'){
                assistantMsg(`Inversione applicata. Restano ${remaining.length} partite coinvolte in conflitti campo.`,true);
              }
            }else if(typeof msg==='function'){
              msg('✅ Conflitti campo risolti senza spostare nessuna partita di settimana.');
            }
          }catch(e){
            console.error(e);
            if(typeof assistantMsg==='function')assistantMsg(e?.message||String(e),true);
          }
        };

        console.info('[V9 calendario] Assistente conflitti senza anticipi/posticipi installato');
      }catch(e){
        console.error('[V9 calendario] errore fix assistente conflitti',e);
      }
    },0);
  });
})();
