(function(){
const cfg=window.PAM_V9_CONFIG;if(!cfg||!window.supabase)return;
const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
function fix(){
 const cards=document.getElementById('cards');
 if(cards){cards.remove();}
 const exp=document.getElementById('expiredMedical');
 if(exp&&!document.getElementById('notifyExpiredBtn')){
   const body=exp.querySelector('.section-body')||exp;
   const wrap=document.createElement('div');wrap.className='actions';wrap.style.margin='10px 0';
   wrap.innerHTML='<button id="notifyExpiredBtn" class="btn primary">📧 Avvisa tutti i Capitani</button><span class="small muted">Una sola email per squadra, con elenco dei giocatori scaduti.</span>';
   body.prepend(wrap);
   document.getElementById('notifyExpiredBtn').onclick=sendAll;
 }
}
async function sendAll(){
 if(!confirm('Inviare adesso una comunicazione a tutti i Capitani che hanno almeno un giocatore con certificato medico scaduto?'))return;
 const b=document.getElementById('notifyExpiredBtn');b.disabled=true;b.textContent='Invio in corso…';
 try{
   const r=await sb.functions.invoke('notify-expired-medical',{body:{}});
   if(r.error)throw r.error;if(!r.data?.ok)throw Error(r.data?.error||'Invio non riuscito');
   alert(`Comunicazioni inviate: ${r.data.teams} squadre · ${r.data.players} giocatori segnalati.`);
 }catch(e){alert('Invio non eseguito: '+(e.message||e))}
 finally{b.disabled=false;b.textContent='📧 Avvisa tutti i Capitani'}
}
const obs=new MutationObserver(()=>fix());obs.observe(document.body,{childList:true,subtree:true});fix();
})();