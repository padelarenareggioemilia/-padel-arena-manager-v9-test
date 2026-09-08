/* V9.9.62 - GENERATORE GENERALE + DISTRIBUZIONE PRO GLOBALE
   Correzione della 9.9.61:
   - NON tocca andata, ritorno, gironi o vincolo EDEN;
   - raccoglie TUTTE le gare residue;
   - le distribuisce globalmente tra due weekend PRO;
   - usa backtracking: se una scelta blocca una gara successiva, torna indietro;
   - max 1 gara per squadra per weekend PRO;
   - nessun conflitto reale impianto/data/ora.

   Slot PRO attuali validati manualmente:
   PRO1: 19-20-21 febbraio 2027
   PRO2: 05-06-07 marzo 2027
*/
(async function(){
'use strict';

const SOURCE='calendar-v9-clean.js?v=9962base';
const EDEN_IDS=new Set([
 '3371654b-99ca-4135-b28a-582bdc0a41f1',
 'e4939c59-9670-4706-8abc-abb88a60a18f',
 '33a195e2-ad86-488c-9691-1ce188e9a490'
]);
const EDEN_HOME_FROM='2026-11-01';
const PRO_ANCHORS=['2027-02-18','2027-03-04']; // giovedì anchor -> ven/sab/dom 19-21 e 5-7

function errorBox(t){
 const b=document.createElement('div');
 b.style.cssText='position:fixed;left:15px;right:15px;bottom:15px;z-index:99999;padding:14px;border-radius:12px;background:#fdecef;border:1px solid #ce2b37;color:#7b1722;font:600 14px system-ui';
 b.textContent='V9.9.62 non attivata: '+t;
 document.body.appendChild(b);
}

try{
 const r=await fetch(SOURCE,{cache:'no-store'});
 if(!r.ok) throw Error('motore base non disponibile');
 let src=await r.text();

 const base="const pad=n=>String(n).padStart(2,'0');";
 if(!src.includes(base)) throw Error('marker base non trovato');

 src=src.replace(base,base+`
const V9_EDEN_IDS=new Set(${JSON.stringify([...EDEN_IDS])});
const V9_EDEN_HOME_FROM='${EDEN_HOME_FROM}';
const V9_PRO_ANCHORS=${JSON.stringify(PRO_ANCHORS)};

function v9ForbiddenHome(f){
 return !!f &&
   V9_EDEN_IDS.has(String(f.home_team_id)) &&
   String(f._local_date||'').slice(0,10)<V9_EDEN_HOME_FROM;
}

function v9SameTeam(a,b){
 const aa=[String(a.home_team_id),String(a.away_team_id)];
 const bb=[String(b.home_team_id),String(b.away_team_id)];
 return aa.some(x=>bb.includes(x));
}
`);

 const orient=`    const fixtures=pairs.map(([home,away])=>
      makeFixture(group,roundNo,home,away,anchor,code)
    );`;
 if(!src.includes(orient)) throw Error('marker orientazioni non trovato');
 src=src.replace(orient,orient+`

    if(fixtures.some(v9ForbiddenHome)){
      continue;
    }`);

 /* Rimuove falso pre-filtro astratto */
 const ps=src.indexOf('    /* 10.11 - BLOCCO PREVENTIVO:');
 const pe=src.indexOf('    /* Se una gara cade su data esclusa',ps);
 if(ps>=0 && pe>ps){
   src=src.slice(0,ps)+
`    /* V9.9.62: rimosso pre-filtro astratto; restano i conflitti reali. */

`+src.slice(pe);
 }

 /* Ritorno: non fallisce. Le gare problematiche diventano deferred. */
 const a=src.indexOf('function buildReturnLeg({');
 const b=src.indexOf('window.buildCalendarPayload=async function(){',a);
 if(a<0||b<0) throw Error('blocco ritorno non trovato');

 const ret=`function buildReturnLeg({
 group,firstLeg,startAnchor,intervalWeeks,code,external
}){
 const returns=[], deferred=[];
 let anchor=new Date(startAnchor);

 for(let i=0;i<firstLeg.chosen.length;i++){
   const first=firstLeg.chosen[i];
   const roundNo=first.roundNo+firstLeg.totalRounds;
   const raw=first.pairs.map(([home,away])=>
     makeFixture(group,roundNo,away,home,anchor,code)
   );

   const accepted=[];
   for(const f of raw){
     let bad=false;
     if(v9ForbiddenHome(f)) bad=true;
     if(fixtureFallsOnExcludedDate(f,code)) bad=true;
     if(conflictsAny(f,accepted)) bad=true;
     if(!compatibleWithExternal([f],external)) bad=true;

     if(bad) deferred.push({fixture:f,group});
     else accepted.push(f);
   }

   returns.push({roundNo,fixtures:accepted,anchor});
   anchor=addDays(anchor,intervalWeeks*7);
 }
 return {returns,deferred};
}

`;
 src=src.slice(0,a)+ret+src.slice(b);

 const p1=src.indexOf('window.buildCalendarPayload=async function(){');
 const p2=src.indexOf('/* Nessuna vecchia riparazione automatica */',p1);
 if(p1<0||p2<0) throw Error('buildCalendarPayload non trovato');

 const payload=`window.buildCalendarPayload=async function(){
 if(!$id('startDate')?.value) throw new Error('Inserisci la data di partenza.');
 await fetchData();
 if(!groups.length) throw new Error('Prima devi creare i gironi.');
 if(!validateTeams(false)) throw new Error('Completa prima giorno, ora e campo delle squadre.');

 const code=$id('competition').value;
 const isDouble=$id('formula').value==='double';
 const intervalWeeks=Number($id('interval').value||1);
 const start=fromDateKey($id('startDate').value);
 const external=externalFixtures(code);

 const payload=[];
 const recoveryQueue=[];

 for(const group of groups){
   const groupTeams=members
     .filter(m=>String(m.group_id)===String(group.id))
     .map(m=>teams.find(t=>String(t.id)===String(m.team_id)))
     .filter(Boolean);

   if(groupTeams.length<2) continue;

   const firstLeg=solveFirstLeg({
     group,groupTeams,start,intervalWeeks,code,
     external:[...external,...payload]
   });

   for(const r of firstLeg.chosen){
     for(const f of r.firstFixtures){
       let bad=false;
       if(v9ForbiddenHome(f)) bad=true;
       if(fixtureFallsOnExcludedDate(f,code)) bad=true;
       if(conflictsAny(f,payload)) bad=true;
       if(!compatibleWithExternal([f],external)) bad=true;
       if(bad) recoveryQueue.push({fixture:f,group});
       else payload.push(f);
     }
   }

   if(isDouble){
     const last=firstLeg.chosen[firstLeg.chosen.length-1].firstAnchor;
     const built=buildReturnLeg({
       group,firstLeg,
       startAnchor:addDays(last,intervalWeeks*7),
       intervalWeeks,code,
       external:[...external,...payload]
     });

     for(const r of built.returns) payload.push(...r.fixtures);
     recoveryQueue.push(...built.deferred);
   }
 }

 /* =========================================================
    SOLVER GLOBALE PRO
    ========================================================= */
 const buckets=V9_PRO_ANCHORS.map((k,i)=>({
   index:i,
   anchor:fromDateKey(k),
   fixtures:[]
 }));

 function candidatesFor(item){
   const out=[];
   const original=item.fixture;
   const home=teams.find(t=>String(t.id)===String(original.home_team_id));
   const away=teams.find(t=>String(t.id)===String(original.away_team_id));
   if(!home||!away) return out;

   for(let bi=0;bi<buckets.length;bi++){
     const bucket=buckets[bi];
     const candidate=makeFixture(
       item.group,
       original.round_number,
       home,
       away,
       bucket.anchor,
       code
     );

     if(v9ForbiddenHome(candidate)) continue;
     if(fixtureFallsOnExcludedDate(candidate,code)) continue;

     let bad=false;
     for(const x of bucket.fixtures){
       if(v9SameTeam(candidate,x)){bad=true;break;}
       if(realFacilityConflict(candidate,x)){bad=true;break;}
     }
     if(bad) continue;

     if(!compatibleWithExternal([candidate],external)) continue;
     if(conflictsAny(candidate,payload)) continue;

     out.push({bi,candidate});
   }
   return out;
 }

 let states=0;
 const MAX_STATES=100000;

 function solveRecovery(remaining){
   if(!remaining.length) return true;
   if(++states>MAX_STATES) return false;

   /* Most constrained first */
   let bestIndex=-1;
   let bestOptions=null;

   for(let i=0;i<remaining.length;i++){
     const opts=candidatesFor(remaining[i]);
     if(!opts.length) return false;
     if(bestOptions===null || opts.length<bestOptions.length){
       bestIndex=i;
       bestOptions=opts;
       if(opts.length===1) break;
     }
   }

   const item=remaining[bestIndex];
   const next=remaining.slice(0,bestIndex).concat(remaining.slice(bestIndex+1));

   /* Bilancia i due weekend, ma il backtracking può cambiare scelta */
   bestOptions.sort((x,y)=>
     buckets[x.bi].fixtures.length-buckets[y.bi].fixtures.length
   );

   for(const opt of bestOptions){
     buckets[opt.bi].fixtures.push(opt.candidate);

     if(solveRecovery(next)) return true;

     buckets[opt.bi].fixtures.pop();
   }

   return false;
 }

 if(!solveRecovery(recoveryQueue)){
   throw new Error(
     'Le gare residue non sono distribuibili nei due weekend PRO configurati. '+
     'Residue: '+recoveryQueue.length+' · tentativi: '+states
   );
 }

 for(const b of buckets) payload.push(...b.fixtures);

 /* Controllo finale */
 for(let i=0;i<payload.length;i++){
   for(let j=i+1;j<payload.length;j++){
     if(realFacilityConflict(payload[i],payload[j])){
       throw new Error(
         'Conflitto reale finale: '+payload[i]._home_name+' – '+payload[i]._away_name+
         ' / '+payload[j]._home_name+' – '+payload[j]._away_name
       );
     }
   }
 }

 payload.sort((a,b)=>
   (new Date(a.scheduled_at)-new Date(b.scheduled_at)) ||
   (a.round_number-b.round_number)
 );

 window.__v9RecoverySummary={
   total:recoveryQueue.length,
   pro1:buckets[0].fixtures.length,
   pro2:buckets[1].fixtures.length,
   states,
   pro1Anchor:'19-20-21/02/2027',
   pro2Anchor:'05-06-07/03/2027'
 };

 payload._calendarDiagnosis={
   totalMatches:payload.length,
   recoveryMatches:recoveryQueue.length,
   pro1Matches:buckets[0].fixtures.length,
   pro2Matches:buckets[1].fixtures.length,
   conflictsDetected:0,
   conflictsUnresolved:0,
   progression:'OK',
   rule:
     'V9.9.62: distribuzione globale delle residue sui weekend PRO 19-21/02 e 05-07/03/2027.'
 };

 return payload;
};

`;

 src=src.slice(0,p1)+payload+src.slice(p2);

 const blob=new Blob([src],{type:'text/javascript'});
 const url=URL.createObjectURL(blob);
 const s=document.createElement('script');
 s.src=url;

 s.onload=()=>{
   URL.revokeObjectURL(url);
   const c=[...document.querySelectorAll('.card')]
     .find(x=>x.querySelector('#competition'))||document.querySelector('.card');
   if(c){
     const n=document.createElement('div');
     n.className='notice ok';
     n.innerHTML=
       '<b>V9.9.62 PRO GLOBALE ATTIVA:</b> tutte le gare residue vengono distribuite insieme, '+
       'con scambi automatici, tra 19-20-21 febbraio e 5-6-7 marzo 2027. '+
       'Nessuna squadra può giocare due volte nello stesso weekend PRO.';
     c.appendChild(n);
   }
 };

 s.onerror=()=>errorBox('errore caricamento motore');
 document.body.appendChild(s);

}catch(e){
 errorBox(e?.message||String(e));
}
})();