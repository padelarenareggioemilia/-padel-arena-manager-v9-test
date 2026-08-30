const CACHE='pam-v9-10-12-calendar-fast';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const u=new URL(event.request.url);
 if(event.request.mode==='navigate'&&u.pathname.endsWith('/calendar.html')){
   event.respondWith(fetch(event.request,{cache:'no-store'}).then(async r=>{
     let html=await r.text();
     if(!html.includes('calendar-v9-clean.js')) html=html.replace('</body>','<script src="calendar-v9-clean.js?v=1011"></script><script src="calendar-v9-fast.js?v=1012"></script></body>');
     else if(!html.includes('calendar-v9-fast.js')) html=html.replace('</body>','<script src="calendar-v9-fast.js?v=1012"></script></body>');
     return new Response(html,{status:r.status,statusText:r.statusText,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
   }));return;
 }
 if(event.request.mode==='navigate'||u.pathname.endsWith('.html'))event.respondWith(fetch(event.request,{cache:'no-store'}));
});