import express from 'express';
import pool from '../config/database.js';
import { sendToAllClients } from './realtime.js';

const router = express.Router();

const processBase64Image = (base64String) => {
if (!base64String || !base64String.startsWith('data:image')) {
return null;
}

const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
if (!matches || matches.length !== 3) {
return null;
}

return {
mimeType: matches[1],
data: matches[2]
};
};

// Función para enviar eventos SSE cuando hay cambios
const notifyClients = (event, data) => {
sendToAllClients(event, data);
};

// Obtener todos los productos (incluyendo inactivos) para el admin
router.get('/products', async (req, res) => {
let client;
try {
client = await pool.connect();
const result = await client.query(`
SELECT * FROM products 
ORDER BY created_at DESC
`);
res.json(result.rows);
} catch (error) {
console.error('Error al obtener productos:', error);
res.status(500).json({ 
error: 'Error interno del servidor',
details: process.env.NODE_ENV === 'development' ? error.message : undefined
});
} finally {
if (client) {
try {
client.release();
} catch (releaseError) {
console.error('Error liberando cliente:', releaseError);
}
}
}
});

router.post('/products', async (req, res) => {
const { name, description, price, image_data, is_active, is_new, is_offer, is_featured, is_best_seller } = req.body;
let client;

try {
if (!image_data) {
return res.status(400).json({ error: 'La imagen es requerida' });
}

const imageInfo = processBase64Image(image_data);
if (!imageInfo) {
return res.status(400).json({ error: 'Formato de imagen inválido' });
}

client = await pool.connect();
const result = await client.query(
`INSERT INTO products 
(name, description, price, image_data, is_active, is_new, is_offer, is_featured, is_best_seller, likes, dislikes) 
VALUES 
($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0)
RETURNING *`,
[
name, 
description || '', 
parseFloat(price), 
image_data, 
is_active === true || is_active === 'true',
is_new === true || is_new === 'true', 
is_offer === true || is_offer === 'true', 
is_featured === true || is_featured === 'true', 
is_best_seller === true || is_best_seller === 'true'
]
);

// Notificar a todos los clientes sobre el nuevo producto
notifyClients('products_updated', { 
action: 'created', 
product: result.rows[0] 
});

res.status(201).json(result.rows[0]);
} catch (error) {
console.error('Error al crear producto:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

router.put('/products/:id', async (req, res) => {
const { id } = req.params;
const { name, description, price, image_data, is_active, is_new, is_offer, is_featured, is_best_seller } = req.body;
let client;

try {
client = await pool.connect();

const updateFields = [
'name = $1',
'description = $2',
'price = $3',
'is_active = $4',
'is_new = $5',
'is_offer = $6',
'is_featured = $7',
'is_best_seller = $8',
'updated_at = NOW()'
];
const values = [
name,
description || '',
parseFloat(price),
is_active === true || is_active === 'true',
is_new === true || is_new === 'true',
is_offer === true || is_offer === 'true',
is_featured === true || is_featured === 'true',
is_best_seller === true || is_best_seller === 'true'
];

if (image_data && image_data.startsWith('data:image')) {
updateFields.push('image_data = $9');
values.push(image_data);
}

values.push(id);

const query = `
UPDATE products 
SET ${updateFields.join(', ')}
WHERE id = $${values.length}
RETURNING *
`;

const result = await client.query(query, values);

if (result.rows.length === 0) {
return res.status(404).json({ error: 'Producto no encontrado' });
}

// Notificar a todos los clientes sobre la actualización
notifyClients('products_updated', { 
action: 'updated', 
product: result.rows[0] 
});

res.json(result.rows[0]);
} catch (error) {
console.error('Error al actualizar producto:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

router.delete('/products/:id', async (req, res) => {
const { id } = req.params;
let client;

try {
client = await pool.connect();
await client.query('BEGIN');
await client.query('DELETE FROM votes WHERE product_id = $1', [id]);
const result = await client.query('DELETE FROM products WHERE id = $1', [id]);

if (result.rowCount === 0) {
await client.query('ROLLBACK');
return res.status(404).json({ error: 'Producto no encontrado' });
}

await client.query('COMMIT');

// Notificar a todos los clientes sobre la eliminación
notifyClients('products_updated', { 
action: 'deleted', 
productId: id 
});

res.json({ message: 'Producto eliminado' });
} catch (error) {
if (client) await client.query('ROLLBACK');
console.error('Error al eliminar producto:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

// Obtener todos los banners (incluyendo inactivos) para el admin
router.get('/banners', async (req, res) => {
let client;
try {
client = await pool.connect();
const result = await client.query('SELECT * FROM banners ORDER BY created_at DESC');
res.json(result.rows);
} catch (error) {
console.error('Error al obtener banners:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

router.post('/banners', async (req, res) => {
const { image_data, title, subtitle, is_active } = req.body;
let client;

try {
if (!image_data) {
return res.status(400).json({ error: 'La imagen es requerida' });
}

const imageInfo = processBase64Image(image_data);
if (!imageInfo) {
return res.status(400).json({ error: 'Formato de imagen inválido' });
}

client = await pool.connect();
const result = await client.query(
`INSERT INTO banners (image_data, title, subtitle, is_active) 
VALUES ($1, $2, $3, $4)
RETURNING *`,
[image_data, title || '', subtitle || '', is_active === true || is_active === 'true']
);

// Notificar a todos los clientes sobre el nuevo banner
notifyClients('banners_updated', { 
action: 'created', 
banner: result.rows[0] 
});

res.status(201).json(result.rows[0]);
} catch (error) {
console.error('Error al crear banner:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

router.put('/banners/:id', async (req, res) => {
const { id } = req.params;
const { image_data, title, subtitle, is_active } = req.body;
let client;

try {
client = await pool.connect();

const updateFields = [
'title = $1',
'subtitle = $2',
'is_active = $3'
];
const values = [
title || '',
subtitle || '',
is_active === true || is_active === 'true'
];

if (image_data && image_data.startsWith('data:image')) {
updateFields.push('image_data = $4');
values.push(image_data);
}

values.push(id);

const query = `
UPDATE banners 
SET ${updateFields.join(', ')}
WHERE id = $${values.length}
RETURNING *
`;

const result = await client.query(query, values);

if (result.rows.length === 0) {
return res.status(404).json({ error: 'Banner no encontrado' });
}

// Notificar a todos los clientes sobre la actualización
notifyClients('banners_updated', { 
action: 'updated', 
banner: result.rows[0] 
});

res.json(result.rows[0]);
} catch (error) {
console.error('Error al actualizar banner:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

router.delete('/banners/:id', async (req, res) => {
const { id } = req.params;
let client;

try {
client = await pool.connect();
const result = await client.query('DELETE FROM banners WHERE id = $1', [id]);

if (result.rowCount === 0) {
return res.status(404).json({ error: 'Banner no encontrado' });
}

// Notificar a todos los clientes sobre la eliminación
notifyClients('banners_updated', { 
action: 'deleted', 
bannerId: id 
});

res.json({ message: 'Banner eliminado' });
} catch (error) {
console.error('Error al eliminar banner:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

// Obtener horarios del establecimiento
router.get('/business-hours', async (req, res) => {
let client;
try {
client = await pool.connect();
const result = await client.query('SELECT * FROM business_hours ORDER BY day_of_week');
res.json(result.rows);
} catch (error) {
console.error('Error al obtener horarios:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

// Función para convertir formato 24h a 12h
const formatTimeTo12h = (time24) => {
if (!time24) return '';
const [hours, minutes] = time24.split(':');
const hour = parseInt(hours, 10);
const ampm = hour >= 12 ? 'PM' : 'AM';
const hour12 = hour % 12 || 12;
return `${hour12}:${minutes} ${ampm}`;
};

// Función para convertir formato 12h a 24h
const formatTimeTo24h = (time12) => {
if (!time12) return '';
const [time, ampm] = time12.split(' ');
let [hours, minutes] = time.split(':');
let hour = parseInt(hours, 10);
if (ampm === 'PM' && hour < 12) hour += 12;
if (ampm === 'AM' && hour === 12) hour = 0;
return `${hour.toString().padStart(2, '0')}:${minutes}`;
};

// Actualizar horarios del establecimiento
router.put('/business-hours', async (req, res) => {
const { hours } = req.body;
let client;
try {
client = await pool.connect();
await client.query('BEGIN');

for (const hour of hours) {
// Convertir de 12h a 24h para almacenar en BD
const openTime24 = hour.open_time ? formatTimeTo24h(hour.open_time) : null;
const closeTime24 = hour.close_time ? formatTimeTo24h(hour.close_time) : null;

await client.query(
`UPDATE business_hours 
SET open_time = $1, close_time = $2, is_closed = $3, updated_at = NOW()
WHERE day_of_week = $4`,
[openTime24, closeTime24, hour.is_closed, hour.day_of_week]
);
}

await client.query('COMMIT');

notifyClients('business_hours_updated', { 
message: 'Horarios actualizados',
hours: hours
});

res.json({ success: true, message: 'Horarios actualizados' });
} catch (error) {
await client.query('ROLLBACK');
console.error('Error al actualizar horarios:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

// Obtener estado forzado
router.get('/business-forced-state', async (req, res) => {
let client;
try {
client = await pool.connect();
const result = await client.query('SELECT * FROM business_forced_state WHERE id = 1');
res.json(result.rows[0] || {});
} catch (error) {
console.error('Error al obtener estado forzado:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

// Actualizar estado forzado
router.put('/business-forced-state', async (req, res) => {
const { is_forced, forced_state, forced_until } = req.body;
let client;
try {
client = await pool.connect();
const result = await client.query(
`UPDATE business_forced_state 
SET is_forced = $1, forced_state = $2, forced_until = $3, updated_at = NOW()
WHERE id = 1
RETURNING *`,
[is_forced, forced_state, forced_until]
);

if (result.rows.length === 0) {
return res.status(404).json({ error: 'Estado forzado no encontrado' });
}

// Notificar a todos los clientes sobre el cambio de estado
notifyClients('business_status_updated', { 
is_forced: result.rows[0].is_forced,
forced_state: result.rows[0].forced_state,
forced_until: result.rows[0].forced_until
});

res.json({ success: true, forcedState: result.rows[0] });
} catch (error) {
console.error('Error al actualizar estado forzado:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

// Obtener estado actual del negocio (para cliente)
router.get('/business-status', async (req, res) => {
let client;
try {
client = await pool.connect();

// Obtener estado forzado
const forcedStateResult = await client.query('SELECT * FROM business_forced_state WHERE id = 1');
const forcedState = forcedStateResult.rows[0];

if (forcedState && forcedState.is_forced) {
const now = new Date();
const forcedUntil = new Date(forcedState.forced_until);
if (now <= forcedUntil) {
return res.json({
is_open: forcedState.forced_state,
is_forced: true,
forced_until: forcedState.forced_until,
message: forcedState.forced_state ? 
'Estamos abiertos (horario forzado)' : 
'Estamos cerrados (horario forzado)'
});
}
}

// Obtener horarios regulares
const hoursResult = await client.query('SELECT * FROM business_hours ORDER BY day_of_week');
const businessHours = hoursResult.rows;

const now = new Date();
// Ajustar a zona horaria de Cuba (UTC-5, pero puede variar con horario de verano)
const cubaOffset = -5 * 60; // UTC-5 en minutos
const localTime = new Date(now.getTime() + (cubaOffset + now.getTimezoneOffset()) * 60000);

const currentDay = localTime.getDay(); // 0: Domingo, 1: Lunes, ..., 6: Sábado
const currentTime = localTime.toTimeString().slice(0, 8); // HH:MM:SS

// Buscar horario del día actual
const todayHours = businessHours.find(h => h.day_of_week === currentDay);

if (!todayHours || todayHours.is_closed) {
// Buscar próximo día abierto
let nextOpenDay = null;
for (let i = 1; i <= 7; i++) {
const nextDay = (currentDay + i) % 7;
const nextDayHours = businessHours.find(h => h.day_of_week === nextDay && !h.is_closed);
if (nextDayHours) {
nextOpenDay = nextDayHours;
break;
}
}

return res.json({
is_open: false,
is_forced: false,
next_open_day: nextOpenDay ? {
day_name: nextOpenDay.day_name,
open_time: formatTimeTo12h(nextOpenDay.open_time)
} : null,
message: nextOpenDay ? 
`Abrimos el ${nextOpenDay.day_name} a las ${formatTimeTo12h(nextOpenDay.open_time)}` :
'Cerrado temporalmente'
});
}

// Verificar si estamos dentro del horario de hoy
if (currentTime >= todayHours.open_time && currentTime <= todayHours.close_time) {
return res.json({
is_open: true,
is_forced: false,
closing_time: formatTimeTo12h(todayHours.close_time),
message: `Cerramos a las ${formatTimeTo12h(todayHours.close_time)}`
});
} else if (currentTime < todayHours.open_time) {
return res.json({
is_open: false,
is_forced: false,
next_open_time: formatTimeTo12h(todayHours.open_time),
message: `Abrimos a las ${formatTimeTo12h(todayHours.open_time)}`
});
} else {
// Buscar próximo día abierto
let nextOpenDay = null;
for (let i = 1; i <= 7; i++) {
const nextDay = (currentDay + i) % 7;
const nextDayHours = businessHours.find(h => h.day_of_week === nextDay && !h.is_closed);
if (nextDayHours) {
nextOpenDay = nextDayHours;
break;
}
}

return res.json({
is_open: false,
is_forced: false,
next_open_day: nextOpenDay ? {
day_name: nextOpenDay.day_name,
open_time: formatTimeTo12h(nextOpenDay.open_time)
} : null,
message: nextOpenDay ? 
`Abrimos el ${nextOpenDay.day_name} a las ${formatTimeTo12h(nextOpenDay.open_time)}` :
'Cerrado temporalmente'
});
}

} catch (error) {
console.error('Error al obtener estado del establecimiento:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

router.get('/notifications', async (req, res) => {
let client;
try {
client = await pool.connect();
const result = await client.query(`
SELECT * FROM notifications 
ORDER BY created_at DESC
`);
res.json(result.rows);
} catch (error) {
console.error('Error al obtener notificaciones:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

router.post('/notifications', async (req, res) => {
const { title, message, type, is_active, send_at } = req.body;
let client;
try {
client = await pool.connect();
const result = await client.query(
`INSERT INTO notifications (title, message, type, is_active, send_at) 
VALUES ($1, $2, $3, $4, $5)
RETURNING *`,
[title, message || '', type || 'info', is_active === true || is_active === 'true', send_at || new Date()]
);

res.status(201).json(result.rows[0]);
} catch (error) {
console.error('Error al crear notificación:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

router.put('/notifications/:id', async (req, res) => {
const { id } = req.params;
const { title, message, type, is_active, send_at } = req.body;
let client;
try {
client = await pool.connect();
const result = await client.query(
`UPDATE notifications 
SET 
title = $1,
message = $2,
type = $3,
is_active = $4,
send_at = $5,
updated_at = NOW()
WHERE id = $6
RETURNING *`,
[title, message || '', type || 'info', is_active === true || is_active === 'true', send_at, id]
);

if (result.rows.length === 0) {
return res.status(404).json({ error: 'Notificación no encontrada' });
}

res.json(result.rows[0]);
} catch (error) {
console.error('Error al actualizar notificación:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

router.delete('/notifications/:id', async (req, res) => {
const { id } = req.params;
let client;
try {
client = await pool.connect();
const result = await client.query('DELETE FROM notifications WHERE id = $1', [id]);

if (result.rowCount === 0) {
return res.status(404).json({ error: 'Notificación no encontrada' });
}

res.json({ message: 'Notificación eliminada' });
} catch (error) {
console.error('Error al eliminar notificación:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

router.post('/notifications/:id/send', async (req, res) => {
const { id } = req.params;
let client;
try {
client = await pool.connect();
const result = await client.query(
`UPDATE notifications 
SET is_sent = true, send_at = NOW() 
WHERE id = $1
RETURNING *`,
[id]
);

if (result.rows.length === 0) {
return res.status(404).json({ error: 'Notificación no encontrada' });
}

// Notificar a todos los clientes sobre la nueva notificación
notifyClients('new_notification', { 
notification: result.rows[0] 
});

res.json({ 
success: true, 
message: 'Notificación enviada',
notification: result.rows[0]
});
} catch (error) {
console.error('Error al enviar notificación:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

router.get('/notifications/stats', async (req, res) => {
let client;
try {
client = await pool.connect();

const totalResult = await client.query('SELECT COUNT(*) FROM notifications');
const sentResult = await client.query('SELECT COUNT(*) FROM notifications WHERE is_sent = true');
const activeResult = await client.query('SELECT COUNT(*) FROM notifications WHERE is_active = true');
const devicesResult = await client.query('SELECT COUNT(*) FROM devices');

res.json({
total: parseInt(totalResult.rows[0].count),
sent: parseInt(sentResult.rows[0].count),
active: parseInt(activeResult.rows[0].count),
devices: parseInt(devicesResult.rows[0].count)
});
} catch (error) {
console.error('Error al obtener estadísticas:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

// Endpoint para forzar actualización de insignias
router.post('/products/update-insignias', async (req, res) => {
let client;
try {
client = await pool.connect();

console.log('Iniciando actualización forzada de insignias...');

// Actualizar insignias basado en reglas de negocio
const updateResult = await client.query(`
UPDATE products 
SET 
is_featured = (likes >= 50 AND likes < 100),
is_best_seller = (likes >= 100),
is_new = (is_new AND created_at >= NOW() - INTERVAL '15 days'),
updated_at = NOW()
WHERE is_active = true
RETURNING id, name, likes, is_featured, is_best_seller, is_new
`);

// Contar estadísticas de la actualización
const stats = {
total: updateResult.rows.length,
featured: updateResult.rows.filter(p => p.is_featured).length,
best_seller: updateResult.rows.filter(p => p.is_best_seller).length,
new: updateResult.rows.filter(p => p.is_new).length
};

console.log('Actualización de insignias completada:', stats);

// Notificar a todos los clientes sobre la actualización masiva
notifyClients('products_updated', { 
action: 'bulk_update',
stats: stats,
message: 'Insignias actualizados automáticamente'
});

res.json({ 
success: true, 
message: 'Insignias actualizados',
stats: stats,
updatedProducts: updateResult.rows.length
});

} catch (error) {
console.error('Error al actualizar insignias:', error);
res.status(500).json({ 
error: 'Error interno del servidor',
details: process.env.NODE_ENV === 'development' ? error.message : undefined
});
} finally {
if (client) client.release();
}
});

// Endpoint para obtener estadísticas de insignias actuales
router.get('/products/insignias-stats', async (req, res) => {
let client;
try {
client = await pool.connect();

const statsResult = await client.query(`
SELECT 
COUNT(*) as total_products,
COUNT(CASE WHEN is_featured = true THEN 1 END) as featured_count,
COUNT(CASE WHEN is_best_seller = true THEN 1 END) as best_seller_count,
COUNT(CASE WHEN is_new = true THEN 1 END) as new_count,
COUNT(CASE WHEN is_offer = true THEN 1 END) as offer_count,
COUNT(CASE WHEN likes >= 50 AND likes < 100 THEN 1 END) as eligible_featured,
COUNT(CASE WHEN likes >= 100 THEN 1 END) as eligible_best_seller,
COUNT(CASE WHEN is_new = true AND created_at < NOW() - INTERVAL '15 days' THEN 1 END) as expired_new
FROM products 
WHERE is_active = true
`);

const stats = statsResult.rows[0];

res.json({
success: true,
stats: {
total: parseInt(stats.total_products),
current: {
featured: parseInt(stats.featured_count),
best_seller: parseInt(stats.best_seller_count),
new: parseInt(stats.new_count),
offer: parseInt(stats.offer_count)
},
eligible: {
featured: parseInt(stats.eligible_featured),
best_seller: parseInt(stats.eligible_best_seller)
},
expired: {
new: parseInt(stats.expired_new)
}
}
});

} catch (error) {
console.error('Error al obtener estadísticas de insignias:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

export default router;