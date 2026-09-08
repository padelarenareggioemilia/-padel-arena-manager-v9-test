/* V9.9.62D - GIORNATE NATURALI + RECUPERI SINGOLI
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
`    /* V9.9.62D: rimosso pre-filtro astratto; restano i conflitti reali. */

`+src.slice(pe);
 }

 /* 62D - BLACKOUT = RECUPERO DELLA SINGOLA GARA
    Il blackout NON deve scartare l'orientazione e NON deve spostare
    l'intera giornata. La giornata resta nel suo anchor naturale.
    Più avanti, buildCalendarPayload mette solo la singola gara
    che cade su blackout nella recoveryQueue. */
 const blackoutBlock=`    /* Se una gara cade su data esclusa, questa orientazione
       NON è valida in questo weekend. */
    if(roundTouchesExcludedDate(fixtures,code)){
      continue;
    }

`;
 if(src.includes(blackoutBlock)){
   src=src.replace(blackoutBlock,'');
 } else {
   throw Error('marker blackout orientazione non trovato');
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
    PRO 62B - ASSEGNAZIONE BINARIA DETERMINISTICA
    Nessun backtracking massivo: con due weekend il problema
    viene trattato come grafo a 2 colori con vincoli unari.
    ========================================================= */
 const buckets=V9_PRO_ANCHORS.map((k,i)=>({
   index:i,
   anchor:fromDateKey(k),
   fixtures:[]
 }));

 /* Candidato di ogni gara nei due weekend */
 const nodes=recoveryQueue.map((item,idx)=>{
   const original=item.fixture;
   const home=teams.find(t=>String(t.id)===String(original.home_team_id));
   const away=teams.find(t=>String(t.id)===String(original.away_team_id));
   if(!home||!away) throw new Error('Dati mancanti per una gara residua.');

   const candidates=buckets.map(bucket=>
     makeFixture(item.group,original.round_number,home,away,bucket.anchor,code)
   );

   const allowed=candidates.map(candidate=>{
     if(v9ForbiddenHome(candidate)) return false;
     if(fixtureFallsOnExcludedDate(candidate,code)) return false;
     /* 62C: nei PRO niente blocchi astratti contro il calendario ordinario.
        Un recupero è vietato solo se:
        - la stessa squadra è già impegnata nello stesso weekend;
        - esiste una reale sovrapposizione di impianto/data/ora. */
     for(const x of external){
       if(v9SameTeam(candidate,x)){
         const dc=new Date(candidate.scheduled_at);
         const dx=new Date(x.scheduled_at);
         const wc=new Date(dc); wc.setDate(dc.getDate()-((dc.getDay()+6)%7));
         const wx=new Date(dx); wx.setDate(dx.getDate()-((dx.getDay()+6)%7));
         if(dateKeyLocal(wc)===dateKeyLocal(wx)) return false;
       }
       if(realFacilityConflict(candidate,x)) return false;
     }
     for(const x of payload){
       if(v9SameTeam(candidate,x)){
         const dc=new Date(candidate.scheduled_at);
         const dx=new Date(x.scheduled_at);
         const wc=new Date(dc); wc.setDate(dc.getDate()-((dc.getDay()+6)%7));
         const wx=new Date(dx); wx.setDate(dx.getDate()-((dx.getDay()+6)%7));
         if(dateKeyLocal(wc)===dateKeyLocal(wx)) return false;
       }
       if(realFacilityConflict(candidate,x)) return false;
     }
     return true;
   });

   if(!allowed[0]&&!allowed[1]){
     throw new Error(
       'Nessuno slot PRO disponibile per '+
       original._home_name+' – '+original._away_name
     );
   }

   return {idx,item,candidates,allowed,edges:new Set()};
 });

 /* Due gare non possono stare nello stesso weekend se:
    - condividono una squadra;
    - usano realmente lo stesso impianto in sovrapposizione.
    Il test viene fatto sul primo weekend: giorno/ora/campo
    restano identici anche nel secondo. */
 for(let i=0;i<nodes.length;i++){
   for(let j=i+1;j<nodes.length;j++){
     const a=nodes[i].candidates[0];
     const b=nodes[j].candidates[0];
     const sameFixture =
       (String(a.home_team_id)===String(b.home_team_id) &&
        String(a.away_team_id)===String(b.away_team_id) &&
        Number(a.round_number)===Number(b.round_number));
     if(!sameFixture && (v9SameTeam(a,b)||realFacilityConflict(a,b))){
       nodes[i].edges.add(j);
       nodes[j].edges.add(i);
     }
   }
 }

 const color=new Array(nodes.length).fill(-1);

 function forceColor(i,c){
   if(!nodes[i].allowed[c]) return false;
   if(color[i]!==-1) return color[i]===c;

   const q=[[i,c]];
   while(q.length){
     const [n,cl]=q.shift();
     if(!nodes[n].allowed[cl]) return false;
     if(color[n]!==-1){
       if(color[n]!==cl) return false;
       continue;
     }
     color[n]=cl;

     for(const e of nodes[n].edges){
       const other=1-cl;
       if(color[e]!==-1 && color[e]===cl) return false;
       if(color[e]===-1) q.push([e,other]);
     }
   }
   return true;
 }

 /* Prima applica i vincoli obbligati da calendario esterno */
 for(let i=0;i<nodes.length;i++){
   if(nodes[i].allowed[0]&&!nodes[i].allowed[1]){
     if(!forceColor(i,0)){
       throw new Error('Conflitto PRO obbligato su '+nodes[i].item.fixture._home_name);
     }
   }else if(!nodes[i].allowed[0]&&nodes[i].allowed[1]){
     if(!forceColor(i,1)){
       throw new Error('Conflitto PRO obbligato su '+nodes[i].item.fixture._home_name);
     }
   }
 }

 /* Componenti libere: prova il colore che bilancia meglio i due weekend.
    In un grafo bipartito basta una propagazione per componente. */
 for(let i=0;i<nodes.length;i++){
   if(color[i]!==-1) continue;

   const snapshot=color.slice();
   const c0=color.filter(x=>x===0).length;
   const c1=color.filter(x=>x===1).length;
   const prefer=c0<=c1?0:1;

   if(!forceColor(i,prefer)){
     for(let k=0;k<color.length;k++) color[k]=snapshot[k];
     if(!forceColor(i,1-prefer)){
       const f=nodes[i].item.fixture;
       throw new Error(
         'Le residue creano un conflitto reale non bipartibile attorno a '+
         f._home_name+' – '+f._away_name
       );
     }
   }
 }

 /* Verifica e assegnazione finale */
 for(let i=0;i<nodes.length;i++){
   const c=color[i];
   if(c<0||!nodes[i].allowed[c]){
     throw new Error('Assegnazione PRO incompleta.');
   }
   buckets[c].fixtures.push(nodes[i].candidates[c]);
 }

 /* Controllo esplicito dentro ogni weekend */
 for(const bucket of buckets){
   for(let i=0;i<bucket.fixtures.length;i++){
     for(let j=i+1;j<bucket.fixtures.length;j++){
       if(v9SameTeam(bucket.fixtures[i],bucket.fixtures[j])){
         throw new Error('Doppio impegno squadra nel weekend PRO.');
       }
       if(realFacilityConflict(bucket.fixtures[i],bucket.fixtures[j])){
         throw new Error('Conflitto reale impianto nel weekend PRO.');
       }
     }
   }
 }

 const states=nodes.length;
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
     'V9.9.62D: blackout sulla singola gara, giornate naturali invariate, PRO con soli conflitti reali sui weekend PRO 19-21/02 e 05-07/03/2027.'
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
       '<b>V9.9.62D GIORNATE NATURALI ATTIVA:</b> le gare residue vengono assegnate ai due weekend PRO con un controllo deterministico dei soli conflitti reali. Niente ricerca da 100.000 tentativi.';
     c.appendChild(n);
   }
 };

 s.onerror=()=>errorBox('errore caricamento motore');
 document.body.appendChild(s);

}catch(e){
 errorBox(e?.message||String(e));
}
})();