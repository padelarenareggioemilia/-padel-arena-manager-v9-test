
(function(){
  document.addEventListener('click',function(e){
    if(!e.target.closest('.more-wrap,.export')) document.querySelectorAll('.more-menu,.export-menu').forEach(x=>x.classList.add('hidden'));
  });
  window.addEventListener('load',function(){
    document.querySelectorAll('button').forEach(b=>{if(!b.getAttribute('type'))b.setAttribute('type','button')});
  });

  async function installRegulationAdminAlert(){
    if(!/\/admin-control\.html$/i.test(location.pathname)) return;
    if(!window.PAM_V9_CONFIG || !window.supabase) return;

    const client = window.supabase.createClient(
      window.PAM_V9_CONFIG.supabaseUrl,
      window.PAM_V9_CONFIG.supabasePublishableKey
    );

    const hero = document.querySelector('header.hero');
    if(!hero || document.getElementById('regulationAdminAlert')) return;

    const card = document.createElement('section');
    card.id = 'regulationAdminAlert';
    card.className = 'card';
    card.style.cssText = 'border:2px solid #ce2b37;background:#fff7f7;';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
        <div>
          <h2 style="margin:0 0 5px">📘 Regolamento</h2>
          <div id="regulationAdminAlertText" style="font-weight:900">Controllo domande in corso…</div>
          <div id="regulationAdminAlertSub" class="muted small"></div>
        </div>
        <button class="btn danger" type="button" onclick="location.href='admin-regulation.html?v=reg-admin-2'">
          Apri domande regolamento
        </button>
      </div>`;
    hero.insertAdjacentElement('afterend', card);

    async function refresh(){
      const text = document.getElementById('regulationAdminAlertText');
      const sub = document.getElementById('regulationAdminAlertSub');
      try{
        const pending = await client
          .from('regulation_questions')
          .select('id',{count:'exact',head:true})
          .eq('status','pending_admin');

        const clar = await client
          .from('regulation_questions')
          .select('id',{count:'exact',head:true})
          .eq('added_as_clarification',true)
          .not('admin_answer','is',null);

        if(pending.error) throw pending.error;

        const n = pending.count || 0;
        if(n > 0){
          card.style.borderColor = '#ce2b37';
          card.style.background = '#fff3f3';
          text.textContent = `🔴 ${n} ${n===1?'domanda':'domande'} in attesa di risposta ufficiale`;
        }else{
          card.style.borderColor = '#79bf90';
          card.style.background = '#ebf8f0';
          text.textContent = '🟢 Nessuna domanda regolamento in attesa';
        }
        sub.textContent = `${clar.count || 0} chiarimenti ufficiali già riutilizzabili.`;
      }catch(e){
        text.textContent = 'Regolamento: impossibile leggere le richieste';
        sub.textContent = e.message || String(e);
      }
    }

    await refresh();

    try{
      client.channel('regulation-admin-alert')
        .on('postgres_changes',
          {event:'*',schema:'public',table:'regulation_questions'},
          refresh)
        .subscribe();
    }catch(e){}
  }

  window.addEventListener('load',installRegulationAdminAlert);
})();
