/* V9.9.63 - RECUPERI A BLOCCHI DI GIORNATA
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
    V9.9.63 - PRO A BLOCCHI DI GIORNATA
    Le gare residue NON vengono colorate singolarmente.
    Restano unite per girone + giornata originaria.
    Ogni blocco va interamente in PRO1 oppure PRO2.
    ========================================================= */
 const buckets=V9_PRO_ANCHORS.map((k,i)=>({
   index:i,
   anchor:fromDateKey(k),
   fixtures:[]
 }));

 /* Raggruppa le residue per GIRONE + GIORNATA ORIGINARIA */
 const blockMap=new Map();
 for(const item of recoveryQueue){
   const f=item.fixture;
   const key=String(item.group.id)+'|'+String(f.round_number);
   if(!blockMap.has(key)){
     blockMap.set(key,{
       key,
       group:item.group,
       roundNo:Number(f.round_number),
       items:[]
     });
   }
   blockMap.get(key).items.push(item);
 }

 const blocks=[...blockMap.values()].map((block,idx)=>{
   const candidates=buckets.map(bucket=>
     block.items.map(item=>{
       const original=item.fixture;
       const home=teams.find(t=>String(t.id)===String(original.home_team_id));
       const away=teams.find(t=>String(t.id)===String(original.away_team_id));
       if(!home||!away) throw new Error('Dati mancanti per una gara residua.');
       return makeFixture(
         block.group,
         original.round_number,
         home,
         away,
         bucket.anchor,
         code
       );
     })
   );

   const allowed=candidates.map(fixtures=>{
     /* controllo interno al blocco */
     for(let i=0;i<fixtures.length;i++){
       const f=fixtures[i];
       if(v9ForbiddenHome(f)) return false;
       if(fixtureFallsOnExcludedDate(f,code)) return false;

       for(let j=i+1;j<fixtures.length;j++){
         const g=fixtures[j];
         if(v9SameTeam(f,g)) return false;
         if(realFacilityConflict(f,g)) return false;
       }

       /* confronto con competizioni esterne e calendario ordinario */
       for(const x of external){
         if(v9SameTeam(f,x)){
           const df=new Date(f.scheduled_at);
           const dx=new Date(x.scheduled_at);
           const wf=new Date(df); wf.setDate(df.getDate()-((df.getDay()+6)%7));
           const wx=new Date(dx); wx.setDate(dx.getDate()-((dx.getDay()+6)%7));
           if(dateKeyLocal(wf)===dateKeyLocal(wx)) return false;
         }
         if(realFacilityConflict(f,x)) return false;
       }

       for(const x of payload){
         if(v9SameTeam(f,x)){
           const df=new Date(f.scheduled_at);
           const dx=new Date(x.scheduled_at);
           const wf=new Date(df); wf.setDate(df.getDate()-((df.getDay()+6)%7));
           const wx=new Date(dx); wx.setDate(dx.getDate()-((dx.getDay()+6)%7));
           if(dateKeyLocal(wf)===dateKeyLocal(wx)) return false;
         }
         if(realFacilityConflict(f,x)) return false;
       }
     }
     return true;
   });

   if(!allowed[0]&&!allowed[1]){
     throw new Error(
       'Nessun weekend PRO disponibile per il blocco '+
       block.group.name+' - G'+block.roundNo
     );
   }

   return {
     idx,
     ...block,
     candidates,
     allowed,
     edges:new Set()
   };
 });

 /* Due BLOCCHI devono stare su weekend opposti se, collocati nello
    stesso weekend, produrrebbero almeno un conflitto reale. */
 for(let i=0;i<blocks.length;i++){
   for(let j=i+1;j<blocks.length;j++){
     let conflict=false;
     const A=blocks[i].candidates[0];
     const B=blocks[j].candidates[0];

     outer:
     for(const a of A){
       for(const b of B){
         if(v9SameTeam(a,b)||realFacilityConflict(a,b)){
           conflict=true;
           break outer;
         }
       }
     }

     if(conflict){
       blocks[i].edges.add(j);
       blocks[j].edges.add(i);
     }
   }
 }

 const color=new Array(blocks.length).fill(-1);

 function assignComponent(startIndex,startColor){
   const q=[[startIndex,startColor]];
   const touched=[];
   while(q.length){
     const [n,c]=q.shift();

     if(!blocks[n].allowed[c]){
       for(const t of touched) color[t]=-1;
       return false;
     }

     if(color[n]!==-1){
       if(color[n]!==c){
         for(const t of touched) color[t]=-1;
         return false;
       }
       continue;
     }

     color[n]=c;
     touched.push(n);

     for(const e of blocks[n].edges){
       const wanted=1-c;
       if(color[e]!==-1 && color[e]!==wanted){
         for(const t of touched) color[t]=-1;
         return false;
       }
       if(color[e]===-1) q.push([e,wanted]);
     }
   }
   return true;
 }

 /* Prima i blocchi obbligati a un solo weekend */
 for(let i=0;i<blocks.length;i++){
   if(color[i]!==-1) continue;

   if(blocks[i].allowed[0]&&!blocks[i].allowed[1]){
     if(!assignComponent(i,0)){
       throw new Error('Conflitto reale tra blocchi attorno a '+blocks[i].group.name+' G'+blocks[i].roundNo);
     }
   }else if(!blocks[i].allowed[0]&&blocks[i].allowed[1]){
     if(!assignComponent(i,1)){
       throw new Error('Conflitto reale tra blocchi attorno a '+blocks[i].group.name+' G'+blocks[i].roundNo);
     }
   }
 }

 /* Componenti libere: scegli l'orientamento che bilancia il numero
    di PARTITE, non il numero di blocchi. */
 for(let i=0;i<blocks.length;i++){
   if(color[i]!==-1) continue;

   const snapshot=color.slice();
   const load0=blocks.reduce((s,b,k)=>s+(color[k]===0?b.items.length:0),0);
   const load1=blocks.reduce((s,b,k)=>s+(color[k]===1?b.items.length:0),0);
   const prefer=load0<=load1?0:1;

   if(!assignComponent(i,prefer)){
     for(let k=0;k<color.length;k++) color[k]=snapshot[k];

     if(!assignComponent(i,1-prefer)){
       throw new Error(
         'I blocchi di recupero non sono distribuibili tra i due weekend PRO attorno a '+
         blocks[i].group.name+' G'+blocks[i].roundNo
       );
     }
   }
 }

 /* Assegnazione finale dei blocchi */
 for(let i=0;i<blocks.length;i++){
   const c=color[i];
   if(c<0||!blocks[i].allowed[c]){
     throw new Error('Assegnazione PRO incompleta per '+blocks[i].group.name+' G'+blocks[i].roundNo);
   }
   buckets[c].fixtures.push(...blocks[i].candidates[c]);
 }

 /* Controllo finale dentro ciascun weekend */
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

 const states=blocks.length;
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
     'V9.9.63: giornate naturali invariate; le residue restano unite per girone+giornata originaria e i blocchi vengono distribuiti tra i due weekend PRO sui weekend PRO 19-21/02 e 05-07/03/2027.'
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
       '<b>V9.9.63 RECUPERI A BLOCCHI ATTIVA:</b> le gare residue vengono assegnate ai due weekend PRO con un controllo deterministico dei soli conflitti reali. Niente ricerca da 100.000 tentativi.';
     c.appendChild(n);
   }
 };

 s.onerror=()=>errorBox('errore caricamento motore');
 document.body.appendChild(s);

}catch(e){
 errorBox(e?.message||String(e));
}
})();