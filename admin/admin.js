class AdminDashboard {
constructor() {
this.currentProduct = null;
this.currentBanner = null;
this.currentNotification = null;
this.productsLoaded = false;
this.bannersLoaded = false;
this.notificationsLoaded = false;
this.hoursLoaded = false;
this.notificationSound = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==');
this.notificationQueue = [];
this.isShowingNotification = false;
this.init();
}

async init() {
try {
this.showGlobalLoading(true);

await Promise.all([
this.loadProducts(),
this.loadBusinessHours(),
this.loadForcedState()
]);

this.setupEventListeners();
this.setupSystemNotifications();
this.requestNotificationPermission();
this.setupSSE();

} catch (error) {
console.error('Error inicializando dashboard:', error);
this.showNotification('Error', 'Error al inicializar el panel', 'error');
} finally {
this.showGlobalLoading(false);
}
}

showGlobalLoading(show) {
let loader = document.getElementById('globalLoader');

if (show) {
if (!loader) {
loader = document.createElement('div');
loader.id = 'globalLoader';
loader.className = 'global-loader';
loader.innerHTML = `
<div class="loader-content">
<div class="loader-spinner"></div>
<p>Cargando panel de administración...</p>
</div>
`;
document.body.appendChild(loader);
}
loader.style.display = 'flex';
} else if (loader) {
loader.style.display = 'none';
}
}

async fetchData(endpoint, options = {}) {
try {
const baseUrl = '/api/admin';
const url = endpoint.startsWith('/') ? `${baseUrl}${endpoint}` : `${baseUrl}/${endpoint}`;

const response = await fetch(url, {
...options,
headers: {
'Content-Type': 'application/json',
...options.headers
}
});

if (!response.ok) {
const errorText = await response.text();
let errorData;
try {
errorData = JSON.parse(errorText);
} catch {
errorData = { error: errorText || `Error ${response.status}: ${response.statusText}` };
}
throw new Error(errorData.error || `Error ${response.status}`);
}

return await response.json();
} catch (error) {
console.error('Error fetching data:', error);
this.showNotification('Error', error.message || 'Error al cargar datos', 'error');
return null;
}
}

async loadProducts() {
try {
this.setLoadingState('productsList', true);
const products = await this.fetchData('products');
if (products) this.renderProducts(products);
} finally {
this.setLoadingState('productsList', false);
}
}

async loadBanners() {
try {
this.setLoadingState('bannersList', true);
const banners = await this.fetchData('banners');
if (banners) this.renderBanners(banners);
} finally {
this.setLoadingState('bannersList', false);
}
}

async loadBusinessHours() {
try {
this.setLoadingState('businessHoursList', true);
const hours = await this.fetchData('business-hours');
if (hours) this.renderBusinessHours(hours);
await this.loadCurrentStatus();
} finally {
this.setLoadingState('businessHoursList', false);
}
}

async loadForcedState() {
try {
const forcedState = await this.fetchData('business-forced-state');
if (forcedState) this.renderForcedState(forcedState);
} catch (error) {
console.error('Error loading forced state:', error);
}
}

async loadCurrentStatus() {
try {
const status = await this.fetchData('business-status');
if (status) this.renderCurrentStatus(status);
} catch (error) {
console.error('Error loading current status:', error);
}
}

async loadNotifications() {
try {
this.setLoadingState('notificationsList', true);
const notifications = await this.fetchData('notifications');
if (notifications) this.renderNotifications(notifications);
} catch (error) {
console.error('Error loading notifications data:', error);
} finally {
this.setLoadingState('notificationsList', false);
}
}

async loadNotificationStats() {
try {
const stats = await this.fetchData('notifications/stats');
if (stats) {
document.getElementById('totalNotifications').textContent = stats.total;
document.getElementById('sentNotifications').textContent = stats.sent;
document.getElementById('totalDevices').textContent = stats.devices;
}
} catch (error) {
console.error('Error loading notification stats:', error);
}
}

setLoadingState(elementId, isLoading) {
const element = document.getElementById(elementId);
if (element) {
if (isLoading) {
element.classList.add('loading');
if (!element.querySelector('.loading-spinner')) {
const spinner = document.createElement('div');
spinner.className = 'loading-spinner';
spinner.style.margin = '2rem auto';
element.appendChild(spinner);
}
} else {
element.classList.remove('loading');
const spinner = element.querySelector('.loading-spinner');
if (spinner) spinner.remove();
}
}
}

renderProducts(products) {
const container = document.getElementById('productsList');
if (!container) return;

container.innerHTML = '';

if (products.length === 0) {
container.innerHTML = '<p class="no-data">No hay productos creados</p>';
return;
}

products.forEach(product => {
const productElement = this.createProductElement(product);
container.appendChild(productElement);
});
}

renderBanners(banners) {
const container = document.getElementById('bannersList');
if (!container) return;

container.innerHTML = '';

if (banners.length === 0) {
container.innerHTML = '<p class="no-data">No hay banners creados</p>';
return;
}

banners.forEach(banner => {
const bannerElement = this.createBannerElement(banner);
container.appendChild(bannerElement);
});
}

renderBusinessHours(hours) {
const container = document.getElementById('businessHoursList');
if (!container) return;

container.innerHTML = '';

hours.forEach(hour => {
const hourElement = this.createBusinessHourElement(hour);
container.appendChild(hourElement);
});
}

renderForcedState(forcedState) {
document.getElementById('enableForcedState').checked = forcedState.is_forced;

// Actualizar botones de estado forzado
const openBtn = document.querySelector('[data-value="open"]');
const closedBtn = document.querySelector('[data-value="closed"]');

if (forcedState.forced_state) {
openBtn.classList.add('active');
closedBtn.classList.remove('active');
} else {
openBtn.classList.remove('active');
closedBtn.classList.add('active');
}

if (forcedState.forced_until) {
const localDateTime = new Date(forcedState.forced_until).toISOString().slice(0, 16);
document.getElementById('forcedUntil').value = localDateTime;
}
}

renderCurrentStatus(status) {
const container = document.getElementById('currentStatus');
if (!container) return;

let statusClass = 'status-closed';
if (status.is_open) {
statusClass = status.is_forced ? 'status-forced' : 'status-open';
}

container.innerHTML = `
<div class="${statusClass}">
<div class="status-item">
<span class="status-label">Estado:</span>
<span class="status-value">${status.is_open ? '🟢 ABIERTO' : '🔴 CERRADO'}</span>
${status.is_forced ? ' <small>(Forzado)</small>' : ''}
</div>
${status.closing_time ? `
<div class="status-item">
<span class="status-label">Cierra a las:</span>
<span class="status-value">${status.closing_time}</span>
</div>
` : ''}
${status.next_open_time ? `
<div class="status-item">
<span class="status-label">Abre a las:</span>
<span class="status-value">${status.next_open_time}</span>
</div>
` : ''}
${status.next_open_day ? `
<div class="status-item">
<span class="status-label">Próxima apertura:</span>
<span class="status-value">${status.next_open_day.day_name} a las ${status.next_open_day.open_time}</span>
</div>
` : ''}
<div class="status-message">${status.message}</div>
</div>
`;
}

renderNotifications(notifications) {
const container = document.getElementById('notificationsList');
if (!container) return;

container.innerHTML = '';

if (notifications.length === 0) {
container.innerHTML = '<p class="no-data">No hay notificaciones creadas</p>';
return;
}

notifications.forEach(notification => {
const notificationElement = this.createNotificationElement(notification);
container.appendChild(notificationElement);
});
}

createProductElement(product) {
const div = document.createElement('div');
div.className = `product-item ${!product.is_active ? 'product-inactive' : ''}`;

const insignias = [];
if (product.is_new) insignias.push('Nuevo');
if (product.is_offer) insignias.push('Oferta');
if (product.is_featured) insignias.push('Destacado');
if (product.is_best_seller) insignias.push('Más Vendido');

div.innerHTML = `
<div class="product-info">
<h4>${this.escapeHtml(product.name)}</h4>
<p>$${product.price} | <i class="fas fa-thumbs-up"></i> ${product.likes} | <i class="fas fa-thumbs-down"></i> ${product.dislikes}</p>
<p><small>${insignias.join(', ') || 'Sin etiquetas'}</small></p>
<p><small><i class="fas fa-eye"></i> Estado: ${product.is_active ? 'Activo' : 'Inactivo'}</small></p>
</div>
<div class="product-actions">
<button class="btn-edit" data-id="${product.id}"><i class="fas fa-edit"></i> Editar</button>
<button class="btn-delete" data-id="${product.id}"><i class="fas fa-trash"></i> Eliminar</button>
</div>
`;

div.querySelector('.btn-edit').addEventListener('click', (e) => {
this.editProduct(e.target.closest('.btn-edit').dataset.id);
});

div.querySelector('.btn-delete').addEventListener('click', (e) => {
this.deleteProduct(e.target.closest('.btn-delete').dataset.id);
});

return div;
}

createBannerElement(banner) {
const div = document.createElement('div');
div.className = `banner-item ${!banner.is_active ? 'banner-inactive' : ''}`;

div.innerHTML = `
<div class="banner-info">
<h4>${this.escapeHtml(banner.title || 'Sin título')}</h4>
<p>${this.escapeHtml(banner.subtitle || '')}</p>
<p><small><i class="fas fa-eye"></i> Estado: ${banner.is_active ? 'Activo' : 'Inactivo'}</small></p>
</div>
<div class="banner-actions">
<button class="btn-edit" data-id="${banner.id}"><i class="fas fa-edit"></i> Editar</button>
<button class="btn-delete" data-id="${banner.id}"><i class="fas fa-trash"></i> Eliminar</button>
</div>
`;

div.querySelector('.btn-edit').addEventListener('click', (e) => {
this.editBanner(e.target.closest('.btn-edit').dataset.id);
});

div.querySelector('.btn-delete').addEventListener('click', (e) => {
this.deleteBanner(e.target.closest('.btn-delete').dataset.id);
});

return div;
}

formatTimeTo12h(time24) {
if (!time24) return '';
const [hours, minutes] = time24.split(':');
const hour = parseInt(hours, 10);
const ampm = hour >= 12 ? 'PM' : 'AM';
const hour12 = hour % 12 || 12;
return `${hour12}:${minutes} ${ampm}`;
}

formatTimeTo24h(time12) {
if (!time12) return '';
const [time, ampm] = time12.split(' ');
let [hours, minutes] = time.split(':');
let hour = parseInt(hours, 10);
if (ampm === 'PM' && hour < 12) hour += 12;
if (ampm === 'AM' && hour === 12) hour = 0;
return `${hour.toString().padStart(2, '0')}:${minutes}`;
}

createBusinessHourElement(hour) {
const div = document.createElement('div');
div.className = 'business-hour-item';

const openTime12 = hour.open_time ? this.formatTimeTo12h(hour.open_time) : '';
const closeTime12 = hour.close_time ? this.formatTimeTo12h(hour.close_time) : '';

div.innerHTML = `
<div class="business-hour-day">
<strong>${hour.day_name}</strong>
</div>
<div class="business-hour-times">
<div class="time-input-group">
<label>Apertura:</label>
<input type="text" class="open-time time-12h-input" value="${openTime12}" placeholder="9:00 AM" ${hour.is_closed ? 'disabled' : ''}>
</div>
<div class="time-input-group">
<label>Cierre:</label>
<input type="text" class="close-time time-12h-input" value="${closeTime12}" placeholder="6:00 PM" ${hour.is_closed ? 'disabled' : ''}>
</div>
</div>
<div class="business-hour-checkbox">
<label>
<input type="checkbox" class="is-closed" ${hour.is_closed ? 'checked' : ''}>
<span class="checkbox-label">Cerrado este día</span>
</label>
</div>
`;

const openTimeInput = div.querySelector('.open-time');
const closeTimeInput = div.querySelector('.close-time');
const isClosedCheckbox = div.querySelector('.is-closed');

isClosedCheckbox.addEventListener('change', () => {
openTimeInput.disabled = isClosedCheckbox.checked;
closeTimeInput.disabled = isClosedCheckbox.checked;
});

return div;
}

createNotificationElement(notification) {
const div = document.createElement('div');
div.className = 'notification-item';

const typeLabels = {
'info': 'Información',
'success': 'Éxito',
'warning': 'Advertencia',
'error': 'Error',
'promo': 'Promoción'
};

const sendDate = new Date(notification.send_at).toLocaleString('es-CU');
const createdDate = new Date(notification.created_at).toLocaleString('es-CU');

div.innerHTML = `
<div class="notification-header">
<h4 class="notification-title">${this.escapeHtml(notification.title)}</h4>
<span class="notification-type ${notification.type}">${typeLabels[notification.type]}</span>
</div>
<div class="notification-message">${this.escapeHtml(notification.message)}</div>
<div class="notification-meta">
<span><i class="fas fa-clock"></i> Creada: ${createdDate}</span>
<span><i class="fas fa-paper-plane"></i> Enviada: ${sendDate}</span>
</div>
<div class="notification-meta">
<span>Estado: ${notification.is_sent ? 'Enviada' : 'Pendiente'}</span>
</div>
<div class="notification-actions">
<button class="btn-edit" data-id="${notification.id}"><i class="fas fa-edit"></i> Editar</button>
${!notification.is_sent ? `<button class="btn-success send-now" data-id="${notification.id}"><i class="fas fa-paper-plane"></i> Enviar</button>` : ''}
<button class="btn-delete" data-id="${notification.id}"><i class="fas fa-trash"></i> Eliminar</button>
</div>
`;

div.querySelector('.btn-edit').addEventListener('click', (e) => {
this.editNotification(e.target.closest('.btn-edit').dataset.id);
});

const sendBtn = div.querySelector('.send-now');
if (sendBtn) {
sendBtn.addEventListener('click', (e) => {
this.sendNotification(e.target.closest('.send-now').dataset.id);
});
}

div.querySelector('.btn-delete').addEventListener('click', (e) => {
this.deleteNotification(e.target.closest('.btn-delete').dataset.id);
});

return div;
}

async saveBusinessHours() {
const hoursItems = document.querySelectorAll('.business-hour-item');
const hours = [];

hoursItems.forEach(item => {
const dayName = item.querySelector('.business-hour-day strong').textContent;
const openTime = item.querySelector('.open-time').value;
const closeTime = item.querySelector('.close-time').value;
const isClosed = item.querySelector('.is-closed').checked;

const dayMap = {
'Domingo': 0, 'Lunes': 1, 'Martes': 2, 'Miércoles': 3,
'Jueves': 4, 'Viernes': 5, 'Sábado': 6
};

hours.push({
day_of_week: dayMap[dayName],
open_time: openTime ? this.formatTimeTo24h(openTime) : null,
close_time: closeTime ? this.formatTimeTo24h(closeTime) : null,
is_closed: isClosed
});
});

const saveButton = document.getElementById('saveBusinessHours');
const originalText = saveButton.innerHTML;

saveButton.innerHTML = '<div class="loading-spinner"></div> Guardando...';
saveButton.classList.add('btn-loading');
saveButton.disabled = true;

try {
const result = await this.fetchData('business-hours', {
method: 'PUT',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ hours })
});

if (result && result.success) {
this.showNotification('Éxito', 'Horarios guardados correctamente', 'success');
await this.loadCurrentStatus();
}
} catch (error) {
this.showNotification('Error', error.message || 'Error al guardar horarios', 'error');
} finally {
saveButton.innerHTML = originalText;
saveButton.classList.remove('btn-loading');
saveButton.disabled = false;
}
}

