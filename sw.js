// Offline cache for the JC Register. Bump VERSION when app files change.
const VERSION="jcr-v2";
const SHELL=["./","index.html","app.js","xlsx.full.min.js","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","icons/apple-touch-icon.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL.concat(["data.enc"]))));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!=VERSION).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);if(e.request.method!="GET")return;
  if(u.pathname.endsWith("data.enc")){ // network first so new data arrives when online
    e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(VERSION).then(x=>x.put("data.enc",c));return r}).catch(()=>caches.match("data.enc")));return}
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{if(u.origin==location.origin){const c=res.clone();caches.open(VERSION).then(x=>x.put(e.request,c))}return res})));
});