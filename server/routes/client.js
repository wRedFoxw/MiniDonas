import express from 'express';
import pool from '../config/database.js';

const router = express.Router();

// Función para actualizar automáticamente las etiquetas de productos
async function updateProductBadges(productId = null) {
let client;
try {
client = await pool.connect();

// Actualizar productos destacados y más vendidos basado en likes
await client.query(`
UPDATE products 
SET 
is_featured = (likes >= 50 AND likes < 100),
is_best_seller = (likes >= 100),
is_new = (is_new AND created_at >= NOW() - INTERVAL '15 days')
WHERE is_active = true
${productId ? 'AND id = $1' : ''}
`, productId ? [productId] : []);

console.log(`Badges actualizados ${productId ? `para producto ${productId}` : 'para todos los productos'}`);
} catch (error) {
console.error('Error actualizando badges:', error);
} finally {
if (client) client.release();
}
}

router.get('/products', async (req, res) => {
let client;
try {
// Primero actualizamos los badges
await updateProductBadges();

client = await pool.connect();
const result = await client.query(`
SELECT * FROM products 
WHERE is_active = true 
ORDER BY 
-- Orden de prioridad de badges
CASE 
WHEN is_new = true THEN 1
WHEN is_offer = true THEN 2
WHEN is_best_seller = true THEN 3
WHEN is_featured = true THEN 4
ELSE 5
END,
-- Orden secundario por fecha de creación (más recientes primero)
created_at DESC
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

router.get('/settings', async (req, res) => {
let client;
try {
client = await pool.connect();
const result = await client.query('SELECT * FROM settings WHERE id = 1');

if (result.rows.length === 0) {
const insertResult = await client.query(
`INSERT INTO settings (id, logo_data, theme_color) 
VALUES (1, '', '#e44d26')
RETURNING *`
);
return res.json(insertResult.rows[0]);
}
res.json(result.rows[0]);
} catch (error) {
console.error('Error al obtener configuración:', error);
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

// Verificar si ya votó
const existingVotes = await client.query(
'SELECT * FROM votes WHERE product_id = $1 AND device_id = $2',
[productId, deviceId]
);

if (existingVotes.rows.length > 0) {
await client.query('ROLLBACK');
return res.status(400).json({ error: 'Ya has votado por este producto' });
}

// Registrar voto
await client.query(
'INSERT INTO votes (product_id, device_id, type) VALUES ($1, $2, $3)',
[productId, deviceId, type]
);

// Actualizar contadores de likes/dislikes
const columnToUpdate = type === 'like' ? 'likes' : 'dislikes';
await client.query(
`UPDATE products SET ${columnToUpdate} = ${columnToUpdate} + 1 WHERE id = $1`,
[productId]
);

await client.query('COMMIT');

// Actualizar badges del producto después del voto
await updateProductBadges(productId);

res.json({ success: true, message: `Voto registrado (${type})` });
} catch (error) {
if (client) await client.query('ROLLBACK');
console.error('Error al registrar voto:', error);
res.status(500).json({ error: 'Error interno del servidor' });
} finally {
if (client) client.release();
}
});

// Endpoint para forzar actualización de badges (útil para mantenimiento)
router.post('/update-badges', async (req, res) => {
try {
await updateProductBadges();
res.json({ success: true, message: 'Badges actualizados correctamente' });
} catch (error) {
console.error('Error actualizando badges:', error);
res.status(500).json({ error: 'Error interno del servidor' });
}
});

router.post('/register-device', async (req, res) => {
const { device_id, user_agent } = req.body;
let client;
try {
client = await pool.connect();

const existingDevice = await client.query(
'SELECT * FROM devices WHERE device_id = $1',
[device_id]
);

if (existingDevice.rows.length > 0) {
await client.query(
'UPDATE devices SET last_seen = NOW() WHERE device_id = $1',
[device_id]
);
} else {
await client.query(
'INSERT INTO devices (device_id, user_agent) VALUES ($1, $2)',
[device_id, user_agent || '']
);
}

res.json({ success: true, message: 'Dispositivo registrado' });
} catch (error) {
console.error('Error al registrar dispositivo:', error);
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

res.json({ success: true, message: 'Notificación marcada como leída' });
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