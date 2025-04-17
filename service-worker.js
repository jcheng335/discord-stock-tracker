// service-worker.js
const CACHE_NAME = 'discord-stock-tracker-v1';
const urlsToCache = [
  './',
  './index.html',
  './script.js',
  './manifest.json'
];

// Install event - cache the essential files
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event - serve from cache or fetch from network
self.addEventListener('fetch', function(event) {
  // Skip for Discord API requests
  if (event.request.url.includes('discord.com/api')) {
    return;
  }
  
  // Only cache GET requests
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // Cache hit - return response
        if (response) {
          return response;
        }
        
        // Clone the request as it's a one-time use stream
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest).then(
          function(response) {
            // Check if we received a valid response
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clone the response as it's a one-time use stream
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then(function(cache) {
                cache.put(event.request, responseToCache);
              });
            
            return response;
          }
        );
      })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', function(event) {
  const cacheWhitelist = [CACHE_NAME];
  
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            // If this cache name isn't in the whitelist, delete it
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
