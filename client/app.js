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
// Configurar ciclo de vida de la app
this.setupAppLifecycle();
this.init();
}

async init() {
try {
// Mostrar loading
this.showLoading(10);

// Limpiar cache y localStorage
await this.cleanStorage();
this.showLoading(30);

// Registrar dispositivo
await this.registerDevice();
this.showLoading(50);

// Cargar configuración
await this.loadSettings();
this.showLoading(70);

// Cargar datos iniciales
await Promise.all([
this.loadBanners(),
this.loadProducts(),
this.loadNotifications()
]);
this.showLoading(90);

// Conectar a tiempo real
await this.connectRealtime();
this.showLoading(100);

// Configurar interfaz
this.setupEventListeners();
this.applyTheme();
this.startNotificationPolling();

// Ocultar loading y mostrar app
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
// Limpiar localStorage específico de la app
const keysToKeep = ['deviceId'];
const allKeys = Object.keys(localStorage);

for (const key of allKeys) {
if (!keysToKeep.includes(key)) {
localStorage.removeItem(key);
}
}

// Limpiar cache del service worker
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
// Cerrar conexión existente
if (this.realtimeConnection) {
this.realtimeConnection.close();
this.realtimeConnection = null;
}

try {
this.realtimeConnection = new EventSource('/api/realtime/events', {
withCredentials: false // Importante para evitar problemas CORS
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
// Ignorar mensajes de heartbeat
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

// Estrategia de reconexión exponencial
if (this.realtimeConnection.readyState === EventSource.CLOSED) {
reconnectAttempts++;

if (reconnectAttempts > maxReconnectAttempts) {
console.error('Número máximo de reconexiones alcanzado');
return;
}

const reconnectDelay = Math.min(
baseReconnectDelay * Math.pow(2, reconnectAttempts - 1),
30000 // Máximo 30 segundos
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
// Reintentar después de 5 segundos
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
// Recargar productos manteniendo el estado actual
await this.loadProducts();
this.showAlert('Éxito', `Producto ${action === 'created' ? 'agregado' : 'actualizado'} correctamente`);
break;

case 'deleted':
// Eliminar producto localmente
this.products = this.products.filter(p => p.id !== productId);
this.renderProducts();
this.showAlert('Éxito', 'Producto eliminado correctamente');
break;
}
}

handleNewNotification(notification) {
// Agregar notificación a la lista
this.notifications.unshift({ ...notification, is_read: false });
this.unreadCount++;
this.updateNotificationBadge();

// Mostrar notificación push
this.showNotification(notification);

// Marcar como leída después de mostrarla
this.markAsRead(notification.id);
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

// Manejar cierre de la aplicación
setupAppLifecycle() {
// Antes de que la página se cierre
window.addEventListener('beforeunload', () => {
if (this.realtimeConnection) {
this.realtimeConnection.close();
}
});

// Cuando la página se hace visible/oculta
document.addEventListener('visibilitychange', () => {
if (document.hidden) {
// Página oculta - podríamos considerar cerrar SSE
console.log('Página oculta');
} else {
// Página visible - asegurar conexión
if (!this.isConnected && this.realtimeConnection?.readyState === EventSource.CLOSED) {
console.log('Reconectando SSE tras volver a la página');
this.connectRealtime();
}
}
});

// Manejar eventos online/offline
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
bannerContainer.innerHTML = '<div class="no-banner">No hay banners disponibles</div>';
return;
}

const banner = this.banners[0];
const bannerElement = document.createElement('div');
bannerElement.innerHTML = `
<img src="${banner.image_data}" alt="${banner.title || 'Banner'}" onerror="this.style.display='none'">
`;
bannerContainer.appendChild(bannerElement);
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
<img class="product-image" src="${product.image_data}" alt="${product.name}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDIwMCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMTIwIiBmaWxsPSIjZTVlNWU1Ii8+Cjx0ZXh0IHg9IjEwMCIgeT0iNjAiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+RWwgZW1wcmVzYSBubyBwdWRvIGNhcmdhciBlc3RhIGltYWdlbjwvdGV4dD4KPC9zdmc+'">
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
let badges = '';
if (product.is_new) badges += '<span class="badge new">Nuevo</span>';
if (product.is_offer) badges += '<span class="badge offer">Oferta</span>';
if (product.is_featured) badges += '<span class="badge featured">Destacado</span>';
if (product.is_best_seller) badges += '<span class="badge best-seller">Más Vendido</span>';
return badges;
}

async handleVote(productId, type) {
if (this.votedProducts[productId]) {
alert('Ya has votado por este producto');
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
alert(result.error);
}
} catch (error) {
console.error('Error voting:', error);
alert('Error al registrar el voto');
}
}

showPendingNotifications() {
const unreadNotifications = this.notifications.filter(n => !n.is_read);

unreadNotifications.forEach(notification => {
this.showNotification(notification);
this.markAsRead(notification.id);
});
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
alert('Menú interactivo');
});

document.getElementById('notificationsBtn').addEventListener('click', () => {
this.showNotificationsPanel();
});

document.getElementById('optionsBtn').addEventListener('click', () => {
alert('Opciones');
});
}

showNotificationsPanel() {
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
panel.style.animation = 'slideOutRight 0.3s ease-in';
setTimeout(() => {
if (panel.parentNode) {
panel.parentNode.removeChild(panel);
}
}, 300);
});

const overlay = document.createElement('div');
overlay.style.cssText = `
position: fixed;
top: 0;
left: 0;
width: 100%;
height: 100%;
background: rgba(0,0,0,0.5);
z-index: 1001;
`;

overlay.addEventListener('click', () => {
panel.style.animation = 'slideOutRight 0.3s ease-in';
setTimeout(() => {
if (panel.parentNode) panel.parentNode.removeChild(panel);
if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
}, 300);
});

document.body.appendChild(overlay);
document.body.appendChild(panel);
}

getNotificationIcon(type) {
const icons = {
'info': 'fas fa-info-circle',
'success': 'fas fa-check-circle',
'warning': 'fas fa-exclamation-triangle',
'error': 'fas fa-exclamation-circle',
'promo': 'fas fa-gift'
};
return icons[type];
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