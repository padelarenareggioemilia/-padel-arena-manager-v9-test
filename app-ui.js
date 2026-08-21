
(function(){
  document.addEventListener('click',function(e){
    if(!e.target.closest('.more-wrap,.export')) document.querySelectorAll('.more-menu,.export-menu').forEach(x=>x.classList.add('hidden'));
  });
  window.addEventListener('load',function(){
    document.querySelectorAll('button').forEach(b=>{if(!b.getAttribute('type'))b.setAttribute('type','button')});
  });

  // V9.9.33: CAP eliminato dalla registrazione giocatore.
  window.addEventListener('load',function(){
    if(!/\/player\.html$/i.test(location.pathname)) return;
    const capInput=document.getElementById('cap');
    if(capInput){
      const field=capInput.closest('.field');
      if(field)field.style.display='none';
      capInput.required=false;
      capInput.removeAttribute('pattern');
      capInput.value='';
    }

    // Sostituisce soltanto la validazione/invio della registrazione, mantenendo foto e account facoltativo.
    if(typeof window.sendRequest==='function'||typeof sendRequest==='function'){
      window.sendRequest=async function(){
        if(!document.getElementById('truth').checked)return m('Devi confermare la veridicità dei dati inseriti.',true);
        const wantsAccount=document.getElementById('createAccount').checked;
        const password=document.getElementById('accountPassword').value;
        const passwordConfirm=document.getElementById('accountPasswordConfirm').value;
        let p={
          first_name:fn.value.trim(),last_name:ln.value.trim(),email:em.value.trim().toLowerCase(),
          phone:ph.value.trim(),birth_date:bd.value,birth_place:bp.value.trim(),
          residence_town:rt.value.trim(),residence_postal_code:null,residence_province:rp.value.trim().toUpperCase(),
          gender:g.value,fitp_ranking:fitp.value.trim().toUpperCase(),
          medical_certificate_expiry:medical.value,notes:nt.value.trim()
        };
        for(let k of ['first_name','last_name','email','phone','birth_date','birth_place','residence_town',
          'residence_province','gender','fitp_ranking','medical_certificate_expiry'])
          if(!p[k])return m('Compila tutti i campi obbligatori.',true);
        if(wantsAccount&&password.length<8)return m('Per creare l’account scegli una password di almeno 8 caratteri.',true);
        if(wantsAccount&&password!==passwordConfirm)return m('Le due password non coincidono.',true);
        try{
          sendBtn.disabled=true;m('Caricamento foto e invio richiesta...');
          p.photo_url=await uploadPhoto();
          let r=await s.rpc('submit_roster_request',{p_token:t,p_payload:p});
          if(r.error)throw r.error;
          if(wantsAccount){
            const signup=await s.auth.signUp({email:p.email,password,options:{emailRedirectTo:new URL('public.html?account_confirmed=1',location.href).href}});
            if(signup.error){m('Iscrizione inviata correttamente. Non è stato possibile creare l’account: '+signup.error.message+' Puoi crearlo in seguito usando la stessa email.',true);return;}
            m(signup.data.session?'Iscrizione inviata e account creato. Dopo l’approvazione del capitano potrai entrare con email e password.':'Iscrizione inviata e account creato. Controlla la tua email e conferma l’indirizzo. Dopo l’approvazione del capitano potrai entrare con email e password.');
          }else m('Richiesta inviata correttamente senza creare un account. Il capitano potrà verificarla e approvarla.');
          sendBtn.textContent='Richiesta inviata';
        }catch(err){sendBtn.disabled=false;m(err.message||String(err),true)}
      };
    }
  });

  // Mantiene l'alert Regolamento Admin già introdotto.
  async function installRegulationAdminAlert(){
    if(!/\/admin-control\.html$/i.test(location.pathname)) return;
    if(!window.PAM_V9_CONFIG || !window.supabase) return;
    const client=window.supabase.createClient(window.PAM_V9_CONFIG.supabaseUrl,window.PAM_V9_CONFIG.supabasePublishableKey);
    const hero=document.querySelector('header.hero');
    if(!hero||document.getElementById('regulationAdminAlert'))return;
    const card=document.createElement('section');card.id='regulationAdminAlert';card.className='card';
    card.innerHTML='<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><h2 style="margin:0 0 5px">📘 Regolamento</h2><div id="regulationAdminAlertText" style="font-weight:900">Controllo domande…</div><div id="regulationAdminAlertSub" class="muted small"></div></div><button class="btn danger" type="button" onclick="location.href=\'admin-regulation.html?v=reg-admin-2\'">Apri domande regolamento</button></div>';
    hero.insertAdjacentElement('afterend',card);
    async function refresh(){
      const pending=await client.from('regulation_questions').select('id',{count:'exact',head:true}).eq('status','pending_admin');
      const clar=await client.from('regulation_questions').select('id',{count:'exact',head:true}).eq('added_as_clarification',true).not('admin_answer','is',null);
      const n=pending.count||0;
      document.getElementById('regulationAdminAlertText').textContent=n?`🔴 ${n} ${n===1?'domanda':'domande'} in attesa di risposta ufficiale`:'🟢 Nessuna domanda regolamento in attesa';
      document.getElementById('regulationAdminAlertSub').textContent=`${clar.count||0} chiarimenti ufficiali già riutilizzabili.`;
    }
    await refresh();
    try{client.channel('regulation-admin-alert').on('postgres_changes',{event:'*',schema:'public',table:'regulation_questions'},refresh).subscribe()}catch(e){}
  }
  window.addEventListener('load',installRegulationAdminAlert);
})();
