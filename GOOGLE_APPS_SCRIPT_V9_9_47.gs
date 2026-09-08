const DESTINATARIO_AICS = 'reggioemilia@aics.it';
const CC_AICS = 'aicspadeltour@gmail.com';
const SUPABASE_URL = 'https://ggnmpzfuqchcwzgaxxzx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_JJUF1lt3lob4r0z2UBTOiw_2YUjk18m';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (!data || !data.authToken) {
      throw new Error('Richiesta non valida');
    }

    verificaAdminSupabase(data.authToken);

    if (data.action === 'expired_medical') {
      return inviaCertificatiScaduti(data);
    }

    if (!data.requestNumber) {
      throw new Error('Richiesta tesseramento non valida');
    }

    const urls = [data.csvUrl, data.xlsxUrl, data.pdfUrl, data.receiptUrl].filter(Boolean);
    if (urls.length !== 4) throw new Error('Allegati incompleti');

    const allegati = urls.map(function(url) {
      return UrlFetchApp.fetch(url, {followRedirects:true,muteHttpExceptions:false}).getBlob();
    });

    const oggetto = 'AICS Padel - Richiesta tesseramenti ' + data.requestNumber + ' - ' + data.teamName;
    const testo =
      'Buongiorno,\n\n' +
      'si trasmette la richiesta di tesseramento relativa alla squadra:\n\n' +
      'Club affiliato: ' + data.clubName + '\n' +
      'Squadra: ' + data.teamName + '\n' +
      'Numero giocatori: ' + data.playerCount + '\n' +
      'Importo versato: € ' + data.amount + '\n' +
      'Riferimento richiesta: ' + data.requestNumber + '\n\n' +
      'In allegato sono presenti:\n- elenco giocatori in formato CSV\n- elenco giocatori in formato Excel\n- riepilogo PDF\n- ricevuta del pagamento\n\nCordiali saluti\nAICS Padel Tour';

    GmailApp.sendEmail(DESTINATARIO_AICS, oggetto, testo, {
      cc: CC_AICS,
      attachments: allegati,
      name: 'AICS Padel Tour'
    });

    return jsonOk({ok:true,sentAt:new Date().toISOString()});
  } catch (err) {
    return jsonOk({ok:false,error:String(err)});
  }
}

function inviaCertificatiScaduti(data) {
  const notices = Array.isArray(data.notices) ? data.notices : [];
  let sent = 0;
  notices.forEach(function(n) {
    if (!n.captainEmail || !Array.isArray(n.players) || !n.players.length) return;

    const elenco = n.players.map(function(p) {
      return '- ' + p.name + ' — scaduto il ' + formatDataIT(p.expiry);
    }).join('\n');

    const testo =
      'Buongiorno ' + (n.captainName || 'Capitano') + ',\n\n' +
      'ti segnaliamo che per la squadra ' + n.teamName + ' risultano scaduti i certificati medici dei seguenti giocatori:\n\n' +
      elenco + '\n\n' +
      'Ti chiediamo di far regolarizzare i certificati e aggiornare la documentazione appena possibile.\n\n' +
      'Grazie per la collaborazione.\n\nAICS Padel Tour';

    GmailApp.sendEmail(
      n.captainEmail,
      'AICS Padel - Certificati medici scaduti - ' + n.teamName,
      testo,
      {name:'AICS Padel Tour', cc:CC_AICS}
    );
    sent++;
  });
  return jsonOk({ok:true,sentAt:new Date().toISOString(),teamsSent:sent});
}

function formatDataIT(v) {
  if (!v) return '';
  const p=String(v).split('-');
  return p.length===3 ? p[2]+'/'+p[1]+'/'+p[0] : String(v);
}

function verificaAdminSupabase(token) {
  const userResponse = UrlFetchApp.fetch(SUPABASE_URL + '/auth/v1/user', {
    method:'get',
    headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+token},
    muteHttpExceptions:true
  });
  if (userResponse.getResponseCode() !== 200) throw new Error('Sessione Supabase non valida');

  const adminResponse = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/is_v9_admin', {
    method:'post',
    contentType:'application/json',
    payload:'{}',
    headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+token},
    muteHttpExceptions:true
  });
  if (adminResponse.getResponseCode() !== 200) throw new Error('Impossibile verificare il ruolo Admin');
  if (JSON.parse(adminResponse.getContentText()) !== true) throw new Error('Accesso consentito solo all’Admin');
}

function jsonOk(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
