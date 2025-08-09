self.addEventListener('install', e=>{
  e.waitUntil(caches.open('fops-v1').then(c=>c.addAll(['./','./index.html','./style.css','./app.js','./data.js','./manifest.json'])));
});
self.addEventListener('fetch', e=>{
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});