async saveForcedState() {
const isForced = document.getElementById('enableForcedState').checked;
const forcedState = document.querySelector('.state-action-btn.active')?.dataset.value === 'open';
const forcedUntil = document.getElementById('forcedUntil').value;

if (isForced && !forcedUntil) {
this.showNotification('Error', 'Debes especificar hasta cuándo aplicar el estado forzado', 'error');
return;
}

const saveButton = document.getElementById('saveForcedState');
const originalText = saveButton.innerHTML;

saveButton.innerHTML = '<div class="loading-spinner"></div> Guardando...';
saveButton.classList.add('btn-loading');
saveButton.disabled = true;

try {
const result = await this.fetchData('business-forced-state', {
method: 'PUT',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
is_forced: isForced,
forced_state: forcedState,
forced_until: forcedUntil
})
});

if (result && result.success) {
this.showNotification('Éxito', 'Estado forzado guardado correctamente', 'success');
await this.loadCurrentStatus();
}
} catch (error) {
this.showNotification('Error', error.message || 'Error al guardar estado forzado', 'error');
} finally {
saveButton.innerHTML = originalText;
saveButton.classList.remove('btn-loading');
saveButton.disabled = false;
}
}

setupEventListeners() {
// Navegación entre pestañas
document.querySelectorAll('.nav-btn').forEach(btn => {
btn.addEventListener('click', (e) => {
document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
e.target.classList.add('active');
const tabId = `${e.target.dataset.tab}-tab`;
document.getElementById(tabId).classList.add('active');
this.loadTabData(e.target.dataset.tab);
});
});

// Productos
document.getElementById('addProductBtn').addEventListener('click', () => {
this.openProductModal();
});

document.getElementById('productForm').addEventListener('submit', (e) => {
e.preventDefault();
this.saveProduct();
});

// Banners
document.getElementById('addBannerBtn').addEventListener('click', () => {
this.openBannerModal();
});

document.getElementById('bannerForm').addEventListener('submit', (e) => {
e.preventDefault();
this.saveBanner();
});

// Notificaciones
document.getElementById('addNotificationBtn').addEventListener('click', () => {
this.openNotificationModal();
});

document.getElementById('notificationForm').addEventListener('submit', (e) => {
e.preventDefault();
this.saveNotification();
});

document.getElementById('sendNotificationBtn').addEventListener('click', () => {
this.sendCurrentNotification();
});

// Opciones de envío de notificaciones
document.querySelectorAll('.send-option-btn').forEach(btn => {
btn.addEventListener('click', (e) => {
document.querySelectorAll('.send-option-btn').forEach(b => b.classList.remove('active'));
e.target.classList.add('active');

const sendType = e.target.dataset.type;
const scheduleFields = document.getElementById('scheduleFields');

if (sendType === 'schedule') {
scheduleFields.style.display = 'block';
} else {
scheduleFields.style.display = 'none';
}
});
});

// Botones de estado forzado
document.querySelectorAll('.state-action-btn').forEach(btn => {
btn.addEventListener('click', (e) => {
document.querySelectorAll('.state-action-btn').forEach(b => b.classList.remove('active'));
e.target.classList.add('active');
});
});

// Horarios
document.getElementById('saveBusinessHours').addEventListener('click', () => {
this.saveBusinessHours();
});

document.getElementById('saveForcedState').addEventListener('click', () => {
this.saveForcedState();
});

// insignias
document.getElementById('updateinsigniasBtn').addEventListener('click', (e) => {
this.updateinsignias();
});

document.getElementById('showinsigniasStatsBtn').addEventListener('click', () => {
this.showinsigniasStats();
});

// Modales
document.querySelector('#statsModal .close').addEventListener('click', () => {
document.getElementById('statsModal').style.display = 'none';
});

document.querySelectorAll('.close').forEach(closeBtn => {
closeBtn.addEventListener('click', () => {
document.querySelectorAll('.modal').forEach(modal => {
modal.style.display = 'none';
});
});
});

window.addEventListener('click', (e) => {
document.querySelectorAll('.modal').forEach(modal => {
if (e.target === modal) {
modal.style.display = 'none';
}
});
});

// Upload de imágenes
document.getElementById('productImageUpload').addEventListener('change', (e) => {
this.previewImageAsBase64(e.target, 'productImagePreview', 'productImageData');
});

document.getElementById('bannerImageUpload').addEventListener('change', (e) => {
this.previewImageAsBase64(e.target, 'bannerImagePreview', 'bannerImageData');
});

this.setupSSE();
}

