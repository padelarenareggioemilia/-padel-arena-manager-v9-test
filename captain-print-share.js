// V9.9.54 - STAMPA / CONDIVIDI PDF AREA CAPITANO
(function () {
  'use strict';

  const CONTROL_ID = 'captainPrintShareButton';
  const STYLE_ID = 'captainPrintShareStyles';

  function currentSectionTitle() {
    const activeTab = document.querySelector('.tab.active');
    if (activeTab && activeTab.textContent.trim()) return activeTab.textContent.trim();
    const heading = document.querySelector('#content h2, #content h3, main h1, header h1');
    return heading && heading.textContent.trim() ? heading.textContent.trim() : 'Area Capitano';
  }

  function currentTeamName() {
    const team = document.getElementById('teamName');
    if (team && team.textContent.trim()) return team.textContent.trim();
    const summary = document.querySelector('#summary h2');
    return summary && summary.textContent.trim() ? summary.textContent.trim() : 'AICS Padel Championship';
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .captain-print-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .captain-print-heading{display:none}
      @media(max-width:700px){
        .identity>.captain-print-actions{grid-column:1/-1;display:grid;width:100%}
        .captain-print-actions .btn{width:100%}
      }
      @media print{
        @page{size:auto;margin:12mm}
        body{background:#fff!important;color:#111!important}
        body:before,.captain-print-control,.tabs,#roleSwitch,#status,#authStatus,
        .shell>header.hero,.shell>.actions,.btn,button{display:none!important}
        .shell{width:100%!important;max-width:none!important;margin:0!important;padding:0!important}
        .captain-print-heading{display:block!important;margin:0 0 14px;padding:0 0 10px;border-bottom:2px solid #164a95}
        .captain-print-heading h1{margin:0;font-size:20pt;color:#082f68}
        .captain-print-heading p{margin:4px 0 0;color:#444}
        .hero,.card,.rule,.tile,.fixture,.match{box-shadow:none!important;break-inside:avoid}
        .table-wrap{overflow:visible!important}
        table{min-width:0!important;width:100%!important}
        a{color:#111!important;text-decoration:none!important}
      }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function printOrSharePdf() {
    let heading = document.getElementById('captainPrintHeading');
    if (!heading) {
      heading = document.createElement('section');
      heading.id = 'captainPrintHeading';
      heading.className = 'captain-print-heading';
      document.querySelector('main.shell')?.prepend(heading);
    }
    const team = currentTeamName();
    const section = currentSectionTitle();
    heading.innerHTML = `<h1>${escapeHtml(team)}</h1><p>${escapeHtml(section)} · AICS Padel Championship 2027</p>`;
    const previousTitle = document.title;
    document.title = `${team} - ${section}`;
    const restore = () => {
      document.title = previousTitle;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    window.print();
    window.setTimeout(restore, 1500);
  }

  function makeButton() {
    const button = document.createElement('button');
    button.id = CONTROL_ID;
    button.type = 'button';
    button.className = 'btn secondary captain-print-control';
    button.textContent = 'Stampa / Condividi PDF';
    button.addEventListener('click', printOrSharePdf);
    return button;
  }

  function installControl() {
    if (document.getElementById(CONTROL_ID)) return true;
    installStyles();
    const button = makeButton();
    const identity = document.querySelector('.identity');
    if (identity) {
      const refresh = [...identity.children].find(el => el.matches?.('button.btn'));
      const actions = document.createElement('div');
      actions.className = 'captain-print-actions';
      if (refresh) {
        refresh.replaceWith(actions);
        actions.appendChild(refresh);
      } else {
        identity.appendChild(actions);
      }
      actions.appendChild(button);
      return true;
    }
    const topActions = document.querySelector('main.shell > .actions, #authStatus + .actions');
    if (topActions) {
      topActions.appendChild(button);
      return true;
    }
    const hero = document.querySelector('main.shell > .hero, header.hero');
    if (hero) {
      const actions = document.createElement('div');
      actions.className = 'captain-print-actions captain-print-control';
      actions.style.marginTop = '12px';
      button.classList.remove('captain-print-control');
      actions.appendChild(button);
      hero.appendChild(actions);
      return true;
    }
    return false;
  }

  function start() {
    if (installControl()) return;
    const observer = new MutationObserver(() => {
      if (installControl()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 10000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
