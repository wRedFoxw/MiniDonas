class AdminDashboard {
constructor() {
this.currentProduct = null;
this.currentBanner = null;
this.currentNotification = null;
this.notificationSound = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==');
this.notificationQueue = [];
this.isShowingNotification = false;
this.init();
}

async init() {
await this.loadProducts();
await this.loadBanners();
await this.loadSettings();
await this.loadNotifications();
await this.loadNotificationStats();
this.setupEventListeners();
this.setupSystemNotifications();
this.requestNotificationPermission();
}

async fetchData(endpoint, options = {}) {
try {
const response = await fetch(`/api/admin/${endpoint}`, options);
if (!response.ok) {
const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
throw new Error(errorData.error || `Error ${response.status}: ${response.statusText}`);
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

async loadSettings() {
const settings = await this.fetchData('settings');
if (settings) {
document.getElementById('themeColor').value = settings.theme_color || '#e44d26';
if (settings.logo_data) {
document.getElementById('logoPreview').innerHTML = `<img src="${settings.logo_data}" alt="Logo">`;
}
}
}

async loadNotifications() {
try {
this.setLoadingState('notificationsList', true);
const notifications = await this.fetchData('notifications');
if (notifications) this.renderNotifications(notifications);
} finally {
this.setLoadingState('notificationsList', false);
}
}

async loadNotificationStats() {
const stats = await this.fetchData('notifications/stats');
if (stats) {
document.getElementById('totalNotifications').textContent = stats.total;
document.getElementById('sentNotifications').textContent = stats.sent;
document.getElementById('totalDevices').textContent = stats.devices;
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

const badges = [];
if (product.is_new) badges.push('Nuevo');
if (product.is_offer) badges.push('Oferta');
if (product.is_featured) badges.push('Destacado');
if (product.is_best_seller) badges.push('Más Vendido');

div.innerHTML = `
<div class="product-info">
<h4>${this.escapeHtml(product.name)}</h4>
<p>$${product.price} | <i class="fas fa-thumbs-up"></i> ${product.likes} | <i class="fas fa-thumbs-down"></i> ${product.dislikes}</p>
<p><small>${badges.join(', ') || 'Sin etiquetas'}</small></p>
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

const sendDate = new Date(notification.send_at).toLocaleString();
const createdDate = new Date(notification.created_at).toLocaleString();

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
<span>Estado: ${notification.is_active ? 'Activa' : 'Inactiva'} | ${notification.is_sent ? 'Enviada' : 'Pendiente'}</span>
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

setupEventListeners() {
document.querySelectorAll('.nav-btn').forEach(btn => {
btn.addEventListener('click', (e) => {
document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));

e.target.classList.add('active');
document.getElementById(`${e.target.dataset.tab}-tab`).classList.add('active');
});
});

document.getElementById('addProductBtn').addEventListener('click', () => {
this.openProductModal();
});

document.getElementById('productForm').addEventListener('submit', (e) => {
e.preventDefault();
this.saveProduct();
});

document.getElementById('addBannerBtn').addEventListener('click', () => {
this.openBannerModal();
});

document.getElementById('bannerForm').addEventListener('submit', (e) => {
e.preventDefault();
this.saveBanner();
});

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

document.getElementById('settingsForm').addEventListener('submit', (e) => {
e.preventDefault();
this.saveSettings();
});

document.getElementById('productImageUpload').addEventListener('change', (e) => {
this.previewImageAsBase64(e.target, 'productImagePreview', 'productImageData');
});

document.getElementById('bannerImageUpload').addEventListener('change', (e) => {
this.previewImageAsBase64(e.target, 'bannerImagePreview', 'bannerImageData');
});

document.getElementById('logoUpload').addEventListener('change', (e) => {
this.previewImageAsBase64(e.target, 'logoPreview', 'logoData');
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

this.setupSSE();
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
case 'connected':
console.log('Cliente conectado SSE:', data.data.clientId);
break;
default:
console.log('Mensaje SSE no manejado:', data);
}
}

handleProductsUpdate(payload) {
this.showNotification('Productos actualizados', 'La lista de productos ha sido actualizada', 'info', 3000);
this.loadProducts();
}

handleBannersUpdate(payload) {
this.showNotification('Banners actualizados', 'La lista de banners ha sido actualizada', 'info', 3000);
this.loadBanners();
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
this.showNotification('Notificaciones activadas', 'Ahora recibirás notificaciones push', 'success', 3000);
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
};
reader.readAsDataURL(file);
} else {
preview.innerHTML = '';
const dataField = document.getElementById(dataFieldId);
if (dataField) dataField.value = '';
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

document.getElementById('productImageUpload').required = false;
} else {
title.innerHTML = '<i class="fas fa-plus"></i> Agregar Producto';
document.getElementById('productForm').reset();
document.getElementById('productImagePreview').innerHTML = '';
document.getElementById('productImageUpload').required = true;

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

document.getElementById('bannerImageUpload').required = false;
} else {
title.innerHTML = '<i class="fas fa-plus"></i> Agregar Banner';
document.getElementById('bannerForm').reset();
document.getElementById('bannerImagePreview').innerHTML = '';
document.getElementById('bannerImageUpload').required = true;

const dataField = document.getElementById('bannerImageData');
if (dataField) dataField.value = '';
}

modal.style.display = 'block';
}

openNotificationModal(notification = null) {
this.currentNotification = notification;
const modal = document.getElementById('notificationModal');
const title = document.getElementById('notificationModalTitle');

const now = new Date();
const localDateTime = now.toISOString().slice(0, 16);
document.getElementById('notificationSendAt').min = localDateTime;

if (notification) {
title.innerHTML = '<i class="fas fa-edit"></i> Editar Notificación';
document.getElementById('notificationId').value = notification.id;
document.getElementById('notificationTitle').value = notification.title;
document.getElementById('notificationMessage').value = notification.message;
document.getElementById('notificationType').value = notification.type;
document.getElementById('notificationActive').checked = Boolean(notification.is_active);
document.getElementById('notificationSendNow').checked = false;

const sendDate = new Date(notification.send_at);
const formattedDate = sendDate.toISOString().slice(0, 16);
document.getElementById('notificationSendAt').value = formattedDate;

document.getElementById('sendNotificationBtn').style.display = notification.is_sent ? 'none' : 'block';
} else {
title.innerHTML = '<i class="fas fa-plus"></i> Nueva Notificación';
document.getElementById('notificationForm').reset();
document.getElementById('notificationSendAt').value = localDateTime;
document.getElementById('notificationActive').checked = true;
document.getElementById('notificationSendNow').checked = false;
document.getElementById('sendNotificationBtn').style.display = 'block';
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

const submitButton = document.querySelector('#productForm button[type="submit"]');
const originalText = submitButton.innerHTML;
submitButton.innerHTML = '<div class="loading-spinner"></div> Guardando...';
submitButton.classList.add('btn-loading');
submitButton.disabled = true;

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
submitButton.innerHTML = originalText;
submitButton.classList.remove('btn-loading');
submitButton.disabled = false;
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
const formData = {
title: document.getElementById('notificationTitle').value,
message: document.getElementById('notificationMessage').value,
type: document.getElementById('notificationType').value,
is_active: document.getElementById('notificationActive').checked,
send_at: document.getElementById('notificationSendAt').value
};

if (!formData.title || !formData.message) {
this.showNotification('Error', 'Título y mensaje son campos requeridos', 'error');
return;
}

if (document.getElementById('notificationSendNow').checked) {
formData.send_at = new Date().toISOString();
}

const notificationId = document.getElementById('notificationId').value;
let result;

const submitButton = document.querySelector('#notificationForm button[type="submit"]');
const originalText = submitButton.innerHTML;
submitButton.innerHTML = '<div class="loading-spinner"></div> Guardando...';
submitButton.classList.add('btn-loading');
submitButton.disabled = true;

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
document.getElementById('notificationModal').style.display = 'none';
this.showNotification('Éxito', `Notificación ${notificationId ? 'actualizada' : 'creada'} correctamente`, 'success');
await this.loadNotifications();
await this.loadNotificationStats();
}
} catch (error) {
this.showNotification('Error', error.message || 'Error al guardar la notificación', 'error');
} finally {
submitButton.innerHTML = originalText;
submitButton.classList.remove('btn-loading');
submitButton.disabled = false;
}
}

async saveSettings() {
const logoDataField = document.getElementById('logoData');
const logoData = logoDataField ? logoDataField.value : '';

const formData = {
theme_color: document.getElementById('themeColor').value,
logo_data: logoData
};

const submitButton = document.querySelector('#settingsForm button[type="submit"]');
const originalText = submitButton.innerHTML;
submitButton.innerHTML = '<div class="loading-spinner"></div> Guardando...';
submitButton.classList.add('btn-loading');
submitButton.disabled = true;

try {
const result = await this.fetchData('settings', {
method: 'PUT',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(formData)
});

if (result) {
this.showNotification('Éxito', 'Configuración guardada correctamente', 'success');
await this.loadSettings();
}
} catch (error) {
this.showNotification('Error', error.message || 'Error al guardar la configuración', 'error');
} finally {
submitButton.innerHTML = originalText;
submitButton.classList.remove('btn-loading');
submitButton.disabled = false;
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
const notificationId = document.getElementById('notificationId').value;
if (notificationId) {
await this.sendNotification(notificationId);
document.getElementById('notificationModal').style.display = 'none';
}
}

async editProduct(id) {
const products = await this.fetchData('products');
const product = products.find(p => p.id == id);
if (product) {
this.openProductModal(product);
}
}

async editBanner(id) {
const banners = await this.fetchData('banners');
const banner = banners.find(b => b.id == id);
if (banner) {
this.openBannerModal(banner);
}
}

async editNotification(id) {
const notifications = await this.fetchData('notifications');
const notification = notifications.find(n => n.id == id);
if (notification) {
this.openNotificationModal(notification);
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
}

document.addEventListener('DOMContentLoaded', () => {
new AdminDashboard();
});