async loadTabData(tab) {
try {
switch (tab) {
case 'products':
if (!this.productsLoaded) {
await this.loadProducts();
this.productsLoaded = true;
}
break;
case 'banners':
if (!this.bannersLoaded) {
await this.loadBanners();
this.bannersLoaded = true;
}
break;
case 'notifications':
if (!this.notificationsLoaded) {
await this.loadNotifications();
await this.loadNotificationStats();
this.notificationsLoaded = true;
}
break;
case 'hours':
if (!this.hoursLoaded) {
await this.loadBusinessHours();
await this.loadForcedState();
this.hoursLoaded = true;
}
break;
}
} catch (error) {
console.error(`Error loading ${tab} data:`, error);
this.showNotification('Error', `Error al cargar ${tab}`, 'error');
}
}

setupSystemNotifications() {
const notificationContainer = document.createElement('div');
notificationContainer.id = 'systemNotifications';
notificationContainer.className = 'system-notifications';
document.body.appendChild(notificationContainer);
}

showNotification(title, message, type = 'info', duration = 5000) {
const notification = {
title,
message,
type,
duration,
id: Date.now() + Math.random()
};

this.notificationQueue.push(notification);
this.processNotificationQueue();
}

processNotificationQueue() {
if (this.isShowingNotification || this.notificationQueue.length === 0) {
return;
}

this.isShowingNotification = true;
const notification = this.notificationQueue.shift();
this.displayNotification(notification);
}

