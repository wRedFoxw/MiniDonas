import express from 'express';
import pool from '../config/database.js';
import { sendToAllClients } from './realtime.js';

const router = express.Router();

async function updateProductInsignias(productId = null) {
let client;
try {
client = await pool.connect();
await client.query(`
UPDATE products 
SET 
is_featured = (likes >= 50 AND likes < 100),
is_best_seller = (likes >= 100),
is_new = (is_new AND created_at >= NOW() - INTERVAL '15 days'),
updated_at = NOW()
WHERE is_active = true
${productId ? 'AND id = $1' : ''}
`, productId ? [productId] : []);
} catch (error) {
console.error('Error actualizando insignias:', error);
} finally {
if (client) client.release();
}
}

router.get('/business-status', async (req, res) => {
let client;
try {
client = await pool.connect();

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
message: forcedState.forced_state ? 'Abierto (horario forzado)' : 'Cerrado (horario forzado)'
});
}
}

const hoursResult = await client.query('SELECT * FROM business_hours ORDER BY day_of_week');
const businessHours = hoursResult.rows;

const now = new Date();
const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
const cubaOffset = -5 * 60 * 60 * 1000;
const cubaTime = new Date(utc + cubaOffset);

const currentDay = cubaTime.getDay();
const currentTime = cubaTime.toTimeString().slice(0, 8);

const todayHours = businessHours.find(h => h.day_of_week === currentDay);

if (!todayHours || todayHours.is_closed) {
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
open_time: nextOpenDay.open_time
} : null,
message: nextOpenDay ? `Abrimos el ${nextOpenDay.day_name} a las ${nextOpenDay.open_time}` : 'Cerrado'
});
}

