/* V9.9.49 - FIX vincolo EDEN */
(async function(){
'use strict';
const SOURCE='calendar-v9-clean.js?v=9949eden';
const EDEN_IDS=['3371654b-99ca-4135-b28a-582bdc0a41f1','e4939c59-9670-4706-8abc-abb88a60a18f','33a195e2-ad86-488c-9691-1ce188e9a490'];
const AVAILABLE_FROM='2026-11-01';
try{
 const res=await fetch(SOURCE,{cache:'no-store'}); if(!res.ok) throw Error('Motore calendario non disponibile: '+res.status);
 let src=await res.text();
 const m1="const pad=n=>String(n).padStart(2,'0');";
 const p1=`\nconst V9_EDEN_HOME_TEAM_IDS=new Set(${JSON.stringify(EDEN_IDS)});\nconst V9_EDEN_HOME_AVAILABLE_FROM='${AVAILABLE_FROM}';\nfunction v9SpecialHomeConstraintViolation(f){\n if(!f||!V9_EDEN_HOME_TEAM_IDS.has(String(f.home_team_id))) return false;\n const d=String(f._local_date||'').slice(0,10);\n return !!d && d<V9_EDEN_HOME_AVAILABLE_FROM;\n}\n`;
 if(!src.includes(m1)) throw Error('Marker base non trovato'); src=src.replace(m1,m1+p1);
 const m2="    /* 10.11 - BLOCCO PREVENTIVO:";
 const p2="    /* V9.9.49 EDEN: prima del 01/11/2026 le tre squadre EDEN possono essere solo ospiti. */\n    if(fixtures.some(v9SpecialHomeConstraintViolation)){ continue; }\n\n";
 if(!src.includes(m2)) throw Error('Marker orientazioni non trovato'); src=src.replace(m2,p2+m2);
 const m3="      if(roundTouchesExcludedDate(fixtures,code)){";
 const p3="      if(fixtures.some(v9SpecialHomeConstraintViolation)){ continue; }\n\n";
 if(!src.includes(m3)) throw Error('Marker ritorno non trovato'); src=src.replace(m3,p3+m3);
 const m4="  /* SICUREZZA FINALE:\n     nessuna gara può essere su una data esclusa.\n  */";
 const p4="  /* V9.9.49 controllo finale EDEN */\n  for(const f of payload){\n    if(v9SpecialHomeConstraintViolation(f)){\n      throw new Error(`Vincolo EDEN non rispettato: ${f._home_name} risulta in casa il ${f._local_date}.`);\n    }\n  }\n\n";
 if(!src.includes(m4)) throw Error('Marker controllo finale non trovato'); src=src.replace(m4,p4+m4);
 const blob=new Blob([src],{type:'text/javascript'}),url=URL.createObjectURL(blob),s=document.createElement('script');
 s.src=url;s.onload=()=>{URL.revokeObjectURL(url);installNotice();console.info('[V9.9.49] Vincolo EDEN attivo')};s.onerror=()=>{URL.revokeObjectURL(url);showError('Errore avvio motore calendario')};document.body.appendChild(s);
}catch(e){showError(e?.message||String(e))}
function showError(t){const b=document.createElement('div');b.style.cssText='position:fixed;left:15px;right:15px;bottom:15px;z-index:99999;padding:14px;border-radius:12px;background:#fdecef;border:1px solid #ce2b37;color:#7b1722;font:600 14px system-ui';b.textContent='Calendario: impossibile attivare il vincolo EDEN. '+t;document.body.appendChild(b)}
function installNotice(){if(document.getElementById('v9EdenConstraintNotice'))return;const card=[...document.querySelectorAll('.card')].find(x=>x.querySelector('#competition'))||document.querySelector('.card');if(!card)return;const n=document.createElement('div');n.id='v9EdenConstraintNotice';n.className='notice ok';n.innerHTML='<b>Vincolo speciale EDEN ATTIVO:</b> le 3 squadre di Via Balla 6 sono <b>solo in trasferta fino al 31/10/2026</b>. Gare casalinghe consentite dal <b>01/11/2026</b>.';card.appendChild(n)}
})();