displayNotification(notification) {
const notificationContainer = document.getElementById('systemNotifications');
const notificationElement = document.createElement('div');
notificationElement.className = `system-notification ${notification.type}`;
notificationElement.dataset.id = notification.id;

notificationElement.innerHTML = `
<div class="notification-icon">
<i class="fas fa-${this.getNotificationIcon(notification.type)}"></i>
</div>
<div class="notification-content">
<strong>${notification.title}</strong>
<div>${notification.message}</div>
<div class="progress-bar">
<div class="progress-bar-fill" style="width: 100%; transition: width ${notification.duration}ms linear;"></div>
</div>
</div>
<button class="notification-close">
<i class="fas fa-times"></i>
</button>
`;

notificationContainer.appendChild(notificationElement);

setTimeout(() => {
notificationElement.classList.add('show');
}, 100);

setTimeout(() => {
const progressFill = notificationElement.querySelector('.progress-bar-fill');
if (progressFill) {
progressFill.style.width = '0%';
}
}, 100);

notificationElement.querySelector('.notification-close').addEventListener('click', () => {
this.removeNotification(notificationElement);
});

if (notification.duration > 0) {
setTimeout(() => {
this.removeNotification(notificationElement);
}, notification.duration);
}

if (notification.type === 'success' || notification.type === 'error') {
this.playNotificationSound();
}
}

removeNotification(notificationElement) {
if (!notificationElement.parentNode) return;

notificationElement.classList.remove('show');
setTimeout(() => {
if (notificationElement.parentNode) {
notificationElement.parentNode.removeChild(notificationElement);
}
this.isShowingNotification = false;
this.processNotificationQueue();
}, 300);
}

getNotificationIcon(type) {
const icons = {
'success': 'check-circle',
'error': 'exclamation-circle',
'warning': 'exclamation-triangle',
'info': 'info-circle'
};
return icons[type] || 'info-circle';
}

playNotificationSound() {
if (this.notificationSound) {
this.notificationSound.currentTime = 0;
this.notificationSound.play().catch(e => {
console.log('No se pudo reproducir el sonido de notificación');
});
}
}

async showConfirmation(title, message) {
return new Promise((resolve) => {
const modal = document.createElement('div');
modal.className = 'modal confirmation-modal';
modal.innerHTML = `
<div class="modal-content">
<h3>${title}</h3>
<div class="modal-message">${message}</div>
<div class="modal-actions">
<button class="btn-secondary" id="confirmCancel">Cancelar</button>
<button class="btn-primary" id="confirmOk">Aceptar</button>
</div>
</div>
`;

document.body.appendChild(modal);
modal.style.display = 'block';

const cleanup = () => {
modal.style.display = 'none';
setTimeout(() => {
if (modal.parentNode) {
modal.parentNode.removeChild(modal);
}
}, 300);
};

document.getElementById('confirmOk').addEventListener('click', () => {
cleanup();
resolve(true);
});

document.getElementById('confirmCancel').addEventListener('click', () => {
cleanup();
resolve(false);
});

modal.addEventListener('click', (e) => {
if (e.target === modal) {
cleanup();
resolve(false);
}
});
});
}

