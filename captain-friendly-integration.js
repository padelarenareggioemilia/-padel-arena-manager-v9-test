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
        (team ? '?team=' + encodeURIComponent(team) + '&v=3' : '?v=3');
    };

    tabs.appendChild(btn);
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
            <span class="badge good">AMICHEVOLE · FUORI CLASSIFICA</span>
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
          onclick="location.href='friendly-match-center.html?id=${encodeURIComponent(match.id)}&v=3'">
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

      const hubFriendly = Array.isArray(r.data)
        ? (r.data[0] || {})
        : (r.data || {});

      const now = Date.now();
      const teamId = String(data.team_id);

      const friendly = (hubFriendly.matches || [])
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
        setTimeout(refreshFriendlyDashboard, 50);
      }
    };
  }

  const observer = new MutationObserver(() => {
    addFriendlyTab();
  });

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
