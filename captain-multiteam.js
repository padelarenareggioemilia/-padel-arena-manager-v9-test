// V9.9.42 - FIX definitivo selezione multi-squadra

(async function () {
  const selectedTeam = new URLSearchParams(location.search).get('team');

  try {
    const session = await sb.auth.getSession();

    if (!session.data.session) {
      location.replace('login.html?v=9942');
      return;
    }

    const ar = await sb.rpc('get_my_account_accesses');

    if (ar.error) throw ar.error;

    const ctx = Array.isArray(ar.data)
      ? (ar.data[0] || {})
      : (ar.data || {});

    const teams = Array.isArray(ctx.staff_teams)
      ? ctx.staff_teams
      : [];

    // Se gestisce più squadre e non ne è stata scelta una,
    // torna automaticamente alla schermata "Il mio account".
    if (!selectedTeam) {
      if (teams.length > 1) {
        location.replace('account-home.html?v=9942');
        return;
      }

      // Se gestisce una sola squadra, entra direttamente.
      if (teams.length === 1) {
        location.replace(
          'captain-home.html?team=' +
          encodeURIComponent(teams[0].team_id) +
          '&v=9942'
        );
        return;
      }

      return;
    }

    // Attende il caricamento della pagina principale.
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verifica che l'account abbia davvero accesso
    // alla squadra selezionata.
    const access = teams.find(
      x => String(x.team_id) === String(selectedTeam)
    );

    if (!access) {
      throw new Error(
        'Questa squadra non risulta associata al tuo account.'
      );
    }

    staffRole = access.role || 'captain';

    // Carica ESATTAMENTE la squadra scelta.
    const rr = await sb.rpc(
      'get_my_captain_portal_for_team',
      {
        p_team_id: selectedTeam
      }
    );

    if (rr.error) throw rr.error;

    data = Array.isArray(rr.data)
      ? rr.data[0]
      : rr.data;

    if (!data?.ok) {
      throw new Error(
        data?.message || 'Squadra non collegata.'
      );
    }

    // Sicurezza: il server non deve poter restituire
    // una squadra diversa da quella selezionata.
    if (
      data.team_id &&
      String(data.team_id) !== String(selectedTeam)
    ) {
      throw new Error(
        'Il server ha restituito una squadra diversa da quella selezionata.'
      );
    }

    let ed = {};
    teamEditEnabled = false;

    if (staffRole === 'captain') {
      const es = await sb.rpc(
        'captain_get_own_team_edit_state',
        {
          p_team_id: selectedTeam
        }
      );

      if (!es.error) {
        ed = Array.isArray(es.data)
          ? (es.data[0] || {})
          : (es.data || {});

        teamEditEnabled =
          ed?.captain_team_edit_enabled === true;
      }
    }

    data.team = {
      ...(data.team || {}),
      ...(ed || {})
    };

    await loadTeamHub();
    await loadTeamDocuments();

    const t = data.team || {};

    teamName.textContent =
      t.name || 'Squadra';

    teamMeta.textContent = [
      t.series,
      t.club_name,
      t.club_city
    ]
      .filter(Boolean)
      .join(' · ');

    captainMeta.textContent =
      `Capitano: ${t.captain_name || ''}`;

    heroTitle.textContent =
      staffRole === 'secretary'
        ? 'Area Segretario'
        : 'Area Capitano';

    heroSub.textContent =
      t.name || 'AICS Padel Championship';

    teamLogo.src =
      t.logo_url || '';

    teamLogo.style.visibility =
      t.logo_url ? 'visible' : 'hidden';

    playersKpi.textContent =
      arr(data.players)
        .filter(x => x.status === 'approved')
        .length;

    pendingKpi.textContent =
      arr(data.players)
        .filter(x => x.status === 'pending')
        .length;

    lineupsKpi.textContent =
      arr(data.lineups).length;

    futureKpi.textContent =
      arr(data.fixtures)
        .filter(x => !done(x))
        .length;

    const firstGroup =
      arr(data.groups)[0];

    const rows =
      firstGroup
        ? standings(firstGroup)
        : [];

    const pos =
      rows.findIndex(
        x => String(x.id) === String(selectedTeam)
      );

    positionKpi.textContent =
      pos >= 0
        ? `${pos + 1}°`
        : '–';

    pointsKpi.textContent =
      pos >= 0
        ? rows[pos].pt
        : 0;

    status.textContent =
      (
        staffRole === 'secretary'
          ? 'Accesso segretario'
          : 'Accesso capitano'
      ) +
      ' · ' +
      (t.name || 'Squadra');

    status.className =
      'notice ok';

    app.classList.remove('hidden');

    // Permessi segretario.
    if (staffRole === 'secretary') {
      document
        .querySelector('[data-view="secretaries"]')
        ?.remove();

      document
        .querySelector('[data-view="management"]')
        ?.remove();

      if (
        typeof staffModeBtn !== 'undefined' &&
        staffModeBtn
      ) {
        staffModeBtn.textContent =
          'Modalità Segretario';
      }
    }

    render();

    // Pulsante per tornare alla scelta squadra.
    const hero =
      document.querySelector('.hero');

    if (
      hero &&
      !document.getElementById('accountChooserBtn')
    ) {
      const button =
        document.createElement('button');

      button.id =
        'accountChooserBtn';

      button.className =
        'btn secondary';

      button.textContent =
        'Cambia squadra / modalità';

      button.onclick = () =>
        location.href =
          'account-home.html?v=9942';

      hero.appendChild(button);
    }

    // "Aggiorna" deve mantenere la squadra selezionata.
    const refresh =
      document.querySelector(
        '.identity button[onclick="loadAll()"]'
      );

    if (refresh) {
      refresh.onclick = () =>
        location.reload();
    }

  } catch (error) {
    status.textContent =
      'Errore selezione squadra: ' +
      (error?.message || String(error));

    status.className =
      'notice err';

    app.classList.add('hidden');
  }
})();
// V9.9.43 - FIX DISTINTA: selezione automatica giocatore

