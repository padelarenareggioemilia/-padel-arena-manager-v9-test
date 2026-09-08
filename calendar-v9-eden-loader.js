/* V9.9.55 - EDEN + RITORNO A PARTITE LIBERE
   Andata: motore originale, con UNICA regola aggiunta: EDEN mai in casa prima 01/11/2026.
   Ritorno: non esistono più blocchi speculari obbligatori. Ogni singolo incontro inverso
   viene assegnato a una giornata disponibile, mantenendo:
   - una gara in casa e una fuori per coppia;
   - una sola gara per squadra nella stessa giornata;
   - giorno/ora/campo della squadra di casa;
   - sospensioni/date escluse;
   - conflitti impianto;
   - EDEN solo trasferta fino al 31/10/2026.
*/
(async function(){
'use strict';
const SOURCE='calendar-v9-clean.js?v=9955base';
const IDS=['3371654b-99ca-4135-b28a-582bdc0a41f1','e4939c59-9670-4706-8abc-abb88a60a18f','33a195e2-ad86-488c-9691-1ce188e9a490'];
function errorBox(t){const b=document.createElement('div');b.style.cssText='position:fixed;left:15px;right:15px;bottom:15px;z-index:99999;padding:14px;border-radius:12px;background:#fdecef;border:1px solid #ce2b37;color:#7b1722;font:600 14px system-ui';b.textContent='V9.9.55 non attivata: '+t;document.body.appendChild(b)}
try{
 const r=await fetch(SOURCE,{cache:'no-store'});if(!r.ok)throw Error('motore base non disponibile');let src=await r.text();
 const base="const pad=n=>String(n).padStart(2,'0');";
 if(!src.includes(base))throw Error('punto base non trovato');
 src=src.replace(base,base+`\nconst V9_EDEN_IDS=new Set(${JSON.stringify(IDS)});\nfunction v9EdenForbiddenHome(f){if(!f||!V9_EDEN_IDS.has(String(f.home_team_id)))return false;return String(f._local_date||'').slice(0,10)<'2026-11-01';}\n`);
 const orient=`    const fixtures=pairs.map(([home,away])=>\n      makeFixture(group,roundNo,home,away,anchor,code)\n    );`;
 if(!src.includes(orient))throw Error('punto orientazioni non trovato');
 src=src.replace(orient,orient+`\n\n    /* V9.9.55: unica forzatura dell'andata */\n    if(fixtures.some(v9EdenForbiddenHome)) continue;`);
 const a=src.indexOf('function buildReturnLeg({');
 const b=src.indexOf('window.buildCalendarPayload=async function(){',a);
 if(a<0||b<0)throw Error('blocco ritorno non trovato');
 const replacement=`function buildReturnLeg({group,firstLeg,startAnchor,intervalWeeks,code,external}){
  /* Pool di TUTTE le singole gare di ritorno, senza legame con la giornata di andata. */
  const pool=[];
  for(const r of firstLeg.chosen){
    for(const [home,away] of r.pairs){
      if(home.__bye||away.__bye) continue;
      pool.push({home:away,away:home}); // inversione obbligatoria
    }
  }

  const totalRounds=firstLeg.totalRounds;
  const slots=Array.from({length:totalRounds},(_,i)=>({
    roundNo:totalRounds+i+1,
    anchor:addDays(new Date(startAnchor),i*intervalWeeks*7),
    fixtures:[],
    teams:new Set()
  }));

  function canPlace(item,slot){
    if(slot.teams.has(String(item.home.id))||slot.teams.has(String(item.away.id))) return null;
    const f=makeFixture(group,slot.roundNo,item.home,item.away,slot.anchor,code);
    if(v9EdenForbiddenHome(f)) return null;
    if(fixtureFallsOnExcludedDate(f,code)) return null;
    if(conflictsAny(f,slot.fixtures)) return null;
    if(!compatibleWithExternal([f],external)) return null;
    return f;
  }

  /* Prima le gare EDEN: sono le sole con vincolo speciale. */
  pool.sort((x,y)=>Number(V9_EDEN_IDS.has(String(y.home.id)))-Number(V9_EDEN_IDS.has(String(x.home.id))));

  for(const item of pool){
    let placed=false;
    /* prova tutte le giornate di ritorno; nessun vincolo di specularità */
    for(const slot of slots){
      const f=canPlace(item,slot);
      if(!f) continue;
      slot.fixtures.push(f);
      slot.teams.add(String(item.home.id));
      slot.teams.add(String(item.away.id));
      placed=true;break;
    }
    if(!placed){
      /* Se necessario, rinvia TUTTA la griglia del ritorno di una settimana e riprova.
         Non anticipa/posticipa una singola gara rispetto alle altre: cambia il blocco temporale disponibile. */
      let ok=false;
      for(let shift=1;shift<=12&&!ok;shift++){
        for(const slot of slots){
          if(slot.fixtures.length) continue;
          const shifted={...slot,anchor:addDays(slot.anchor,shift*7)};
          const f=canPlace(item,shifted);
          if(!f) continue;
          slot.anchor=shifted.anchor;slot.fixtures.push(f);slot.teams.add(String(item.home.id));slot.teams.add(String(item.away.id));ok=true;break;
        }
      }
      if(!ok) throw new Error('Non riesco a collocare il ritorno '+item.home.name+' - '+item.away.name+' rispettando i vincoli reali.');
    }
  }

  /* Ogni giornata deve contenere tutte le squadre previste (salvo eventuale riposo). */
  const expectedPerRound=Math.floor((new Set(pool.flatMap(x=>[String(x.home.id),String(x.away.id)])).size)/2);
  for(const slot of slots){
    if(slot.fixtures.length!==expectedPerRound){
      throw new Error('Ritorno incompleto alla G'+slot.roundNo+': '+slot.fixtures.length+' gare invece di '+expectedPerRound+'.');
    }
  }
  return slots.map(s=>({roundNo:s.roundNo,fixtures:s.fixtures,anchor:s.anchor}));
}\n\n`;
 src=src.slice(0,a)+replacement+src.slice(b);
 const blob=new Blob([src],{type:'text/javascript'}),url=URL.createObjectURL(blob),s=document.createElement('script');s.src=url;
 s.onload=()=>{URL.revokeObjectURL(url);const card=[...document.querySelectorAll('.card')].find(x=>x.querySelector('#competition'))||document.querySelector('.card');if(card){const n=document.createElement('div');n.className='notice ok';n.innerHTML='<b>V9.9.55 ATTIVA:</b> andata invariata salvo vincolo EDEN. Nel ritorno gli incontri sono distribuiti singolarmente tra le giornate: nessuna specularità obbligatoria, sempre una gara in casa e una fuori per coppia.';card.appendChild(n)}};
 s.onerror=()=>errorBox('errore caricamento');document.body.appendChild(s);
}catch(e){errorBox(e?.message||String(e))}
})();