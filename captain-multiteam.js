V9.9.45 - PACCHETTO UNICO HOME CAPITANO + AMICHEVOLI
// ======================================================

(function () {
  const legacy = document.createElement('script');
  legacy.src = 'https://cdn.jsdelivr.net/gh/padelarenareggioemilia/-padel-arena-manager-v9-test@97e19c37ac4413b9ccc7ca7958a5ed4b01716241/captain-multiteam.js';
  legacy.async = false;

  legacy.onload = function () {
    // ======================================================
    // V9.9.45 - INTEGRAZIONE AMICHEVOLI NELLA HOME CAPITANO
    // ======================================================
    
    (function () {
      const currentTeamId = () =>
        (window.data && data.team_id) ||
        new URLSearchParams(location.search).get('team');
    
      function addFriendlyTab() {
        const tabs = document.querySelector('.tabs');
        if (!tabs || document.getElementById('friendlySectionBtn')) return;
    
        const btn = document.createElement('button');
        btn.id = 'friendlySectionBtn';
        btn.className = 'tab';
        btn.textContent = 'Amichevoli';
        btn.onclick = () => {
          const team = currentTeamId();
          location.href =
            'friendly.html' +
            (team ? '?team=' + encodeURIComponent(team) + '&v=9945' : '?v=9945');
        };
    
        const regulationBtn = [...tabs.querySelectorAll('.tab')]
          .find(x => (x.textContent || '').trim() === 'Assistente Regolamento');
    
        if (regulationBtn) tabs.insertBefore(btn, regulationBtn);
        else tabs.appendChild(btn);
      }
    
      function friendlyCard(match) {
        const when = match.scheduled_at
          ? new Date(match.scheduled_at).toLocaleString('it-IT', {
              weekday: 'short',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })
          : 'Data da definire';
    
        return `
          <article class="fixture future" style="border-left-color:#009246">
            <div>
              <b>${esc(when)}</b>
              <div class="muted">
                <span class="badge good">AMICHEVOLE Â· FUORI CLASSIFICA</span>
              </div>
            </div>
            <div>
              <b>${esc(match.home_team_name || 'Squadra')}</b><br>
              <b>${esc(match.away_team_name || 'Squadra')}</b>
              <div class="muted">${esc(match.venue || 'Impianto da definire')}</div>
            </div>
            <div class="score">Da giocare</div>
          </article>
          <div class="actions" style="margin-top:8px">
            <button class="btn primary"
              onclick="location.href='friendly-match-center.html?id=${encodeURIComponent(match.id)}&team=${encodeURIComponent(currentTeamId() || '')}&v=9945'">
              Prepara distinta
            </button>
          </div>
        `;
      }
    
      async function refreshFriendlyDashboard() {
        try {
          addFriendlyTab();
    
          if (!window.data || !data?.team_id) return;
          if (typeof view !== 'undefined' && view !== 'dashboard') return;
    
          const dashboard = document.querySelector('#content .dashboard');
          if (!dashboard) return;
    
          const firstTile = dashboard.querySelector('.tile');
          if (!firstTile) return;
    
          const r = await sb.rpc('friendly_get_hub');
          if (r.error) return;
    
          const fh = Array.isArray(r.data)
            ? (r.data[0] || {})
            : (r.data || {});
    
          const now = Date.now();
          const teamId = String(data.team_id);
    
          const friendly = (fh.matches || [])
            .filter(m =>
              (String(m.source_home_team_id) === teamId ||
               String(m.source_away_team_id) === teamId) &&
              m.scheduled_at &&
              new Date(m.scheduled_at).getTime() >= now &&
              String(m.status || 'programmata').toLowerCase() !== 'annullata'
            )
            .sort((a, b) =>
              new Date(a.scheduled_at) - new Date(b.scheduled_at)
            )[0];
    
          if (!friendly) return;
    
          const official = typeof nextFixture === 'function'
            ? nextFixture()
            : null;
    
          const officialTime =
            official?.scheduled_at
              ? new Date(official.scheduled_at).getTime()
              : Number.POSITIVE_INFINITY;
    
          const friendlyTime =
            new Date(friendly.scheduled_at).getTime();
    
          if (friendlyTime < officialTime) {
            firstTile.innerHTML =
              '<h3>Prossima partita</h3>' +
              friendlyCard(friendly);
          }
        } catch (e) {
          console.warn('Amichevoli dashboard:', e);
        }
      }
    
      const originalSetView = window.setView;
      if (typeof originalSetView === 'function') {
        window.setView = function (v) {
          originalSetView(v);
          if (v === 'dashboard') {
            setTimeout(refreshFriendlyDashboard, 80);
          }
        };
      }
    
      const observer = new MutationObserver(() => addFriendlyTab());
    
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    
      setTimeout(() => {
        addFriendlyTab();
        refreshFriendlyDashboard();
      }, 900);
    
      setTimeout(refreshFriendlyDashboard, 1800);
    })();
  };

  legacy.onerror = function () {
    const box = document.getElementById('status');
    if (box) {
      box.textContent = 'Errore caricamento modulo Capitano stabile.';
      box.className = 'notice err';
    }
  };

  document.head.appendChild(legacy);
})();

// V9.9.51 - Solo pulizia visiva del falso errore multi-squadra.
// Non modifica selezione squadra, permessi, amichevoli o altre funzioni.
(function(){
  const target='Account collegato a piÃ¹ squadre: seleziona la squadra dalla schermata Il mio account.';
  function clean(){
    const s=document.getElementById('status');
    const app=document.getElementById('app');
    const selected=new URLSearchParams(location.search).get('team');
    if(s && selected && app && !app.classList.contains('hidden') &&
       String(s.textContent||'').includes(target)){
      s.textContent='Accesso attivo Â· '+(document.getElementById('teamName')?.textContent?.trim()||'Squadra');
      s.className='notice ok';
    }
  }
  const o=new MutationObserver(clean);
  o.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true});
  [300,700,1200,2000].forEach(t=>setTimeout(clean,t));
})();
