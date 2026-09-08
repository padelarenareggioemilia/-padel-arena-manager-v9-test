/* V9.9.50 - VINCOLO EDEN TRASVERSALE A TUTTE LE COMPETIZIONI
   Vale per:
   - Serie B
   - Serie C
   - Coppa Italia
   - qualunque altra competizione futura in cui compaiano queste squadre

   Regola:
   EDEN PADEL CLUB, EDEN ACADEMY SERIE C ed EDEN NEXT GEN PADEL CLUB
   NON possono essere squadra di casa prima del 01/11/2026.
*/
(async function(){
'use strict';

const SOURCE='calendar-v9-clean.js?v=9950eden';
const EDEN_IDS=[
  '3371654b-99ca-4135-b28a-582bdc0a41f1', // EDEN PADEL CLUB - Serie B
  'e4939c59-9670-4706-8abc-abb88a60a18f', // EDEN ACADEMY SERIE C
  '33a195e2-ad86-488c-9691-1ce188e9a490'  // EDEN NEXT GEN PADEL CLUB - Serie C
];
const AVAILABLE_FROM='2026-11-01';

try{
  const res=await fetch(SOURCE,{cache:'no-store'});
  if(!res.ok) throw Error('Motore calendario non disponibile: '+res.status);
  let src=await res.text();

  const m1="const pad=n=>String(n).padStart(2,'0');";
  const p1=`
const V9_EDEN_HOME_TEAM_IDS=new Set(${JSON.stringify(EDEN_IDS)});
const V9_EDEN_HOME_AVAILABLE_FROM='${AVAILABLE_FROM}';

function v9SpecialHomeConstraintViolation(f){
  if(!f) return false;

  // Vincolo volutamente indipendente dalla competizione:
  // si applica a Serie B, Serie C, Coppa Italia e future competizioni.
  if(!V9_EDEN_HOME_TEAM_IDS.has(String(f.home_team_id))) return false;

  const d=String(f._local_date||'').slice(0,10);
  return !!d && d<V9_EDEN_HOME_AVAILABLE_FROM;
}
`;
  if(!src.includes(m1)) throw Error('Marker base non trovato');
  src=src.replace(m1,m1+p1);

  const m2="    /* 10.11 - BLOCCO PREVENTIVO:";
  const p2=`    /* V9.9.50 EDEN - TUTTE LE COMPETIZIONI:
       prima del 01/11/2026 le tre squadre EDEN possono essere SOLO OSPITI.
       Nessun controllo sul competition_code: vale anche per COPPA_ITALIA. */
    if(fixtures.some(v9SpecialHomeConstraintViolation)){
      continue;
    }

`;
  if(!src.includes(m2)) throw Error('Marker orientazioni non trovato');
  src=src.replace(m2,p2+m2);

  const m3="      if(roundTouchesExcludedDate(fixtures,code)){";
  const p3=`      /* V9.9.50: stesso blocco anche per il ritorno,
         indipendentemente dalla competizione. */
      if(fixtures.some(v9SpecialHomeConstraintViolation)){
        continue;
      }

`;
  if(!src.includes(m3)) throw Error('Marker ritorno non trovato');
  src=src.replace(m3,p3+m3);

  const m4="  /* SICUREZZA FINALE:\n     nessuna gara può essere su una data esclusa.\n  */";
  const p4=`  /* V9.9.50 - CONTROLLO FINALE EDEN SU QUALUNQUE COMPETIZIONE */
  for(const f of payload){
    if(v9SpecialHomeConstraintViolation(f)){
      throw new Error(
        \`Vincolo EDEN non rispettato: \${f._home_name} risulta in casa il \${f._local_date} nella competizione \${f.competition_code}.\`
      );
    }
  }

`;
  if(!src.includes(m4)) throw Error('Marker controllo finale non trovato');
  src=src.replace(m4,p4+m4);

  const blob=new Blob([src],{type:'text/javascript'});
  const url=URL.createObjectURL(blob);
  const s=document.createElement('script');

  s.src=url;
  s.onload=()=>{
    URL.revokeObjectURL(url);
    installNotice();
    console.info('[V9.9.50] Vincolo EDEN trasversale attivo su Serie B, Serie C e Coppa Italia');
  };
  s.onerror=()=>{
    URL.revokeObjectURL(url);
    showError('Errore avvio motore calendario');
  };

  document.body.appendChild(s);

}catch(e){
  showError(e?.message||String(e));
}

function showError(t){
  const b=document.createElement('div');
  b.style.cssText='position:fixed;left:15px;right:15px;bottom:15px;z-index:99999;padding:14px;border-radius:12px;background:#fdecef;border:1px solid #ce2b37;color:#7b1722;font:600 14px system-ui';
  b.textContent='Calendario: impossibile attivare il vincolo EDEN. '+t;
  document.body.appendChild(b);
}

function installNotice(){
  if(document.getElementById('v9EdenConstraintNotice')) return;

  const card=[...document.querySelectorAll('.card')]
    .find(x=>x.querySelector('#competition')) || document.querySelector('.card');

  if(!card) return;

  const n=document.createElement('div');
  n.id='v9EdenConstraintNotice';
  n.className='notice ok';
  n.innerHTML=
    '<b>Vincolo speciale EDEN ATTIVO SU TUTTE LE COMPETIZIONI:</b> '+
    'EDEN PADEL CLUB, EDEN ACADEMY SERIE C ed EDEN NEXT GEN PADEL CLUB sono '+
    '<b>solo in trasferta fino al 31/10/2026</b>. '+
    'La regola vale per <b>Serie B, Serie C e Coppa Italia</b>. '+
    'Gare casalinghe consentite dal <b>01/11/2026</b>.';

  card.appendChild(n);
}
})();