setupSSE() {
try {
this.eventSource = new EventSource('/api/realtime/events');

this.eventSource.onopen = () => {
console.log('Conectado al servidor SSE');
this.showNotification('Conexión establecida', 'Conectado al servidor en tiempo real', 'success', 3000);
};

this.eventSource.onmessage = (event) => {
try {
const data = JSON.parse(event.data);
this.handleSSEMessage(data);
} catch (error) {
console.error('Error procesando evento SSE:', error);
}
};

this.eventSource.onerror = (event) => {
console.error('Error en conexión SSE - intentando reconectar');
if (this.eventSource.readyState === EventSource.CLOSED) {
setTimeout(() => {
this.setupSSE();
}, 5000);
}
};

} catch (error) {
console.error('Error al configurar SSE:', error);
setTimeout(() => {
this.setupSSE();
}, 5000);
}
}

handleSSEMessage(data) {
switch (data.event) {
case 'products_updated':
this.handleProductsUpdate(data.data);
break;
case 'new_notification':
this.handleNewNotification(data.data);
break;
case 'banners_updated':
this.handleBannersUpdate(data.data);
break;
case 'business_status_updated':
this.handleBusinessStatusUpdate(data.data);
break;
case 'connected':
console.log('Cliente conectado SSE:', data.data.clientId);
break;
default:
console.log('Mensaje SSE no manejado:', data);
}
}

handleProductsUpdate(payload) {
this.showNotification('Productos actualizados', 'La lista de productos ha sido actualizada', 'info', 5000);
this.loadProducts();
}

handleBannersUpdate(payload) {
this.showNotification('Banners actualizados', 'La lista de banners ha sido actualizada', 'info', 5000);
this.loadBanners();
}

handleBusinessStatusUpdate(payload) {
this.showNotification('Estado actualizado', 'El estado del negocio ha sido actualizado', 'info', 5000);
this.loadCurrentStatus();
}

handleNewNotification(payload) {
this.showPushNotification(payload.notification);
this.loadNotificationStats();
this.loadNotifications();
}

showPushNotification(notification) {
if (!("Notification" in window)) {
console.log("Este navegador no soporta notificaciones push");
return;
}

if (Notification.permission === "granted") {
this.createBrowserNotification(notification);
} else if (Notification.permission !== "denied") {
Notification.requestPermission().then(permission => {
if (permission === "granted") {
this.createBrowserNotification(notification);
}
});
}
}

createBrowserNotification(notification) {
const notif = new Notification(notification.title, {
body: notification.message,
icon: '/favicon.ico',
badge: '/favicon.ico',
tag: `notification-${notification.id}`,
requireInteraction: true
});

notif.onclick = () => {
window.focus();
notif.close();
};

this.playNotificationSound();

setTimeout(() => notif.close(), 10000);
}

async requestNotificationPermission() {
if (!("Notification" in window)) {
console.log("Este navegador no soporta notificaciones push");
return;
}

if (Notification.permission === "default") {
try {
const permission = await Notification.requestPermission();
if (permission === "granted") {
this.showNotification('Notificaciones activadas', 'Ahora recibirás notificaciones push', 'success', 5000);
}
} catch (error) {
console.error('Error solicitando permiso de notificaciones:', error);
}
}
}

