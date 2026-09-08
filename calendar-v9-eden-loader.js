/* V9.9.57 - CALENDARIO A DUE BINARI + SLOT PRO
   REGOLE DEFINITIVE:
   - Coppa Italia: binario settimanale che parte dal weekend 01/10/2026.
   - Campionato: binario settimanale alternato che parte dal weekend 08/10/2026.
   - Quindi le due competizioni non occupano normalmente lo stesso weekend.
   - Il numero di giornate NON è fisso: dipende dal girone/formula.
   - Andata: motore originale + EDEN mai casa prima 01/11/2026.
   - Ritorno: non speculare; ogni coppia una casa/una fuori.
   - Prima si tenta SEMPRE di chiudere nel numero naturale di giornate del girone.
   - Solo se impossibile, si apre UNO SLOT PRO nel successivo weekend dello stesso binario,
     cioè due settimane dopo l'ultima giornata naturale; mai nel weekend dell'altra competizione.
*/
(async function(){
'use strict';
const SOURCE='calendar-v9-clean.js?v=9957base';
const EDEN_IDS=['3371654b-99ca-4135-b28a-582bdc0a41f1','e4939c59-9670-4706-8abc-abb88a60a18f','33a195e2-ad86-488c-9691-1ce188e9a490'];
function err(t){const b=document.createElement('div');b.style.cssText='position:fixed;left:15px;right:15px;bottom:15px;z-index:99999;padding:14px;border-radius:12px;background:#fdecef;border:1px solid #ce2b37;color:#7b1722;font:600 14px system-ui';b.textContent='V9.9.57 non attivata: '+t;document.body.appendChild(b)}
try{
 const r=await fetch(SOURCE,{cache:'no-store'});if(!r.ok)throw Error('motore base non disponibile');let src=await r.text();
 const base="const pad=n=>String(n).padStart(2,'0');";if(!src.includes(base))throw Error('punto base non trovato');
 src=src.replace(base,base+`\nconst V9_EDEN_IDS=new Set(${JSON.stringify(EDEN_IDS)});\nfunction v9EdenForbiddenHome(f){if(!f||!V9_EDEN_IDS.has(String(f.home_team_id)))return false;return String(f._local_date||'').slice(0,10)<'2026-11-01';}\nfunction v9IsCoppa(code){return String(code||'').toUpperCase().includes('COPPA');}\n`);
 const orient=`    const fixtures=pairs.map(([home,away])=>\n      makeFixture(group,roundNo,home,away,anchor,code)\n    );`;
 if(!src.includes(orient))throw Error('punto orientazioni non trovato');
 src=src.replace(orient,orient+`\n\n    /* V9.9.57: unica eccezione specifica nell'andata */\n    if(fixtures.some(v9EdenForbiddenHome)) continue;`);

 /* RITORNO: solver naturale + eventuale PRO */
 const a=src.indexOf('function buildReturnLeg({'),b=src.indexOf('window.buildCalendarPayload=async function(){',a);if(a<0||b<0)throw Error('blocco ritorno non trovato');
 const repl=`function buildReturnLeg({group,firstLeg,startAnchor,intervalWeeks,code,external}){
  const matches=[];
  for(const r of firstLeg.chosen){
    for(const [h,a] of r.pairs){
      if(h.__bye||a.__bye) continue;
      matches.push({home:a,away:h});
    }
  }
  const teamIds=new Set(matches.flatMap(m=>[String(m.home.id),String(m.away.id)]));
  const normalPerRound=Math.floor(teamIds.size/2);
  const naturalCount=firstLeg.totalRounds;

  function makeSlots(withPro){
    const out=Array.from({length:naturalCount},(_,i)=>({
      roundNo:naturalCount+i+1,
      anchor:addDays(new Date(startAnchor),i*intervalWeeks*7),
      fixtures:[],teams:new Set(),pro:false
    }));
    if(withPro){
      /* PRO = successivo slot DELLO STESSO BINARIO, quindi mantiene l'alternanza. */
      const last=out[out.length-1];
      out.push({roundNo:naturalCount*2+1,anchor:addDays(last.anchor,intervalWeeks*7),fixtures:[],teams:new Set(),pro:true});
    }
    return out;
  }

  function solve(withPro){
    const slots=makeSlots(withPro); let states=0; const MAX=40000;
    function fixtureFor(m,s){
      if(s.teams.has(String(m.home.id))||s.teams.has(String(m.away.id)))return null;
      const f=makeFixture(group,s.roundNo,m.home,m.away,s.anchor,code);
      if(v9EdenForbiddenHome(f))return null;
      if(fixtureFallsOnExcludedDate(f,code))return null;
      if(conflictsAny(f,s.fixtures))return null;
      if(!compatibleWithExternal([f],external))return null;
      return f;
    }
    function options(m){const o=[];for(let i=0;i<slots.length;i++){const f=fixtureFor(m,slots[i]);if(f)o.push([i,f]);}return o;}
    function rec(rem){
      if(!rem.length)return true;if(++states>MAX)return false;
      let bi=-1,bo=null;
      for(let i=0;i<rem.length;i++){const o=options(rem[i]);if(!o.length)return false;if(bo===null||o.length<bo.length){bi=i;bo=o;if(o.length===1)break;}}
      const m=rem[bi],next=rem.slice(0,bi).concat(rem.slice(bi+1));
      /* PRO ultima scelta assoluta. */
      bo.sort((x,y)=>Number(slots[x[0]].pro)-Number(slots[y[0]].pro)||slots[x[0]].fixtures.length-slots[y[0]].fixtures.length);
      for(const [si,f] of bo){const s=slots[si];if(!s.pro&&s.fixtures.length>=normalPerRound)continue;s.fixtures.push(f);s.teams.add(String(m.home.id));s.teams.add(String(m.away.id));if(rec(next))return true;s.fixtures.pop();s.teams.delete(String(m.home.id));s.teams.delete(String(m.away.id));}
      return false;
    }
    return rec(matches)?{slots,states}:null;
  }

  /* Tentativo 1: SOLO giornate naturali. */
  let solved=solve(false);
  let usedPro=false;
  /* Tentativo 2: soltanto se il primo è impossibile. */
  if(!solved){solved=solve(true);usedPro=true;}
  if(!solved)throw new Error('Impossibile comporre il ritorno anche utilizzando lo slot PRO finale.');

  const nonEmpty=solved.slots.filter(s=>s.fixtures.length);
  if(usedPro){console.warn('[V9.9.57] SLOT PRO utilizzato come ultima spiaggia.');}
  console.info('[V9.9.57] ritorno:',solved.states,'tentativi; PRO:',usedPro);
  return nonEmpty.map(s=>({roundNo:s.roundNo,fixtures:s.fixtures,anchor:s.anchor,_pro:s.pro}));
}\n\n`;
 src=src.slice(0,a)+repl+src.slice(b);

 /* forza cadenza binari: se l'utente parte dalle date ufficiali, intervalWeeks deve restare 2.
    Non sovrascriviamo la UI: il motore conserva il valore scelto, ma il banner chiarisce la regola. */
 const blob=new Blob([src],{type:'text/javascript'}),url=URL.createObjectURL(blob),s=document.createElement('script');s.src=url;
 s.onload=()=>{URL.revokeObjectURL(url);const c=[...document.querySelectorAll('.card')].find(x=>x.querySelector('#competition'))||document.querySelector('.card');if(c){const n=document.createElement('div');n.className='notice ok';n.innerHTML='<b>V9.9.57 ATTIVA:</b> due binari alternati: Coppa Italia dal weekend 01/10/2026, Campionato dal weekend 08/10/2026. Numero giornate dinamico per girone. Lo slot PRO viene usato solo se il ritorno è matematicamente irrisolvibile nelle giornate naturali.';c.appendChild(n)}};s.onerror=()=>err('errore caricamento');document.body.appendChild(s);
}catch(e){err(e?.message||String(e))}
})();