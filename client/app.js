class ClientApp {
constructor() {
this.products = [];
this.banners = [];
this.settings = {};
this.notifications = [];
this.unreadCount = 0;
this.deviceId = this.getDeviceId();
this.votedProducts = this.getVotedProducts();
this.notificationCheckInterval = null;
this.realtimeConnection = null;
this.isConnected = false;
this.reconnectTimeout = null;
this.currentBannerIndex = 0;
this.bannerInterval = null;
this.isNotificationsOpen = false;
this.isOptionsOpen = false;
this.isFloatingMenuOpen = false;
this.setupAppLifecycle();
this.init();
}

async init() {
try {
this.showLoading(10);
await this.cleanStorage();
this.showLoading(30);
await this.registerDevice();
this.showLoading(50);
await this.loadSettings();
this.showLoading(70);
await Promise.all([
this.loadBanners(),
this.loadProducts(),
this.loadNotifications()
]);
this.showLoading(90);
await this.connectRealtime();
this.showLoading(100);
this.setupEventListeners();
this.applyTheme();
this.startNotificationPolling();
this.startBannerRotation();

setTimeout(() => {
this.hideLoading();
}, 500);

} catch (error) {
console.error('Error inicializando la aplicación:', error);
this.showAlert('Error', 'No se pudo cargar la aplicación. Intenta recargar la página.');
}
}

showLoading(progress) {
const progressBar = document.querySelector('.progress-bar');
const loadingStatus = document.getElementById('loadingStatus');

if (progressBar) {
progressBar.style.width = `${progress}%`;
}

if (loadingStatus) {
const statuses = {
10: 'Limpiando cache...',
30: 'Registrando dispositivo...',
50: 'Cargando configuración...',
70: 'Cargando datos...',
90: 'Conectando en tiempo real...',
100: '¡Listo!'
};
loadingStatus.textContent = statuses[progress] || `Cargando... ${progress}%`;
}
}

hideLoading() {
const loading = document.getElementById('loading');
const app = document.querySelector('.app');

if (loading) {
loading.style.opacity = '0';
setTimeout(() => {
loading.style.display = 'none';
if (app) app.style.display = 'flex';
}, 300);
}
}

async cleanStorage() {
try {
const keysToKeep = ['deviceId', 'votedProducts'];
const allKeys = Object.keys(localStorage);

for (const key of allKeys) {
if (!keysToKeep.includes(key)) {
localStorage.removeItem(key);
}
}

if ('caches' in window) {
const cacheNames = await caches.keys();
await Promise.all(
cacheNames.map(cacheName => caches.delete(cacheName))
);
}
} catch (error) {
console.error('Error limpiando storage:', error);
}
}

getDeviceId() {
let deviceId = localStorage.getItem('deviceId');
if (!deviceId) {
deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
localStorage.setItem('deviceId', deviceId);
}
return deviceId;
}

getVotedProducts() {
return JSON.parse(localStorage.getItem('votedProducts') || '{}');
}

setVotedProduct(productId, type) {
this.votedProducts[productId] = type;
localStorage.setItem('votedProducts', JSON.stringify(this.votedProducts));
}

async connectRealtime() {
if (this.realtimeConnection) {
this.realtimeConnection.close();
this.realtimeConnection = null;
}

try {
this.realtimeConnection = new EventSource('/api/realtime/events', {
withCredentials: false
});

let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
const baseReconnectDelay = 1000;

this.realtimeConnection.onopen = () => {
reconnectAttempts = 0;
this.isConnected = true;
this.updateConnectionStatus();
console.log('Conexión SSE establecida');
};

this.realtimeConnection.onmessage = (event) => {
try {
if (event.data.trim() === ': heartbeat') {
return;
}

const data = JSON.parse(event.data);
this.handleRealtimeEvent(data.event, data.data);
} catch (error) {
console.error('Error procesando evento SSE:', error);
}
};

this.realtimeConnection.onerror = (error) => {
console.error('Error en conexión SSE:', error);
this.isConnected = false;
this.updateConnectionStatus();

if (this.realtimeConnection.readyState === EventSource.CLOSED) {
reconnectAttempts++;

if (reconnectAttempts > maxReconnectAttempts) {
console.error('Número máximo de reconexiones alcanzado');
return;
}

const reconnectDelay = Math.min(
baseReconnectDelay * Math.pow(2, reconnectAttempts - 1),
30000
);

console.log(`Reconectando en ${reconnectDelay}ms (intento ${reconnectAttempts})`);

setTimeout(() => {
if (!this.isConnected) {
this.connectRealtime();
}
}, reconnectDelay);
}
};

} catch (error) {
console.error('Error inicializando conexión SSE:', error);
setTimeout(() => this.connectRealtime(), 5000);
}
}

handleRealtimeEvent(event, data) {
switch (event) {
case 'connected':
console.log('Conectado al servidor con ID:', data.clientId);
break;

case 'products_updated':
this.handleProductsUpdate(data);
break;

case 'new_notification':
this.handleNewNotification(data.notification);
break;

case 'banners_updated':
this.loadBanners();
break;

case 'settings_updated':
this.loadSettings();
break;
}
}

async handleProductsUpdate(updateData) {
const { action, product, productId } = updateData;

switch (action) {
case 'created':
case 'updated':
await this.loadProducts();
this.showAlert('Éxito', `Producto ${action === 'created' ? 'agregado' : 'actualizado'} correctamente`);
break;

case 'deleted':
this.products = this.products.filter(p => p.id !== productId);
this.renderProducts();
this.showAlert('Éxito', 'Producto eliminado correctamente');
break;
}
}

handleNewNotification(notification) {
this.notifications.unshift({ ...notification, is_read: false });
this.unreadCount++;
this.updateNotificationBadge();

this.showNotification(notification);
this.playNotificationSound();
this.requestNotificationPermission(notification);

this.markAsRead(notification.id);
}

playNotificationSound() {
try {
const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF5fdJivrJBhNjVgodDbq2EcBj+Nq7qziFcqABVqo8bJpXZJAAAACER8jJund0EcAAAACDZidI+winAsAAAABi1QX4Wfl4E7AAAABRIjN2aHl5bGXgAAAAUaK0hqjJ2Z2EIAAAAGFBs2V3iXmNBNAAAABhUZMVB0kZbQTgAAAAYUFi9LbIeV0E4AAAAGEhUsRmiEktBOAAAABhIUK0NjgpHQTgAAAAYREilAXH6O0E4AAAAGDxAmPFh7jNBOAAAABg4OJDhUd4rQTgAAAAYNDCM1UnWI0E4AAAAGCwohMlBzhtBOAAAABgoJHjBOcYTQTgAAAAYJCB0uTG+B0E4AAAAGCAccLEptf9BOAAAABgcGGipIan3QTgAAAAYGBRgpSGh80E4AAAAGBQQWJ0Zme9BOAAAABgQDFCVFZHrQTgAAAAYDARIlRGN50E4AAAAGAgAQJENieNBOAAAABgL/DiNCYXfQTgAAAAYC/g0iQWB20E4AAAAGAv0MIkBfddBOAAAABgL8CyE/XnTQTgAAAAYC+wogPl1z0E4AAAAGAvkJHz1cctBOAAAABgL4CB48W3HQTgAAAAYC9wcdO1pw0E4AAAAGAvYGHjpZb9BOAAAABgL1BR05WG7QTgAAAAYC9AQcOFdt0E4AAAAGAvMDGzdWbNBOAAAABgLyAhk2VWvQTgAAAAYC8QEYNVRq0E4AAAAGAvAAFjRTadBOAAAABgLv/xUzUmnQTgAAAAYC7v4UMlFo0E4AAAAGAu39EzFQZ9BOAAAABgLs/BMwT2bQTgAAAAYC6/sSL05l0E4AAAAGAur6ES5NZNBOAAAABgLp+RAuTGPQTgAAAAYC6PgPLUtj0E4AAAAGAuf3Di1KYtBOAAAABgLm9g0sSmHQTgAAAAYC5fUMLElg0E4AAAAGA+T0CyxIX9BOAAAABgPj8worSF7QTgAAAAYC4vMJK0dd0E4AAAAGAuHxCCtGXNBOAAAABgLg8AcrRVvQTgAAAAYC3/AFK0Ra0E4AAAAGAt7vBitDWdBOAAAABgLd7gUrQljQTgAAAAYC3O0EK0FX0E4AAAAGAtvsAytAVtBOAAAABgLa6wIrP1XQTgAAAAYC2eoBKz5U0E4AAAAGAtjpACs9U9BOAAAABgLX6P8qPFLQTgAAAAYC1uf+KjtR0E4AAAAGAtXm/So6UNBOAAAABgLU5fwqOVDQTgAAAAYC0+X7KjhP0E4AAAAGAtLl+io3TtBOAAAABgLR5PkqNk3QTgAAAAYC0OT4KjVM0E4AAAAGAs/k9yo0S9BOAAAABgLO4/YqM0rQTgAAAAY');
audio.volume = 0.3;
audio.play().catch(e => console.log('No se pudo reproducir sonido:', e));
} catch (error) {
console.error('Error reproduciendo sonido:', error);
}
}

async requestNotificationPermission(notification) {
if (!('Notification' in window)) return;

if (Notification.permission === 'granted') {
this.showSystemNotification(notification);
} else if (Notification.permission === 'default') {
const permission = await Notification.requestPermission();
if (permission === 'granted') {
this.showSystemNotification(notification);
}
}
}

showSystemNotification(notification) {
if (!('Notification' in window)) return;

const options = {
body: notification.message,
icon: '/client/icons/icon-192.png',
badge: '/client/icons/icon-192.png',
tag: 'webapp-notification'
};

try {
const systemNotification = new Notification(notification.title, options);

systemNotification.onclick = () => {
window.focus();
systemNotification.close();
};

setTimeout(() => systemNotification.close(), 5000);
} catch (error) {
console.error('Error mostrando notificación del sistema:', error);
}
}

updateConnectionStatus() {
let statusElement = document.querySelector('.connection-status');

if (!statusElement) {
statusElement = document.createElement('div');
statusElement.className = 'connection-status';
document.body.appendChild(statusElement);
}

if (this.isConnected) {
statusElement.innerHTML = '<i class="fas fa-wifi"></i> Conectado';
statusElement.className = 'connection-status connected';
} else {
statusElement.innerHTML = '<i class="fas fa-wifi-slash"></i> Reconectando...';
statusElement.className = 'connection-status disconnected';
}
}

setupAppLifecycle() {
window.addEventListener('beforeunload', () => {
if (this.realtimeConnection) {
this.realtimeConnection.close();
}
if (this.bannerInterval) {
clearInterval(this.bannerInterval);
}
});

document.addEventListener('visibilitychange', () => {
if (document.hidden) {
console.log('Página oculta');
} else {
if (!this.isConnected && this.realtimeConnection?.readyState === EventSource.CLOSED) {
console.log('Reconectando SSE tras volver a la página');
this.connectRealtime();
}
}
});

window.addEventListener('online', () => {
console.log('Conexión de red restaurada');
if (!this.isConnected) {
this.connectRealtime();
}
});

window.addEventListener('offline', () => {
console.log('Conexión de red perdida');
this.isConnected = false;
this.updateConnectionStatus();
});
}

async fetchData(endpoint) {
try {
const response = await fetch(`/api/client/${endpoint}`);
if (!response.ok) throw new Error(`HTTP ${response.status}`);
return await response.json();
} catch (error) {
console.error(`Error fetching ${endpoint}:`, error);
return null;
}
}

async registerDevice() {
try {
await fetch('/api/client/register-device', {
method: 'POST',
headers: {
'Content-Type': 'application/json'
},
body: JSON.stringify({
device_id: this.deviceId,
user_agent: navigator.userAgent
})
});
} catch (error) {
console.error('Error al registrar dispositivo:', error);
}
}

async loadSettings() {
this.settings = await this.fetchData('settings');
if (this.settings && this.settings.logo_data) {
document.getElementById('logoImage').src = this.settings.logo_data;
}
this.applyTheme();
}

async loadBanners() {
this.banners = await this.fetchData('banners');
this.renderBanners();
}

async loadProducts() {
this.products = await this.fetchData('products');
this.renderProducts();
}

async loadNotifications() {
try {
const response = await fetch(`/api/client/notifications?device_id=${this.deviceId}`);
if (response.ok) {
this.notifications = await response.json();
await this.getUnreadCount();
}
} catch (error) {
console.error('Error al cargar notificaciones:', error);
}
}

async getUnreadCount() {
try {
const response = await fetch(`/api/client/notifications/unread-count?device_id=${this.deviceId}`);
if (response.ok) {
const data = await response.json();
this.unreadCount = data.count;
this.updateNotificationBadge();
}
} catch (error) {
console.error('Error al obtener contador de no leídas:', error);
}
}

updateNotificationBadge() {
const notificationBtn = document.getElementById('notificationsBtn');
if (!notificationBtn) return;

const existingBadge = notificationBtn.querySelector('.notification-badge');

if (this.unreadCount > 0) {
if (!existingBadge) {
const badge = document.createElement('span');
badge.className = 'notification-badge';
badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
notificationBtn.appendChild(badge);
} else {
existingBadge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
}
} else if (existingBadge) {
existingBadge.remove();
}
}

applyTheme() {
if (this.settings && this.settings.theme_color) {
document.querySelector('meta[name="theme-color"]').setAttribute('content', this.settings.theme_color);
}
}

renderBanners() {
const bannerContainer = document.getElementById('banner');
if (!bannerContainer) return;

bannerContainer.innerHTML = '';

if (!this.banners || this.banners.length === 0) {
const defaultBanner = document.createElement('div');
defaultBanner.className = 'banner-default';
defaultBanner.innerHTML = `
<div class="banner-placeholder">
<i class="fas fa-image"></i>
<p>No hay banners disponibles</p>
</div>
`;
bannerContainer.appendChild(defaultBanner);
return;
}

const bannersWrapper = document.createElement('div');
bannersWrapper.className = 'banners-wrapper';

this.banners.forEach((banner, index) => {
const bannerElement = document.createElement('div');
bannerElement.className = `banner-slide ${index === 0 ? 'active' : ''}`;
bannerElement.innerHTML = `
<img src="${banner.image_data}" alt="${banner.title || 'Banner'}" 
onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
<div class="banner-placeholder" style="display: ${banner.image_data ? 'none' : 'flex'}">
<i class="fas fa-image"></i>
<p>Imagen no disponible</p>
</div>
${banner.title || banner.subtitle ? `
<div class="banner-content">
${banner.title ? `<h3 class="banner-title">${banner.title}</h3>` : ''}
${banner.subtitle ? `<p class="banner-subtitle">${banner.subtitle}</p>` : ''}
</div>
` : ''}
`;
bannersWrapper.appendChild(bannerElement);
});

if (this.banners.length > 1) {
const prevBtn = document.createElement('button');
prevBtn.className = 'banner-nav banner-prev';
prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
prevBtn.addEventListener('click', () => this.prevBanner());

const nextBtn = document.createElement('button');
nextBtn.className = 'banner-nav banner-next';
nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
nextBtn.addEventListener('click', () => this.nextBanner());

const dotsContainer = document.createElement('div');
dotsContainer.className = 'banner-dots';

this.banners.forEach((_, index) => {
const dot = document.createElement('button');
dot.className = `banner-dot ${index === 0 ? 'active' : ''}`;
dot.addEventListener('click', () => this.goToBanner(index));
dotsContainer.appendChild(dot);
});

bannerContainer.appendChild(bannersWrapper);
bannerContainer.appendChild(prevBtn);
bannerContainer.appendChild(nextBtn);
bannerContainer.appendChild(dotsContainer);

this.setupBannerTouch(bannersWrapper);
} else {
bannerContainer.appendChild(bannersWrapper);
}
}

setupBannerTouch(bannersWrapper) {
let startX = 0;
let currentX = 0;
let isDragging = false;

const onTouchStart = (e) => {
startX = e.touches[0].clientX;
currentX = startX;
isDragging = true;
bannersWrapper.style.transition = 'none';
};

const onTouchMove = (e) => {
if (!isDragging) return;
currentX = e.touches[0].clientX;
const diff = currentX - startX;
bannersWrapper.style.transform = `translateX(calc(-${this.currentBannerIndex * 100}% + ${diff}px)`;
};

const onTouchEnd = (e) => {
if (!isDragging) return;
isDragging = false;

const diff = currentX - startX;
const threshold = 50;

bannersWrapper.style.transition = 'transform 0.3s ease';

if (Math.abs(diff) > threshold) {
if (diff > 0) {
this.prevBanner();
} else {
this.nextBanner();
}
} else {
this.goToBanner(this.currentBannerIndex);
}
};

bannersWrapper.addEventListener('touchstart', onTouchStart);
bannersWrapper.addEventListener('touchmove', onTouchMove);
bannersWrapper.addEventListener('touchend', onTouchEnd);
}

nextBanner() {
this.currentBannerIndex = (this.currentBannerIndex + 1) % this.banners.length;
this.updateBannerDisplay();
}

prevBanner() {
this.currentBannerIndex = (this.currentBannerIndex - 1 + this.banners.length) % this.banners.length;
this.updateBannerDisplay();
}

goToBanner(index) {
this.currentBannerIndex = index;
this.updateBannerDisplay();
}

updateBannerDisplay() {
const bannersWrapper = document.querySelector('.banners-wrapper');
const slides = document.querySelectorAll('.banner-slide');
const dots = document.querySelectorAll('.banner-dot');

if (bannersWrapper) {
bannersWrapper.style.transform = `translateX(-${this.currentBannerIndex * 100}%)`;
}

slides.forEach((slide, index) => {
slide.classList.toggle('active', index === this.currentBannerIndex);
});

dots.forEach((dot, index) => {
dot.classList.toggle('active', index === this.currentBannerIndex);
});
}

startBannerRotation() {
if (this.bannerInterval) {
clearInterval(this.bannerInterval);
}

if (this.banners && this.banners.length > 1) {
this.bannerInterval = setInterval(() => {
this.nextBanner();
}, 5000);
}
}

renderProducts() {
const container = document.getElementById('productsContainer');
if (!container) return;

container.innerHTML = '';

if (!this.products || this.products.length === 0) {
container.innerHTML = '<div class="no-products">No hay productos disponibles</div>';
return;
}

this.products.forEach(product => {
const productElement = this.createProductElement(product);
container.appendChild(productElement);
});
}

createProductElement(product) {
const productCard = document.createElement('div');
productCard.className = 'product-card';

const badges = this.generateBadges(product);
const hasVoted = this.votedProducts[product.id];
const likeClass = hasVoted === 'like' ? 'active' : '';
const dislikeClass = hasVoted === 'dislike' ? 'active' : '';

productCard.innerHTML = `
<div class="product-name">${product.name}</div>
<img class="product-image" src="${product.image_data}" alt="${product.name}" 
onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDIwMCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMTIwIiBmaWxsPSIjZTVlNWU1Ii8+Cjx0ZXh0IHg9IjEwMCIgeT0iNjAiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+RWwgZW1wcmVzYSBubyBwdWRvIGNhcmdhciBlc3RhIGltYWdlbjwvdGV4dD4KPC9zdmc+'">
<div class="product-info">
<div class="product-badges">${badges}</div>
<div class="product-content">
<div class="product-votes">
<button class="vote-button like ${likeClass}" data-product-id="${product.id}">
<i class="fas fa-thumbs-up"></i> ${product.likes}
</button>
<button class="vote-button dislike ${dislikeClass}" data-product-id="${product.id}">
<i class="fas fa-thumbs-down"></i> ${product.dislikes}
</button>
</div>
<div class="product-price">$ ${product.price}</div>
</div>
</div>
`;

productCard.querySelector('.like').addEventListener('click', (e) => {
this.handleVote(e.target.closest('.vote-button').dataset.productId, 'like');
});

productCard.querySelector('.dislike').addEventListener('click', (e) => {
this.handleVote(e.target.closest('.vote-button').dataset.productId, 'dislike');
});

return productCard;
}

generateBadges(product) {
const badges = [
{ key: 'is_new', label: 'Nuevo', class: 'new' },
{ key: 'is_offer', label: 'Oferta', class: 'offer' },
{ key: 'is_featured', label: 'Destacado', class: 'featured' },
{ key: 'is_best_seller', label: 'Más Vendido', class: 'best-seller' }
];

return badges.map(badge => {
const isActive = product[badge.key];
return `<span class="badge ${badge.class} ${isActive ? 'active' : 'inactive'}">${badge.label}</span>`;
}).join('');
}

async handleVote(productId, type) {
if (this.votedProducts[productId]) {
this.showAlert('Aviso', 'Ya has votado por este producto');
return;
}

try {
const response = await fetch('/api/client/vote', {
method: 'POST',
headers: {
'Content-Type': 'application/json'
},
body: JSON.stringify({
productId,
type,
deviceId: this.deviceId
})
});

const result = await response.json();

if (result.success) {
this.setVotedProduct(productId, type);
await this.loadProducts();
} else {
this.showAlert('Error', result.error);
}
} catch (error) {
console.error('Error voting:', error);
this.showAlert('Error', 'Error al registrar el voto');
}
}

showNotification(notification) {
const notificationElement = document.createElement('div');
notificationElement.className = `app-notification ${notification.type}`;

const typeIcons = {
'info': 'fas fa-info-circle',
'success': 'fas fa-check-circle',
'warning': 'fas fa-exclamation-triangle',
'error': 'fas fa-exclamation-circle',
'promo': 'fas fa-gift'
};

const borderColors = {
'info': '#3498db',
'success': '#2ecc71',
'warning': '#f39c12',
'error': '#e74c3c',
'promo': '#9b59b6'
};

notificationElement.innerHTML = `
<div class="notification-icon">
<i class="${typeIcons[notification.type]}"></i>
</div>
<div class="notification-content">
<div class="notification-title">${notification.title}</div>
<div class="notification-message">${notification.message}</div>
</div>
<button class="notification-close"><i class="fas fa-times"></i></button>
`;

notificationElement.style.borderLeftColor = borderColors[notification.type];

const icon = notificationElement.querySelector('.notification-icon i');
icon.style.color = borderColors[notification.type];

const closeBtn = notificationElement.querySelector('.notification-close');
closeBtn.addEventListener('click', () => {
notificationElement.style.animation = 'slideOutRight 0.3s ease-in';
setTimeout(() => {
if (notificationElement.parentNode) {
notificationElement.parentNode.removeChild(notificationElement);
}
}, 300);
});

setTimeout(() => {
if (notificationElement.parentNode) {
notificationElement.style.animation = 'slideOutRight 0.3s ease-in';
setTimeout(() => {
if (notificationElement.parentNode) {
notificationElement.parentNode.removeChild(notificationElement);
}
}, 300);
}
}, 5000);

document.body.appendChild(notificationElement);
}

async markAsRead(notificationId) {
try {
await fetch(`/api/client/notifications/${notificationId}/read`, {
method: 'POST',
headers: {
'Content-Type': 'application/json'
},
body: JSON.stringify({
device_id: this.deviceId
})
});

this.unreadCount = Math.max(0, this.unreadCount - 1);
this.updateNotificationBadge();
} catch (error) {
console.error('Error al marcar notificación como leída:', error);
}
}

startNotificationPolling() {
this.notificationCheckInterval = setInterval(async () => {
await this.getUnreadCount();
await this.loadNotifications();
}, 30000);
}

setupEventListeners() {
document.getElementById('floatingMenuBtn').addEventListener('click', () => {
if (this.isFloatingMenuOpen) {
this.hideFloatingMenu();
} else {
this.showFloatingMenu();
}
});

document.getElementById('notificationsBtn').addEventListener('click', () => {
if (this.isNotificationsOpen) {
this.hideNotificationsPanel();
} else {
this.showNotificationsPanel();
}
});

document.getElementById('optionsBtn').addEventListener('click', () => {
if (this.isOptionsOpen) {
this.hideOptionsMenu();
} else {
this.showOptionsMenu();
}
});

document.querySelector('.modal-close')?.addEventListener('click', () => {
this.hideModal();
});

document.getElementById('alertClose')?.addEventListener('click', () => {
this.hideAlert();
});
}

showFloatingMenu() {
if (this.isFloatingMenuOpen) {
this.hideFloatingMenu();
return;
}

const menuItems = [
{ icon: 'fas fa-home', label: 'Inicio', action: () => window.scrollTo(0, 0) },
{ icon: 'fas fa-sync', label: 'Recargar', action: () => location.reload() },
{ icon: 'fas fa-info-circle', label: 'Acerca de', action: () => this.showAlert('Acerca de', 'Aplicación desarrollada con tecnologías web modernas.') },
{ icon: 'fas fa-times', label: 'Cerrar', action: () => this.hideFloatingMenu() }
];

let menu = document.querySelector('.floating-menu');
if (menu) {
menu.remove();
}

menu = document.createElement('div');
menu.className = 'floating-menu';

menuItems.forEach(item => {
const menuItem = document.createElement('button');
menuItem.className = 'floating-menu-item';
menuItem.innerHTML = `<i class="${item.icon}"></i><span>${item.label}</span>`;
menuItem.addEventListener('click', () => {
item.action();
this.hideFloatingMenu();
});
menu.appendChild(menuItem);
});

document.body.appendChild(menu);

// Forzar reflow para la animación
menu.offsetHeight;
menu.classList.add('show');

this.isFloatingMenuOpen = true;

// Cerrar al hacer clic fuera
setTimeout(() => {
const closeOnClickOutside = (e) => {
if (!menu.contains(e.target) && e.target.id !== 'floatingMenuBtn') {
this.hideFloatingMenu();
document.removeEventListener('click', closeOnClickOutside);
}
};
document.addEventListener('click', closeOnClickOutside);
}, 100);
}

hideFloatingMenu() {
const menu = document.querySelector('.floating-menu');
if (menu) {
menu.classList.remove('show');
setTimeout(() => {
if (menu.parentNode) {
menu.parentNode.removeChild(menu);
}
}, 300);
}
this.isFloatingMenuOpen = false;
}

showOptionsMenu() {
if (this.isOptionsOpen) {
this.hideOptionsMenu();
return;
}

const menuItems = [
{ icon: 'fas fa-palette', label: 'Cambiar Tema', action: () => this.toggleTheme() },
{ icon: 'fas fa-bell', label: 'Notificaciones', action: () => this.toggleNotifications() },
{ icon: 'fas fa-shield-alt', label: 'Privacidad', action: () => this.showAlert('Privacidad', 'Tu información está protegida.') },
{ icon: 'fas fa-question-circle', label: 'Ayuda', action: () => this.showAlert('Ayuda', 'Contacta al soporte técnico para ayuda.') }
];

const menu = document.createElement('div');
menu.className = 'options-menu';

menuItems.forEach(item => {
const menuItem = document.createElement('button');
menuItem.className = 'options-menu-item';
menuItem.innerHTML = `<i class="${item.icon}"></i><span>${item.label}</span>`;
menuItem.addEventListener('click', () => {
item.action();
this.hideOptionsMenu();
});
menu.appendChild(menuItem);
});

const closeBtn = document.createElement('button');
closeBtn.className = 'options-menu-close';
closeBtn.innerHTML = '<i class="fas fa-times"></i>';
closeBtn.addEventListener('click', () => this.hideOptionsMenu());
menu.appendChild(closeBtn);

document.body.appendChild(menu);

// Forzar reflow para la animación
menu.offsetHeight;
menu.classList.add('active');

this.isOptionsOpen = true;

// Cerrar al hacer clic fuera
setTimeout(() => {
const closeOnClickOutside = (e) => {
if (!menu.contains(e.target) && e.target.id !== 'optionsBtn') {
this.hideOptionsMenu();
document.removeEventListener('click', closeOnClickOutside);
}
};
document.addEventListener('click', closeOnClickOutside);
}, 100);
}

hideOptionsMenu() {
const menu = document.querySelector('.options-menu');
if (menu) {
menu.classList.remove('active');
setTimeout(() => {
if (menu.parentNode) {
menu.parentNode.removeChild(menu);
}
}, 300);
}
this.isOptionsOpen = false;
}

toggleTheme() {
document.body.classList.toggle('dark-mode');
document.body.classList.toggle('light-mode');
this.hideOptionsMenu();
}

toggleNotifications() {
this.requestNotificationPermission({
title: 'Notificaciones',
message: 'Las notificaciones están ahora activas para esta aplicación.'
});
this.hideOptionsMenu();
}

showNotificationsPanel() {
if (this.isNotificationsOpen) {
this.hideNotificationsPanel();
return;
}

// Quitar el globo de notificación al abrir
this.clearNotificationBadge();

const panel = document.createElement('div');
panel.className = 'notifications-panel';

panel.innerHTML = `
<div class="notifications-header">
<h3><i class="fas fa-bell"></i> Notificaciones</h3>
<button class="close-panel"><i class="fas fa-times"></i></button>
</div>
<div class="notifications-list">
${this.notifications.length === 0 ? 
'<div class="no-notifications">No hay notificaciones</div>' : 
this.notifications.map(notification => `
<div class="notification-item ${notification.is_read ? 'read' : 'unread'} ${notification.type}">
<div class="notification-icon">
<i class="${this.getNotificationIcon(notification.type)}"></i>
</div>
<div class="notification-content">
<div class="notification-title">${notification.title}</div>
<div class="notification-message">${notification.message}</div>
<div class="notification-time">${new Date(notification.send_at).toLocaleString()}</div>
</div>
</div>
`).join('')
}
</div>
`;

const closeBtn = panel.querySelector('.close-panel');
closeBtn.addEventListener('click', () => {
this.hideNotificationsPanel();
});

const overlay = document.createElement('div');
overlay.className = 'notifications-overlay';

overlay.addEventListener('click', () => {
this.hideNotificationsPanel();
});

document.body.appendChild(overlay);
document.body.appendChild(panel);

// Forzar reflow para la animación
overlay.offsetHeight;
panel.offsetHeight;

overlay.classList.add('active');
panel.classList.add('active');

this.isNotificationsOpen = true;
}

hideNotificationsPanel() {
const panel = document.querySelector('.notifications-panel');
const overlay = document.querySelector('.notifications-overlay');

if (panel) {
panel.classList.remove('active');
setTimeout(() => {
if (panel.parentNode) panel.parentNode.removeChild(panel);
}, 300);
}

if (overlay) {
overlay.classList.remove('active');
setTimeout(() => {
if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
}, 300);
}

this.isNotificationsOpen = false;
}

getNotificationIcon(type) {
const icons = {
'info': 'fas fa-info-circle',
'success': 'fas fa-check-circle',
'warning': 'fas fa-exclamation-triangle',
'error': 'fas fa-exclamation-circle',
'promo': 'fas fa-gift'
};
return icons[type] || 'fas fa-bell';
}

clearNotificationBadge() {
// Quitar el globo de notificación visualmente
this.unreadCount = 0;
this.updateNotificationBadge();

// Marcar todas las notificaciones como leídas en el servidor
this.markAllNotificationsAsRead();
}

async markAllNotificationsAsRead() {
try {
// Marcar cada notificación no leída como leída
for (const notification of this.notifications) {
if (!notification.is_read) {
await this.markAsRead(notification.id);
}
}
} catch (error) {
console.error('Error al marcar todas las notificaciones como leídas:', error);
}
}

showAlert(title, message) {
const modal = document.getElementById('customAlert');
const messageElement = document.getElementById('alertMessage');

if (modal && messageElement) {
messageElement.textContent = message;
modal.classList.add('active');
} else {
alert(`${title}: ${message}`);
}
}

hideAlert() {
const modal = document.getElementById('customAlert');
if (modal) {
modal.classList.remove('active');
}
}

showModal(title, message, onConfirm = null, onCancel = null) {
const modal = document.getElementById('customModal');
const titleElement = document.getElementById('modalTitle');
const messageElement = document.getElementById('modalMessage');
const confirmBtn = document.getElementById('modalConfirm');
const cancelBtn = document.getElementById('modalCancel');

if (modal && titleElement && messageElement) {
titleElement.textContent = title;
messageElement.textContent = message;
modal.classList.add('active');

const cleanup = () => {
confirmBtn.onclick = null;
cancelBtn.onclick = null;
modal.classList.remove('active');
};

confirmBtn.onclick = () => {
if (onConfirm) onConfirm();
cleanup();
};

cancelBtn.onclick = () => {
if (onCancel) onCancel();
cleanup();
};
} else {
if (confirm(message)) {
if (onConfirm) onConfirm();
} else {
if (onCancel) onCancel();
}
}
}

hideModal() {
const modal = document.getElementById('customModal');
if (modal) {
modal.classList.remove('active');
}
}
}

document.addEventListener('DOMContentLoaded', () => {
new ClientApp();
});

if ('serviceWorker' in navigator) {
window.addEventListener('load', () => {
navigator.serviceWorker.register('/client/sw.js')
.then(registration => {
console.log('Service Worker registered: ', registration);
})
.catch(registrationError => {
console.log('Service Worker registration failed: ', registrationError);
});
});
}