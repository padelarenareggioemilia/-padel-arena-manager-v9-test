const CACHE='aics-padel-v9-calendar-stable';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const u=new URL(event.request.url);
  if(event.request.mode==='navigate' && u.pathname.endsWith('/calendar.html')){
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(async r=>{
      let html=await r.text();
      html=html.replace(/V9\.9\.13 · Risoluzione automatica completa di anomalie e accavallamenti/g,'V9 · Calendario campionato');
      html=html.replace(/V9\.9\.13 CALENDARIO AUTO/g,'V9 · CALENDARIO');
      if(!html.includes('calendar-v9-stable.js?v=9')){
        html=html.replace('</body>','<script src="calendar-v9-stable.js?v=9"></script></body>');
      }
      return new Response(html,{status:r.status,statusText:r.statusText,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
    }));
    return;
  }
  if(event.request.mode==='navigate'||u.pathname.endsWith('.html')||u.pathname.endsWith('.js')){
    event.respondWith(fetch(event.request,{cache:'no-store'}));
  }
});