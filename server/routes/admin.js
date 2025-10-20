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

router.put('/settings', async (req, res) => {
const { logo_data, theme_color } = req.body;
let client;

try {
client = await pool.connect();

const updateFields = ['theme_color = $1'];
const values = [theme_color || '#e44d26'];

if (logo_data && logo_data.startsWith('data:image')) {
updateFields.push('logo_data = $2');
values.push(logo_data);
}

values.push(1);

const query = `
UPDATE settings 
SET ${updateFields.join(', ')}
WHERE id = $${values.length}
RETURNING *
`;

const result = await client.query(query, values);

if (result.rows.length === 0) {
const insertResult = await client.query(
`INSERT INTO settings (id, logo_data, theme_color) 
VALUES (1, $1, $2)
RETURNING *`,
[logo_data || '', theme_color || '#e44d26']
);
return res.json(insertResult.rows[0]);
}

res.json(result.rows[0]);
} catch (error) {
console.error('Error al actualizar configuración:', error);
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

export default router;