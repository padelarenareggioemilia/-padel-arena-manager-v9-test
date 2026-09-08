/* V9.9.48 - Loader calendario con vincolo speciale EDEN
   Le tre squadre EDEN di Via Balla 6 non possono giocare in casa
   prima del 1 novembre 2026. Il motore GLOBAL SORT scarta le
   orientazioni CASA non consentite e cerca automaticamente un'altra
   combinazione casa/trasferta, senza alterare gli accoppiamenti.
*/
(async function(){
  'use strict';

  const SOURCE='calendar-v9-clean.js?v=9948eden';
  const EDEN_IDS=[
    '3371654b-99ca-4135-b28a-582bdc0a41f1', // EDEN PADEL CLUB - Serie B
    'e4939c59-9670-4706-8abc-abb88a60a18f', // EDEN ACADEMY SERIE C
    '33a195e2-ad86-488c-9691-1ce188e9a490'  // EDEN NEXT GEN PADEL CLUB - Serie C
  ];
  const AVAILABLE_FROM='2026-11-01';

  try{
    const res=await fetch(SOURCE,{cache:'no-store'});
    if(!res.ok) throw new Error('Impossibile caricare il motore calendario ('+res.status+').');
    let src=await res.text();

    const marker1="const pad=n=>String(n).padStart(2,'0');";
    const insert1=`\n\n/* V9.9.48 - FORZATURA EDEN VIA BALLA 6 */\nconst V9_EDEN_HOME_TEAM_IDS=new Set(${JSON.stringify(EDEN_IDS)});\nconst V9_EDEN_HOME_AVAILABLE_FROM='${AVAILABLE_FROM}';\nfunction v9SpecialHomeConstraintViolation(fixture){\n  if(!fixture) return false;\n  if(!V9_EDEN_HOME_TEAM_IDS.has(String(fixture.home_team_id))) return false;\n  const d=String(fixture._local_date||'').slice(0,10);\n  return !!d && d < V9_EDEN_HOME_AVAILABLE_FROM;\n}\nfunction v9SpecialHomeConstraintMessage(fixture){\n  return \`Vincolo EDEN Via Balla 6: \\${fixture?._home_name||'Squadra EDEN'} non può giocare in casa prima del 01/11/2026.\`;\n}\n`;
    if(!src.includes(marker1)) throw new Error('Punto di inserimento 1 non trovato.');
    src=src.replace(marker1,marker1+insert1);

    const marker2=`    const fixtures=pairs.map(([home,away])=>\n      makeFixture(group,roundNo,home,away,anchor,code)\n    );`;
    const insert2=`\n\n    /* V9.9.48: EDEN solo in trasferta fino al 31/10/2026. */\n    if(fixtures.some(v9SpecialHomeConstraintViolation)){\n      continue;\n    }`;
    if(!src.includes(marker2)) throw new Error('Punto di inserimento 2 non trovato.');
    src=src.replace(marker2,marker2+insert2);

    const marker3=`      const fixtures=first.pairs.map(([home,away])=>\n        makeFixture(\n          group,\n          returnRoundNo,\n          away,\n          home,\n          anchor,\n          code\n        )\n      );`;
    const insert3=`\n\n      /* V9.9.48: sicurezza anche sul ritorno. */\n      if(fixtures.some(v9SpecialHomeConstraintViolation)){\n        continue;\n      }`;
    if(!src.includes(marker3)) throw new Error('Punto di inserimento 3 non trovato.');
    src=src.replace(marker3,marker3+insert3);

    const marker4=`  /* SICUREZZA FINALE:\n     nessuna gara può essere su una data esclusa.\n  */\n  for(const f of payload){`;
    const insert4=`  /* V9.9.48 - SICUREZZA FINALE EDEN */\n  for(const f of payload){\n    if(v9SpecialHomeConstraintViolation(f)){\n      throw new Error(v9SpecialHomeConstraintMessage(f));\n    }\n  }\n\n`;
    if(!src.includes(marker4)) throw new Error('Punto di inserimento 4 non trovato.');
    src=src.replace(marker4,insert4+marker4);

    const blob=new Blob([src],{type:'text/javascript'});
    const url=URL.createObjectURL(blob);
    const script=document.createElement('script');
    script.src=url;
    script.onload=()=>{
      URL.revokeObjectURL(url);
      console.info('[V9.9.48] Vincolo EDEN attivo: solo trasferta fino al 31/10/2026');
      installEdenNotice();
    };
    script.onerror=()=>{URL.revokeObjectURL(url);throw new Error('Errore avvio motore calendario patchato.');};
    document.body.appendChild(script);
  }catch(e){
    console.error('[V9.9.48 EDEN]',e);
    const box=document.createElement('div');
    box.style.cssText='position:fixed;left:15px;right:15px;bottom:15px;z-index:99999;padding:14px;border-radius:12px;background:#fdecef;border:1px solid #ce2b37;color:#7b1722;font:600 14px system-ui';
    box.textContent='Calendario: impossibile attivare il vincolo EDEN. '+(e?.message||e);
    document.body.appendChild(box);
  }

  function installEdenNotice(){
    if(document.getElementById('v9EdenConstraintNotice')) return;
    const cards=[...document.querySelectorAll('.card')];
    const card=cards.find(x=>x.querySelector('#competition'))||cards[0];
    if(!card) return;
    const n=document.createElement('div');
    n.id='v9EdenConstraintNotice';
    n.className='notice ok';
    n.innerHTML='<b>Vincolo speciale EDEN attivo:</b> EDEN PADEL CLUB (Serie B), EDEN ACADEMY SERIE C ed EDEN NEXT GEN PADEL CLUB (Serie C) saranno calendarizzate <b>solo in trasferta fino al 31 ottobre 2026</b>. Dal <b>1 novembre 2026</b> Via Balla 6 torna disponibile per le gare casalinghe. Il GLOBAL SORT cerca automaticamente una disposizione casa/trasferta compatibile.';
    card.appendChild(n);
  }
})();