// AICS Padel Championship 2027 - invio email personalizzate ai capitani
// Pubblicare questo script come Applicazione web dall'account aicspadeltour@gmail.com.

const SHARED_SECRET = 'SOSTITUISCI-CON-UN-CODICE-SEGRETO-LUNGO';

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!payload.secret || payload.secret !== SHARED_SECRET) {
      return jsonResponse({ok:false, error:'Codice segreto non valido'});
    }

    const emails = Array.isArray(payload.emails) ? payload.emails : [];
    if (!emails.length) return jsonResponse({ok:false, error:'Nessuna email ricevuta'});

    const remaining = MailApp.getRemainingDailyQuota();
    if (emails.length > remaining) {
      return jsonResponse({
        ok:false,
        error:'Quota giornaliera insufficiente',
        requested:emails.length,
        remaining:remaining
      });
    }

    let sent = 0;
    const errors = [];

    emails.forEach(function(item) {
      try {
        if (!item.to || !item.captain_url) throw new Error('Email o link mancante');
        const subject = 'Benvenuto nell’Area Capitano - ' + (item.team_name || 'AICS Padel Championship 2027');
        const text = buildText(item);
        const html = buildHtml(item);

        MailApp.sendEmail({
          to: item.to,
          subject: subject,
          body: text,
          htmlBody: html,
          name: 'Francesco Lignola - AICS Padel Championship 2027',
          replyTo: 'aicspadeltour@gmail.com'
        });
        sent++;
      } catch (error) {
        errors.push({email:item.to || '', error:String(error)});
      }
    });

    return jsonResponse({ok:errors.length===0, sent:sent, errors:errors});
  } catch (error) {
    return jsonResponse({ok:false, error:String(error)});
  }
}

function buildText(item) {
  return 'Ciao ' + (item.captain_name || 'Capitano') + ',\n\n' +
    'benvenuto nell’Area Capitano AICS Padel Championship 2027 della squadra ' + (item.team_name || '') + '.\n\n' +
    'Per entrare nella tua pagina personale apri questo collegamento:\n' + item.captain_url + '\n\n' +
    'Al primo accesso segui le istruzioni visualizzate e utilizza l’email del capitano: ' + (item.captain_email || item.to) + '.\n\n' +
    'Dalla tua Area Capitano potrai gestire la squadra, la rosa, le distinte, le comunicazioni e le partite. Conserva questo link perché è personale.\n\n' +
    'Cordiali saluti\nFrancesco Lignola\nComitato Tecnico Organizzativo\n' +
    'Referente Centro-Nord AICS Padel Championship 2027\n' +
    'Telefono: 327 691 0287\nEmail: aicspadeltour@gmail.com';
}

function buildHtml(item) {
  const name = escapeHtml(item.captain_name || 'Capitano');
  const team = escapeHtml(item.team_name || '');
  const email = escapeHtml(item.captain_email || item.to || '');
  const url = escapeHtml(item.captain_url || '');
  return '<div style="font-family:Arial,sans-serif;line-height:1.55;color:#0a2e5e">' +
    '<p>Ciao <b>' + name + '</b>,</p>' +
    '<p>benvenuto nell’<b>Area Capitano AICS Padel Championship 2027</b> della squadra <b>' + team + '</b>.</p>' +
    '<p>Per entrare nella tua pagina personale:</p>' +
    '<p><a href="' + url + '" target="_blank" rel="noopener" style="display:inline-block;padding:12px 18px;background:#164a95;color:#fff;text-decoration:none;border-radius:10px;font-weight:bold">ENTRA NELL’AREA CAPITANO</a></p>' +
    '<p style="font-size:13px;color:#526b86">Se il pulsante non si apre, copia e incolla questo indirizzo nel browser:<br><a href="' + url + '">' + url + '</a></p>' +
    '<p>Al primo accesso segui le istruzioni visualizzate e utilizza l’email <b>' + email + '</b>.</p>' +
    '<p>Dalla tua Area Capitano potrai gestire la squadra, la rosa, le distinte, le comunicazioni e le partite. Conserva questo link perché è personale.</p>' +
    '<p>Cordiali saluti<br><b>Francesco Lignola</b><br>Comitato Tecnico Organizzativo<br>Referente Centro-Nord AICS Padel Championship 2027<br>Telefono: 327 691 0287<br>Email: <a href="mailto:aicspadeltour@gmail.com">aicspadeltour@gmail.com</a></p>' +
    '</div>';
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, function(char) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
  });
}

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
