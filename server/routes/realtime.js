import express from 'express';
import pool from '../config/database.js';

const router = express.Router();

const clients = new Map();
let clientIdCounter = 0;

// Función mejorada para enviar eventos
export function sendToAllClients(event, data) {
const message = `data: ${JSON.stringify({ event, data })}\n\n`;

const clientsToRemove = [];

clients.forEach((client, id) => {
try {
// Verificar si la conexión todavía es válida
if (client.res.writableEnded || client.res.destroyed) {
clientsToRemove.push(id);
return;
}

client.res.write(message);
} catch (error) {
console.error(`Error enviando mensaje SSE al cliente ${id}:`, error.message);
clientsToRemove.push(id);
}
});

// Limpiar clientes muertos
clientsToRemove.forEach(id => {
clients.delete(id);
console.log(`Cliente ${id} removido por error de escritura`);
});
}

// SSE endpoint con mejor manejo de errores
router.get('/events', (req, res) => {
const clientId = ++clientIdCounter;

// Configurar headers SSE
res.writeHead(200, {
'Content-Type': 'text/event-stream',
'Cache-Control': 'no-cache, no-transform',
'Connection': 'keep-alive',
'Access-Control-Allow-Origin': '*',
'Access-Control-Allow-Headers': 'Cache-Control',
'X-Accel-Buffering': 'no' // Importante para Nginx
});

// Flushear headers inmediatamente
res.flushHeaders();

const client = {
id: clientId,
res,
ip: req.ip || req.connection.remoteAddress
};

clients.set(clientId, client);
console.log(`Cliente SSE conectado [${clientId}]. Total: ${clients.size}`);

// Enviar evento de conexión inicial
try {
res.write(`data: ${JSON.stringify({ event: 'connected', data: { clientId } })}\n\n`);
} catch (error) {
console.error(`Error enviando conexión inicial al cliente ${clientId}:`, error.message);
clients.delete(clientId);
return;
}

// Heartbeat para mantener la conexión activa
const heartbeatInterval = setInterval(() => {
try {
if (!res.writableEnded && !res.destroyed) {
res.write(': heartbeat\n\n');
} else {
clearInterval(heartbeatInterval);
clients.delete(clientId);
}
} catch (error) {
clearInterval(heartbeatInterval);
clients.delete(clientId);
console.log(`Heartbeat falló para cliente ${clientId}`);
}
}, 15000); // Cada 15 segundos

// Manejar cierre limpio
req.on('close', () => {
clearInterval(heartbeatInterval);
clients.delete(clientId);
console.log(`Cliente SSE desconectado [${clientId}]. Total: ${clients.size}`);
});

// Manejar errores
req.on('error', (error) => {
clearInterval(heartbeatInterval);
clients.delete(clientId);
console.log(`Error de conexión cliente ${clientId}:`, error.message);
});

res.on('error', (error) => {
clearInterval(heartbeatInterval);
clients.delete(clientId);
console.log(`Error de respuesta cliente ${clientId}:`, error.message);
});

// Manejar tiempo de inactividad del socket
req.socket.setTimeout(0); // Deshabilitar timeout del socket
req.socket.setKeepAlive(true);
});

// Endpoint para verificar estado
router.get('/status', (req, res) => {
const clientInfo = Array.from(clients.values()).map(client => ({
id: client.id,
ip: client.ip,
connected: !client.res.writableEnded && !client.res.destroyed
}));

res.json({
totalClients: clients.size,
activeClients: clientInfo.filter(client => client.connected).length,
clients: clientInfo,
status: 'active'
});
});

// Limpiar clientes muertos periódicamente
setInterval(() => {
const clientsToRemove = [];

clients.forEach((client, id) => {
if (client.res.writableEnded || client.res.destroyed) {
clientsToRemove.push(id);
}
});

clientsToRemove.forEach(id => {
clients.delete(id);
});

if (clientsToRemove.length > 0) {
console.log(`Limpieza automática: ${clientsToRemove.length} clientes removidos`);
}
}, 30000); // Cada 30 segundos

export default router;