if (currentTime >= todayHours.open_time && currentTime <= todayHours.close_time) {
return res.json({
is_open: true,
is_forced: false,
closing_time: todayHours.close_time,
message: `Cerramos a las ${todayHours.close_time}`
});
} else if (currentTime < todayHours.open_time) {
return res.json({
is_open: false,
is_forced: false,
next_open_time: todayHours.open_time,
message: `Abrimos a las ${todayHours.open_time}`
});
} else {
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
open_time: nextOpenDay.open_time
} : null,
message: nextOpenDay ? `Abrimos el ${nextOpenDay.day_name} a las ${nextOpenDay.open_time}` : 'Cerrado'
});
}

} catch (error) {
console.error('Error al obtener estado del establecimiento:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

router.get('/products', async (req, res) => {
let client;
try {
await updateProductInsignias();
client = await pool.connect();
const result = await client.query(`
SELECT * FROM products 
WHERE is_active = true 
ORDER BY 
CASE 
WHEN is_new = true THEN 1
WHEN is_offer = true THEN 2
WHEN is_best_seller = true THEN 3
WHEN is_featured = true THEN 4
ELSE 5
END,
created_at DESC
`);
res.json(result.rows);
} catch (error) {
console.error('Error al obtener productos:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

router.get('/banners', async (req, res) => {
let client;
try {
client = await pool.connect();
const result = await client.query(`
SELECT * FROM banners 
WHERE is_active = true 
ORDER BY created_at DESC
`);
res.json(result.rows);
} catch (error) {
console.error('Error al obtener banners:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

router.post('/vote', async (req, res) => {
const { productId, type, deviceId } = req.body;
let client;
try {
client = await pool.connect();
await client.query('BEGIN');

const existingVotes = await client.query(
'SELECT * FROM votes WHERE product_id = $1 AND device_id = $2',
[productId, deviceId]
);

if (existingVotes.rows.length > 0) {
const existingVote = existingVotes.rows[0];

if (existingVote.type !== type) {
await client.query(
'DELETE FROM votes WHERE product_id = $1 AND device_id = $2',
[productId, deviceId]
);

const previousColumn = existingVote.type === 'like' ? 'likes' : 'dislikes';
await client.query(
`UPDATE products SET ${previousColumn} = ${previousColumn} - 1 WHERE id = $1`,
[productId]
);

await client.query(
'INSERT INTO votes (product_id, device_id, type) VALUES ($1, $2, $3)',
[productId, deviceId, type]
);

const newColumn = type === 'like' ? 'likes' : 'dislikes';
await client.query(
`UPDATE products SET ${newColumn} = ${newColumn} + 1 WHERE id = $1`,
[productId]
);
} else {
await client.query('ROLLBACK');
return res.status(400).json({ error: 'Ya has votado por este producto' });
}
} else {
await client.query(
'INSERT INTO votes (product_id, device_id, type) VALUES ($1, $2, $3)',
[productId, deviceId, type]
);

const columnToUpdate = type === 'like' ? 'likes' : 'dislikes';
await client.query(
`UPDATE products SET ${columnToUpdate} = ${columnToUpdate} + 1 WHERE id = $1`,
[productId]
);
}

await client.query('COMMIT');
await updateProductInsignias(productId);

const updatedProductResult = await client.query('SELECT * FROM products WHERE id = $1', [productId]);
const updatedProduct = updatedProductResult.rows[0];

sendToAllClients('products_updated', { 
action: 'updated', 
product: updatedProduct 
});

res.json({ 
success: true, 
message: `Voto ${existingVotes.rows.length > 0 ? 'cambiado' : 'registrado'} (${type})`,
product: updatedProduct
});
} catch (error) {
if (client) await client.query('ROLLBACK');
console.error('Error al registrar voto:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

router.post('/register-device', async (req, res) => {
const { device_id, user_agent, persistent_id } = req.body;
let client;
try {
client = await pool.connect();

let finalDeviceId = device_id;
if (persistent_id) {
finalDeviceId = persistent_id;
}

const existingDevice = await client.query(
'SELECT * FROM devices WHERE device_id = $1',
[finalDeviceId]
);

if (existingDevice.rows.length > 0) {
await client.query(
'UPDATE devices SET last_seen = NOW(), user_agent = $1 WHERE device_id = $2',
[user_agent || '', finalDeviceId]
);
} else {
await client.query(
'INSERT INTO devices (device_id, user_agent) VALUES ($1, $2)',
[finalDeviceId, user_agent || '']
);
}

res.json({ success: true, device_id: finalDeviceId });
} catch (error) {
console.error('Error al registrar dispositivo:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

router.get('/device-votes', async (req, res) => {
const { device_id } = req.query;
let client;
try {
if (!device_id) {
return res.status(400).json({ error: 'device_id es requerido' });
}

client = await pool.connect();
const result = await client.query(
'SELECT product_id, type FROM votes WHERE device_id = $1',
[device_id]
);

const votes = {};
result.rows.forEach(vote => {
votes[vote.product_id] = vote.type;
});

res.json({ success: true, votes });
} catch (error) {
console.error('Error al obtener votos:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

router.get('/notifications', async (req, res) => {
const { device_id } = req.query;
let client;
try {
if (!device_id) {
return res.status(400).json({ error: 'device_id es requerido' });
}

client = await pool.connect();
const result = await client.query(
`SELECT n.*, 
CASE WHEN nr.device_id IS NULL THEN false ELSE true END as is_read
FROM notifications n
LEFT JOIN notification_reads nr ON n.id = nr.notification_id AND nr.device_id = $1
WHERE n.is_active = true AND n.is_sent = true
ORDER BY n.send_at DESC
LIMIT 50`,
[device_id]
);

res.json(result.rows);
} catch (error) {
console.error('Error al obtener notificaciones:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

router.post('/notifications/:id/read', async (req, res) => {
const { id } = req.params;
const { device_id } = req.body;
let client;
try {
if (!device_id) {
return res.status(400).json({ error: 'device_id es requerido' });
}

client = await pool.connect();
const existingRead = await client.query(
'SELECT * FROM notification_reads WHERE notification_id = $1 AND device_id = $2',
[id, device_id]
);

if (existingRead.rows.length === 0) {
await client.query(
'INSERT INTO notification_reads (notification_id, device_id) VALUES ($1, $2)',
[id, device_id]
);
}

res.json({ success: true });
} catch (error) {
console.error('Error al marcar notificación como leída:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

router.get('/notifications/unread-count', async (req, res) => {
const { device_id } = req.query;
let client;
try {
if (!device_id) {
return res.status(400).json({ error: 'device_id es requerido' });
}

client = await pool.connect();
const result = await client.query(
`SELECT COUNT(*) 
FROM notifications n
LEFT JOIN notification_reads nr ON n.id = nr.notification_id AND nr.device_id = $1
WHERE n.is_active = true AND n.is_sent = true AND nr.device_id IS NULL`,
[device_id]
);

res.json({ count: parseInt(result.rows[0].count) });
} catch (error) {
console.error('Error al obtener contador de no leídas:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

export default router;