escapeHtml(unsafe) {
if (typeof unsafe !== 'string') return unsafe;
return unsafe
.replace(/&/g, "&amp;")
.replace(/</g, "&lt;")
.replace(/>/g, "&gt;")
.replace(/"/g, "&quot;")
.replace(/'/g, "&#039;");
}

previewImageAsBase64(input, previewId, dataFieldId) {
const file = input.files[0];
const preview = document.getElementById(previewId);

if (file) {
if (!file.type.startsWith('image/')) {
this.showNotification('Error', 'Por favor selecciona un archivo de imagen válido', 'error');
input.value = '';
return;
}

if (file.size > 5 * 1024 * 1024) {
this.showNotification('Error', 'La imagen no puede ser mayor a 5MB', 'error');
input.value = '';
return;
}

const reader = new FileReader();
reader.onload = (e) => {
preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;

let dataField = document.getElementById(dataFieldId);
if (!dataField) {
dataField = document.createElement('input');
dataField.type = 'hidden';
dataField.id = dataFieldId;
input.parentNode.appendChild(dataField);
}
dataField.value = e.target.result;

input.removeAttribute('required');
};
reader.readAsDataURL(file);
} else {
preview.innerHTML = '';
const dataField = document.getElementById(dataFieldId);
if (dataField) dataField.value = '';
input.setAttribute('required', 'true');
}
}

openProductModal(product = null) {
this.currentProduct = product;
const modal = document.getElementById('productModal');
const title = document.getElementById('productModalTitle');

if (product) {
title.innerHTML = '<i class="fas fa-edit"></i> Editar Producto';
document.getElementById('productId').value = product.id;
document.getElementById('productName').value = product.name;
document.getElementById('productDescription').value = product.description || '';
document.getElementById('productPrice').value = product.price;
document.getElementById('productActive').checked = Boolean(product.is_active);
document.getElementById('productNew').checked = Boolean(product.is_new);
document.getElementById('productOffer').checked = Boolean(product.is_offer);
document.getElementById('productFeatured').checked = Boolean(product.is_featured);
document.getElementById('productBestSeller').checked = Boolean(product.is_best_seller);

document.getElementById('productImagePreview').innerHTML = product.image_data ?
`<img src="${product.image_data}" alt="Preview">` : '';

let dataField = document.getElementById('productImageData');
if (!dataField) {
dataField = document.createElement('input');
dataField.type = 'hidden';
dataField.id = 'productImageData';
document.getElementById('productImageUpload').parentNode.appendChild(dataField);
}
dataField.value = product.image_data || '';

document.getElementById('productImageUpload').removeAttribute('required');
} else {
title.innerHTML = '<i class="fas fa-plus"></i> Agregar Producto';
document.getElementById('productForm').reset();
document.getElementById('productImagePreview').innerHTML = '';
document.getElementById('productImageUpload').setAttribute('required', 'true');

const dataField = document.getElementById('productImageData');
if (dataField) dataField.value = '';
}

modal.style.display = 'block';
}

openBannerModal(banner = null) {
this.currentBanner = banner;
const modal = document.getElementById('bannerModal');
const title = document.getElementById('bannerModalTitle');

if (banner) {
title.innerHTML = '<i class="fas fa-edit"></i> Editar Banner';
document.getElementById('bannerId').value = banner.id;
document.getElementById('bannerTitle').value = banner.title || '';
document.getElementById('bannerSubtitle').value = banner.subtitle || '';
document.getElementById('bannerActive').checked = Boolean(banner.is_active);

document.getElementById('bannerImagePreview').innerHTML = banner.image_data ?
`<img src="${banner.image_data}" alt="Preview">` : '';

let dataField = document.getElementById('bannerImageData');
if (!dataField) {
dataField = document.createElement('input');
dataField.type = 'hidden';
dataField.id = 'bannerImageData';
document.getElementById('bannerImageUpload').parentNode.appendChild(dataField);
}
dataField.value = banner.image_data || '';

document.getElementById('bannerImageUpload').removeAttribute('required');
} else {
title.innerHTML = '<i class="fas fa-plus"></i> Agregar Banner';
document.getElementById('bannerForm').reset();
document.getElementById('bannerImagePreview').innerHTML = '';
document.getElementById('bannerImageUpload').setAttribute('required', 'true');

const dataField = document.getElementById('bannerImageData');
if (dataField) dataField.value = '';
}

modal.style.display = 'block';
}

openNotificationModal(notification = null) {
this.currentNotification = notification;
const modal = document.getElementById('notificationModal');
const title = document.getElementById('notificationModalTitle');

// Configurar opciones de envío por defecto
document.querySelectorAll('.send-option-btn').forEach(btn => btn.classList.remove('active'));
document.querySelector('.send-option-btn[data-type="immediately"]').classList.add('active');
document.getElementById('scheduleFields').style.display = 'none';

// Establecer fecha y hora mínima como ahora
const now = new Date();
const today = now.toISOString().split('T')[0];
const currentTime12h = this.formatTimeTo12h(now.toTimeString().slice(0,5));

document.getElementById('notificationSendDate').value = today;
document.getElementById('notificationSendTime').value = currentTime12h;

if (notification) {
title.innerHTML = '<i class="fas fa-edit"></i> Editar Notificación';
document.getElementById('notificationId').value = notification.id;
document.getElementById('notificationTitle').value = notification.title;
document.getElementById('notificationMessage').value = notification.message;
document.getElementById('notificationType').value = notification.type;

const sendDate = new Date(notification.send_at);
const formattedDate = sendDate.toISOString().split('T')[0];
const formattedTime = this.formatTimeTo12h(sendDate.toTimeString().slice(0,5));

document.getElementById('notificationSendDate').value = formattedDate;
document.getElementById('notificationSendTime').value = formattedTime;

// Configurar tipo de envío basado en la fecha programada
const now = new Date();
if (sendDate <= now) {
document.querySelector('.send-option-btn[data-type="immediately"]').classList.add('active');
document.querySelector('.send-option-btn[data-type="schedule"]').classList.remove('active');
document.getElementById('scheduleFields').style.display = 'none';
} else {
document.querySelector('.send-option-btn[data-type="schedule"]').classList.add('active');
document.querySelector('.send-option-btn[data-type="immediately"]').classList.remove('active');
document.getElementById('scheduleFields').style.display = 'block';
}

// Mostrar u ocultar botón "Enviar Ahora" según estado
document.getElementById('sendNotificationBtn').style.display = notification.is_sent ? 'none' : 'block';
} else {
title.innerHTML = '<i class="fas fa-plus"></i> Nueva Notificación';
document.getElementById('notificationForm').reset();
document.getElementById('notificationType').value = 'info';
document.getElementById('sendNotificationBtn').style.display = 'block';
document.getElementById('notificationId').value = '';
}

modal.style.display = 'block';
}

async saveProduct() {
const imageDataField = document.getElementById('productImageData');
const imageData = imageDataField ? imageDataField.value : '';

if (!imageData && !this.currentProduct) {
this.showNotification('Error', 'La imagen del producto es requerida', 'error');
return;
}

const formData = {
name: document.getElementById('productName').value,
description: document.getElementById('productDescription').value,
price: document.getElementById('productPrice').value,
image_data: imageData,
is_active: document.getElementById('productActive').checked,
is_new: document.getElementById('productNew').checked,
is_offer: document.getElementById('productOffer').checked,
is_featured: document.getElementById('productFeatured').checked,
is_best_seller: document.getElementById('productBestSeller').checked
};

if (!formData.name || !formData.price) {
this.showNotification('Error', 'Nombre y precio son campos requeridos', 'error');
return;
}

const productId = document.getElementById('productId').value;
let result;

let submitButton = document.querySelector('#productForm button[type="submit"]');
if (!submitButton) {
submitButton = document.querySelector('#productForm .btn-primary');
}
if (!submitButton) {
submitButton = document.querySelector('.modal-footer .btn-primary');
}

let originalText = '';
if (submitButton) {
originalText = submitButton.innerHTML;
submitButton.innerHTML = '<div class="loading-spinner"></div> Guardando...';
submitButton.classList.add('btn-loading');
submitButton.disabled = true;
}

try {
if (productId) {
result = await this.fetchData(`products/${productId}`, {
method: 'PUT',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(formData)
});
} else {
result = await this.fetchData('products', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(formData)
});
}

if (result) {
document.getElementById('productModal').style.display = 'none';
this.showNotification('Éxito', `Producto ${productId ? 'actualizado' : 'creado'} correctamente`, 'success');
await this.loadProducts();
}
} catch (error) {
this.showNotification('Error', error.message || 'Error al guardar el producto', 'error');
} finally {
if (submitButton) {
submitButton.innerHTML = originalText;
submitButton.classList.remove('btn-loading');
submitButton.disabled = false;
}
}
}

async saveBanner() {
const imageDataField = document.getElementById('bannerImageData');
const imageData = imageDataField ? imageDataField.value : '';

if (!imageData && !this.currentBanner) {
this.showNotification('Error', 'La imagen del banner es requerida', 'error');
return;
}

const formData = {
title: document.getElementById('bannerTitle').value,
subtitle: document.getElementById('bannerSubtitle').value,
image_data: imageData,
is_active: document.getElementById('bannerActive').checked
};

const bannerId = document.getElementById('bannerId').value;
let result;

const submitButton = document.querySelector('#bannerForm button[type="submit"]');
const originalText = submitButton.innerHTML;
submitButton.innerHTML = '<div class="loading-spinner"></div> Guardando...';
submitButton.classList.add('btn-loading');
submitButton.disabled = true;

try {
if (bannerId) {
result = await this.fetchData(`banners/${bannerId}`, {
method: 'PUT',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(formData)
});
} else {
result = await this.fetchData('banners', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(formData)
});
}

if (result) {
document.getElementById('bannerModal').style.display = 'none';
this.showNotification('Éxito', `Banner ${bannerId ? 'actualizado' : 'creado'} correctamente`, 'success');
await this.loadBanners();
}
} catch (error) {
this.showNotification('Error', error.message || 'Error al guardar el banner', 'error');
} finally {
submitButton.innerHTML = originalText;
submitButton.classList.remove('btn-loading');
submitButton.disabled = false;
}
}

