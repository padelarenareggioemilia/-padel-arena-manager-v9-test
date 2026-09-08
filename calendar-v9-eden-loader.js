/* V9.9.56 - EDEN + RITORNO NON SPECULARE CON BACKTRACK LIMITATO
   Andata: motore originale + solo vincolo EDEN.
   Ritorno: gli incontri inversi vengono composti in giornate complete.
   Se una scelta blocca una gara successiva, torna indietro e prova uno scambio.
   Nessuna singola gara viene anticipata/posticipata artificialmente.
*/
(async function(){
'use strict';
const SOURCE='calendar-v9-clean.js?v=9956base';
const IDS=['3371654b-99ca-4135-b28a-582bdc0a41f1','e4939c59-9670-4706-8abc-abb88a60a18f','33a195e2-ad86-488c-9691-1ce188e9a490'];
function box(t){const b=document.createElement('div');b.style.cssText='position:fixed;left:15px;right:15px;bottom:15px;z-index:99999;padding:14px;border-radius:12px;background:#fdecef;border:1px solid #ce2b37;color:#7b1722;font:600 14px system-ui';b.textContent='V9.9.56 non attivata: '+t;document.body.appendChild(b)}
try{
 const r=await fetch(SOURCE,{cache:'no-store'});if(!r.ok)throw Error('motore base non disponibile');let src=await r.text();
 const base="const pad=n=>String(n).padStart(2,'0');";if(!src.includes(base))throw Error('punto base non trovato');
 src=src.replace(base,base+`\nconst V9_EDEN_IDS=new Set(${JSON.stringify(IDS)});\nfunction v9EdenForbiddenHome(f){if(!f||!V9_EDEN_IDS.has(String(f.home_team_id)))return false;return String(f._local_date||'').slice(0,10)<'2026-11-01';}\n`);
 const orient=`    const fixtures=pairs.map(([home,away])=>\n      makeFixture(group,roundNo,home,away,anchor,code)\n    );`;
 if(!src.includes(orient))throw Error('punto orientazioni non trovato');
 src=src.replace(orient,orient+`\n\n    if(fixtures.some(v9EdenForbiddenHome)) continue;`);
 const a=src.indexOf('function buildReturnLeg({'), b=src.indexOf('window.buildCalendarPayload=async function(){',a);if(a<0||b<0)throw Error('blocco ritorno non trovato');
 const repl=`function buildReturnLeg({group,firstLeg,startAnchor,intervalWeeks,code,external}){
  const matches=[];
  for(const r of firstLeg.chosen){
    for(const [h,a] of r.pairs){
      if(h.__bye||a.__bye) continue;
      matches.push({home:a,away:h,key:pairKeyIds(h.id,a.id)});
    }
  }

  const teamIds=new Set(matches.flatMap(m=>[String(m.home.id),String(m.away.id)]));
  const perRound=Math.floor(teamIds.size/2);
  const rounds=Array.from({length:firstLeg.totalRounds},(_,i)=>({
    roundNo:firstLeg.totalRounds+i+1,
    anchor:addDays(new Date(startAnchor),i*intervalWeeks*7),
    fixtures:[], teams:new Set()
  }));

  function fixtureFor(m,slot){
    if(slot.teams.has(String(m.home.id))||slot.teams.has(String(m.away.id))) return null;
    const f=makeFixture(group,slot.roundNo,m.home,m.away,slot.anchor,code);
    if(v9EdenForbiddenHome(f)) return null;
    if(fixtureFallsOnExcludedDate(f,code)) return null;
    if(conflictsAny(f,slot.fixtures)) return null;
    if(!compatibleWithExternal([f],external)) return null;
    return f;
  }

  /* Most constrained first: calcola quante giornate sono disponibili per ogni gara. */
  function options(m){
    const out=[];
    for(let i=0;i<rounds.length;i++){
      const f=fixtureFor(m,rounds[i]); if(f) out.push([i,f]);
    }
    return out;
  }

  let states=0; const MAX_STATES=25000;
  function rec(remaining){
    if(!remaining.length) return true;
    if(++states>MAX_STATES) return false;

    let bestIdx=-1,bestOpts=null;
    for(let i=0;i<remaining.length;i++){
      const o=options(remaining[i]);
      if(!o.length) return false;
      if(bestOpts===null||o.length<bestOpts.length){bestIdx=i;bestOpts=o;if(o.length===1)break;}
    }

    const m=remaining[bestIdx];
    const next=remaining.slice(0,bestIdx).concat(remaining.slice(bestIdx+1));
    bestOpts.sort((x,y)=>rounds[x[0]].fixtures.length-rounds[y[0]].fixtures.length);

    for(const [ri,f] of bestOpts){
      const s=rounds[ri];
      if(s.fixtures.length>=perRound) continue;
      s.fixtures.push(f);s.teams.add(String(m.home.id));s.teams.add(String(m.away.id));
      if(rec(next)) return true;
      s.fixtures.pop();s.teams.delete(String(m.home.id));s.teams.delete(String(m.away.id));
    }
    return false;
  }

  if(!rec(matches)){
    throw new Error('Non riesco a comporre tutte le giornate di ritorno rispettando contemporaneamente i vincoli reali.');
  }
  for(const s of rounds){
    if(s.fixtures.length!==perRound) throw new Error('G'+s.roundNo+' incompleta nel ritorno.');
  }
  console.info('[V9.9.56] ritorno composto in',states,'tentativi');
  return rounds.map(s=>({roundNo:s.roundNo,fixtures:s.fixtures,anchor:s.anchor}));
}\n\n`;
 src=src.slice(0,a)+repl+src.slice(b);
 const blob=new Blob([src],{type:'text/javascript'}),url=URL.createObjectURL(blob),s=document.createElement('script');s.src=url;
 s.onload=()=>{URL.revokeObjectURL(url);const c=[...document.querySelectorAll('.card')].find(x=>x.querySelector('#competition'))||document.querySelector('.card');if(c){const n=document.createElement('div');n.className='notice ok';n.innerHTML='<b>V9.9.56 ATTIVA:</b> andata invariata salvo EDEN. Il ritorno viene composto per giornate complete con scambi automatici se una scelta blocca gli incontri successivi; nessuna specularità obbligatoria.';c.appendChild(n)}};s.onerror=()=>box('errore caricamento');document.body.appendChild(s);
}catch(e){box(e?.message||String(e))}
})();