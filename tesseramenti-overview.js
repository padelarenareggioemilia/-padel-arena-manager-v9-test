(function(){
const cfg=window.PAM_V9_CONFIG;if(!cfg||!window.supabase)return;
const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
function style(){if(document.getElementById('tessOverviewStyle'))return;const s=document.createElement('style');s.id='tessOverviewStyle';s.textContent=`
.tess-overview{background:#fff;border:1px solid #b9cde3;border-radius:20px;padding:16px;margin:12px 0;box-shadow:0 13px 28px rgba(8,47,104,.1);color:#0a2e5e}
.tess-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.tess-head h2{margin:0}
.tess-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:9px;margin-top:13px}.tess-kpi{border:1px solid #b9cde3;border-radius:14px;padding:12px;background:#edf4fb;text-align:center}.tess-kpi strong{display:block;font-size:25px;color:#164a95}.tess-kpi span{font-size:11px;color:#627b97;font-weight:800}
.tess-kpi.bad{background:#fdecef;border-color:#dd7a85}.tess-kpi.warn{background:#fff7dd;border-color:#d9b757}.tess-kpi.good{background:#eaf8f0;border-color:#79bf90}
.tess-alert{margin-top:12px;padding:11px;border-radius:12px;background:#fff7dd;border:1px solid #d9b757}.tess-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.tess-btn{border:0;border-radius:10px;padding:10px 12px;font-weight:900;cursor:pointer;background:#164a95;color:#fff}.tess-btn.secondary{background:#fff;color:#164a95;border:1px solid #164a95}
@media(max-width:900px){.tess-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:560px){.tess-grid{grid-template-columns:repeat(2,1fr)}}`;document.head.appendChild(s)}
const badge=(n,l,c='')=>`<div class="tess-kpi ${c}"><strong>${Number(n||0)}</strong><span>${l}</span></div>`;
function addShortcuts(){
 const dash=document.querySelector('.pam-dashboard'); if(!dash||document.getElementById('pamTessShortcut'))return;
 const a=document.createElement('div');a.className='pam-shortcut';a.id='pamTessShortcut';a.onclick=()=>location.href='admin-tesseramenti.html?v=9947';a.innerHTML='<div class="pam-shortcut-icon">💳</div><div><b>Gestione Tesseramenti</b><span>Richieste pagamento, ricevute e invio AICS</span></div>';
 const b=document.createElement('div');b.className='pam-shortcut';b.onclick=()=>location.href='situazione-tesseramenti.html?v=9947';b.innerHTML='<div class="pam-shortcut-icon">📋</div><div><b>Situazione Tesseramenti</b><span>Controllo di tutte le squadre</span></div>';
 dash.append(a,b);
}
async function load(){
 try{
  const ses=(await sb.auth.getSession()).data.session;if(!ses)return;
  const p=await sb.from('profiles').select('role').eq('id',ses.user.id).maybeSingle();if(p.data?.role!=='admin')return;
  addShortcuts();
  const r=await sb.rpc('admin_tesseramenti_overview');if(r.error)throw r.error;
  style();const d=r.data||{},s=d.summary||{},teams=d.teams||[],urgent=teams.filter(t=>['ricevuta_da_verificare','pronta_da_inviare'].includes(t.stato_operativo));
  if(document.getElementById('tesseramentiOverview'))return;
  const card=document.createElement('section');card.className='tess-overview';card.id='tesseramentiOverview';
  card.innerHTML=`<div class="tess-head"><div><h2>💳 Situazione tesseramenti</h2><div style="color:#627b97">Controllo rapido di tutte le squadre</div></div><button class="tess-btn secondary" onclick="location.href='situazione-tesseramenti.html?v=9947'">Apri situazione completa</button></div>
  <div class="tess-grid">${badge(s.squadre_totali,'Squadre')}${badge(s.tesserati,'Tesserati','good')}${badge(s.da_tesserare,'Da tesserare',s.da_tesserare?'warn':'')}${badge(s.ricevute_da_verificare,'Ricevute da verificare',s.ricevute_da_verificare?'bad':'')}${badge(s.pronte_da_inviare,'Pronte da inviare',s.pronte_da_inviare?'bad':'')}${badge(s.non_schierabili,'Non schierabili')}</div>
  ${urgent.length?`<div class="tess-alert"><b>Attenzione Admin:</b> ${urgent.length} squadre richiedono un tuo intervento.</div>`:'<div class="tess-alert" style="background:#eaf8f0;border-color:#79bf90"><b>Nessuna urgenza tesseramenti.</b></div>'}
  <div class="tess-actions"><button class="tess-btn" onclick="location.href='admin-tesseramenti.html?v=9947'">Gestisci tesseramenti</button><button class="tess-btn secondary" onclick="location.href='situazione-tesseramenti.html?v=9947'">Dettaglio per squadra</button></div>`;
  const path=location.pathname.toLowerCase();
  if(path.includes('diagnostics')){const anchor=document.getElementById('summaryCard')||document.querySelector('.card');anchor?.insertAdjacentElement('afterend',card)}
  else{const anchor=document.getElementById('controlCenter');anchor?.insertAdjacentElement('afterend',card)}
 }catch(e){console.warn(e)}
}
if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',load);else load();
})();