async saveNotification() {
const sendType = document.querySelector('.send-option-btn.active').dataset.type;

let sendAt;
if (sendType === 'immediately') {
sendAt = new Date().toISOString();
} else {
const sendDate = document.getElementById('notificationSendDate').value;
const sendTime = document.getElementById('notificationSendTime').value;

if (!sendDate || !sendTime) {
this.showNotification('Error', 'Debes especificar fecha y hora para el envío programado', 'error');
return false;
}

// Convertir hora 12H a 24H
const time24h = this.formatTimeTo24h(sendTime);
const dateTimeString = `${sendDate}T${time24h}:00`;
sendAt = new Date(dateTimeString).toISOString();
}

const formData = {
title: document.getElementById('notificationTitle').value,
message: document.getElementById('notificationMessage').value,
type: document.getElementById('notificationType').value,
is_active: true,
send_at: sendAt
};

if (!formData.title || !formData.message) {
this.showNotification('Error', 'Título y mensaje son campos requeridos', 'error');
return false;
}

const notificationId = document.getElementById('notificationId').value;
let result;

const submitButton = document.querySelector('#notificationForm button[type="submit"]');
let originalText = '';

if (submitButton) {
originalText = submitButton.innerHTML;
submitButton.innerHTML = '<div class="loading-spinner"></div> Guardando...';
submitButton.classList.add('btn-loading');
submitButton.disabled = true;
}

try {
if (notificationId) {
result = await this.fetchData(`notifications/${notificationId}`, {
method: 'PUT',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(formData)
});
} else {
result = await this.fetchData('notifications', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(formData)
});
}

if (result) {
if (!notificationId && result.id) {
document.getElementById('notificationId').value = result.id;
}
this.showNotification('Éxito', `Notificación ${notificationId ? 'actualizada' : 'creada'} correctamente`, 'success');
await this.loadNotifications();
await this.loadNotificationStats();
return true;
}
return false;
} catch (error) {
this.showNotification('Error', error.message || 'Error al guardar la notificación', 'error');
return false;
} finally {
if (submitButton) {
submitButton.innerHTML = originalText;
submitButton.classList.remove('btn-loading');
submitButton.disabled = false;
}
}
}

async sendNotification(id) {
const confirmed = await this.showConfirmation(
'Enviar notificación',
'¿Estás seguro de que quieres enviar esta notificación ahora?'
);

if (!confirmed) return;

try {
const result = await this.fetchData(`notifications/${id}/send`, {
method: 'POST'
});

if (result && result.success) {
await this.loadNotifications();
await this.loadNotificationStats();
this.showNotification('Éxito', 'Notificación enviada correctamente', 'success');

if (result.notification) {
this.showPushNotification(result.notification);
}
}
} catch (error) {
this.showNotification('Error', error.message || 'Error al enviar la notificación', 'error');
}
}

async sendCurrentNotification() {
const saved = await this.saveNotification();
if (!saved) {
return;
}
const notificationId = document.getElementById('notificationId').value;
if (notificationId) {
await this.sendNotification(notificationId);
document.getElementById('notificationModal').style.display = 'none';
} else {
this.showNotification('Error', 'No se pudo obtener el ID de la notificación', 'error');
}
}

async editProduct(id) {
try {
const products = await this.fetchData('products');
const product = products.find(p => p.id == id);
if (product) {
this.openProductModal(product);
}
} catch (error) {
console.error('Error editing product:', error);
this.showNotification('Error', 'Error al cargar el producto', 'error');
}
}

async editBanner(id) {
try {
const banners = await this.fetchData('banners');
const banner = banners.find(b => b.id == id);
if (banner) {
this.openBannerModal(banner);
}
} catch (error) {
console.error('Error editing banner:', error);
this.showNotification('Error', 'Error al cargar el banner', 'error');
}
}

async editNotification(id) {
try {
const notifications = await this.fetchData('notifications');
const notification = notifications.find(n => n.id == id);
if (notification) {
this.openNotificationModal(notification);
}
} catch (error) {
console.error('Error editing notification:', error);
this.showNotification('Error', 'Error al cargar la notificación', 'error');
}
}

async deleteProduct(id) {
const confirmed = await this.showConfirmation(
'Eliminar producto',
'¿Estás seguro de que quieres eliminar este producto? Esta acción no se puede deshacer.'
);

if (!confirmed) return;

try {
const result = await this.fetchData(`products/${id}`, {
method: 'DELETE'
});

if (result) {
this.showNotification('Éxito', 'Producto eliminado correctamente', 'success');
await this.loadProducts();
}
} catch (error) {
this.showNotification('Error', error.message || 'Error al eliminar el producto', 'error');
}
}

