// Offline cache for the JC Register. Network first, so updates show on the next refresh;
// the cached copy is only used when there's no signal.
const VERSION="jcr-v4";
const SHELL=["./","index.html","app.js","xlsx.full.min.js","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","icons/apple-touch-icon.png","data.enc"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!=VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  if(e.request.method!="GET"||new URL(e.request.url).origin!=location.origin)return;
  e.respondWith(fetch(e.request,{cache:"no-cache"}).then(res=>{if(res.ok){const c=res.clone();caches.open(VERSION).then(x=>x.put(e.request,c))}return res})
    .catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match("index.html"))));
});
