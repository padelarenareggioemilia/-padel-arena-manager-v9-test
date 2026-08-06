const CACHE='pam-v9-9-5-rosa-protetta';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(key=>caches.delete(key)))));
 self.clients.claim();
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 if(event.request.mode==='navigate'||url.pathname.endsWith('.html')){
  event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>caches.match(event.request)));
 }
});
