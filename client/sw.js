const CACHE_NAME = 'webapp-v3';
const urlsToCache = [
'/',
'/client/index.html',
'/client/styles.css',
'/client/app.js',
'/client/icon-192.png',
'/client/icon-512.png',
'/client/manifest.json',
'/client/all.min.css'
];

self.addEventListener('install', event => {
event.waitUntil(
caches.open(CACHE_NAME)
.then(cache => {
console.log('Cache abierto');
return cache.addAll(urlsToCache);
})
.catch(error => {
console.log('Error durante la instalación:', error);
})
);
});

self.addEventListener('fetch', event => {
// No cachear requests a la API
if (event.request.url.includes('/api/')) {
return;
}

event.respondWith(
caches.match(event.request)
.then(response => {
// Devuelve la respuesta en cache o haz fetch
return response || fetch(event.request);
})
.catch(error => {
console.log('Error en fetch:', error);
})
);
});

self.addEventListener('activate', event => {
event.waitUntil(
caches.keys().then(cacheNames => {
return Promise.all(
cacheNames.map(cacheName => {
if (cacheName !== CACHE_NAME) {
console.log('Eliminando cache viejo:', cacheName);
return caches.delete(cacheName);
}
})
);
})
);
});