document.addEventListener('change', function (event) {

  // Se assegno un ruolo, il giocatore viene selezionato automaticamente
  const position = event.target.closest?.('.lp-position');

  if (position) {
    const playerId = position.dataset.player;

    if (playerId && position.value) {
      const checkbox = document.querySelector(
        `.lp-check[data-player="${playerId}"]`
      );

      if (checkbox) {
        checkbox.checked = true;
      }
    }
  }

  // Se seleziono manualmente il giocatore ma non ha ancora un ruolo,
  // porto subito il cursore sul menu ruolo
  const checkbox = event.target.closest?.('.lp-check');

  if (checkbox && checkbox.checked) {
    const playerId = checkbox.dataset.player;

    const position = document.querySelector(
      `.lp-position[data-player="${playerId}"]`
    );

    if (position && !position.value) {
      position.focus();
    }
  }
});// V9.9.43 - FIX DISTINTA: selezione automatica giocatore

document.addEventListener('change', function (event) {

  // Se assegno un ruolo, il giocatore viene selezionato automaticamente
  const position = event.target.closest?.('.lp-position');

  if (position) {
    const playerId = position.dataset.player;

    if (playerId && position.value) {
      const checkbox = document.querySelector(
        `.lp-check[data-player="${playerId}"]`
      );

      if (checkbox) {
        checkbox.checked = true;
      }
    }
  }

  // Se seleziono manualmente il giocatore ma non ha ancora un ruolo,
  // porto subito il cursore sul menu ruolo
  const checkbox = event.target.closest?.('.lp-check');

  if (checkbox && checkbox.checked) {
    const playerId = checkbox.dataset.player;

    const position = document.querySelector(
      `.lp-position[data-player="${playerId}"]`
    );

    if (position && !position.value) {
      position.focus();
    }
  }
});