async deleteBanner(id) {
const confirmed = await this.showConfirmation(
'Eliminar banner',
'¿Estás seguro de que quieres eliminar este banner? Esta acción no se puede deshacer.'
);

if (!confirmed) return;

try {
const result = await this.fetchData(`banners/${id}`, {
method: 'DELETE'
});

if (result) {
this.showNotification('Éxito', 'Banner eliminado correctamente', 'success');
await this.loadBanners();
}
} catch (error) {
this.showNotification('Error', error.message || 'Error al eliminar el banner', 'error');
}
}

async deleteNotification(id) {
const confirmed = await this.showConfirmation(
'Eliminar notificación',
'¿Estás seguro de que quieres eliminar esta notificación? Esta acción no se puede deshacer.'
);

if (!confirmed) return;

try {
const result = await this.fetchData(`notifications/${id}`, {
method: 'DELETE'
});

if (result) {
this.showNotification('Éxito', 'Notificación eliminada correctamente', 'success');
await this.loadNotifications();
await this.loadNotificationStats();
}
} catch (error) {
this.showNotification('Error', error.message || 'Error al eliminar la notificación', 'error');
}
}

async updateinsignias() {
const confirmed = await this.showConfirmation(
'Actualizar insignias',
'¿Estás seguro de que quieres actualizar automáticamente todas las etiquetas de productos?\n\n' +
'Esta acción aplicará las reglas:\n' +
'• 50+ likes → Destacado\n' +
'• 100+ likes → Más Vendido\n' +
'• 15 días → Quitar "Nuevo"\n\n' +
'¿Continuar?'
);

if (!confirmed) return;

const updateButton = document.querySelector('#updateinsigniasBtn');
const originalText = updateButton.innerHTML;

if (updateButton) {
updateButton.innerHTML = '<div class="loading-spinner"></div> Actualizando...';
updateButton.classList.add('btn-loading');
updateButton.disabled = true;
}

try {
const result = await this.fetchData('products/update-insignias', {
method: 'POST'
});

if (result && result.success) {
this.showNotification(
'Insignias Actualizados',
`Se actualizaron ${result.updatedProducts} productos.\n` +
`Destacados: ${result.stats.featured}\n` +
`Más Vendidos: ${result.stats.best_seller}\n` +
`Nuevos: ${result.stats.new}`,
'success'
);

await this.loadProducts();
await this.showinsigniasStats();
}
} catch (error) {
this.showNotification('Error', error.message || 'Error al actualizar insignias', 'error');
} finally {
if (updateButton) {
updateButton.innerHTML = originalText;
updateButton.classList.remove('btn-loading');
updateButton.disabled = false;
}
}
}

async showinsigniasStats() {
try {
const modal = document.getElementById('statsModal');
const statsContent = document.getElementById('statsContent');

statsContent.innerHTML = '<div class="loading-spinner" style="margin: 2rem auto;"></div>';
modal.style.display = 'block';

const result = await this.fetchData('products/insignias-stats');

if (result && result.success) {
const stats = result.stats;

statsContent.innerHTML = `
<div class="stats-grid">
<div class="stat-card">
<i class="fas fa-box" style="color: #3498db;"></i>
<span class="stat-value">${stats.total}</span>
<span class="stat-label">Productos Totales</span>
</div>
<div class="stat-card">
<i class="fas fa-star" style="color: #2ecc71;"></i>
<span class="stat-value">${stats.current.new}</span>
<span class="stat-label">Productos Nuevos</span>
</div>
<div class="stat-card">
<i class="fas fa-award" style="color: #e74c3c;"></i>
<span class="stat-value">${stats.current.featured}</span>
<span class="stat-label">Destacados</span>
</div>
<div class="stat-card">
<i class="fas fa-fire" style="color: #3498db;"></i>
<span class="stat-value">${stats.current.best_seller}</span>
<span class="stat-label">Más Vendidos</span>
</div>
</div>

<div class="stats-section">
<h4><i class="fas fa-bullseye"></i> Puntuación de Productos</h4>
<div class="stats-grid">
<div class="stat-card">
<i class="fas fa-trophy" style="color: #f39c12;"></i>
<span class="stat-value">${stats.eligible.featured}</span>
<span class="stat-label">Destacado (50+ likes)</span>
</div>
<div class="stat-card">
<i class="fas fa-crown" style="color: #9b59b6;"></i>
<span class="stat-value">${stats.eligible.best_seller}</span>
<span class="stat-label">Más Vendido (100+ likes)</span>
</div>
</div>
</div>

<div class="stats-section">
<h4><i class="fas fa-clock"></i> Estado de Productos</h4>
<div class="stats-grid">
<div class="stat-card">
<i class="fas fa-hourglass-end" style="color: #e74c3c;"></i>
<span class="stat-value">${stats.expired.new}</span>
<span class="stat-label">Nuevos Expirados</span>
</div>
<div class="stat-card">
<i class="fas fa-percentage" style="color: #f39c12;"></i>
<span class="stat-value">${stats.current.offer}</span>
<span class="stat-label">Ofertas Activas</span>
</div>
</div>
</div>

${stats.expired.new > 0 ? `
<div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 1rem; margin-top: 1rem;">
<i class="fas fa-exclamation-triangle" style="color: #f39c12;"></i>
<strong>Acción Recomendada:</strong> ${stats.expired.new} productos han excedido los 15 días y deberían perder la etiqueta "Nuevo".
</div>
` : ''}
`;
} else {
statsContent.innerHTML = '<p class="no-data">Error al cargar las estadísticas</p>';
}
} catch (error) {
console.error('Error al obtener estadísticas:', error);
const statsContent = document.getElementById('statsContent');
statsContent.innerHTML = '<p class="no-data">Error al cargar las estadísticas</p>';
}
}
}

document.addEventListener('DOMContentLoaded', () => {
new AdminDashboard();
});