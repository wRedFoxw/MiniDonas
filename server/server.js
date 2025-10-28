import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import clientRoutes from './routes/client.js';
import adminRoutes from './routes/admin.js';
import realtimeRoutes from './routes/realtime.js';
import { testConnection } from './config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3333;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/client', express.static(path.join(__dirname, '../client')));
app.use('/admin', express.static(path.join(__dirname, '../admin')));

app.use('/api/client', clientRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/realtime', realtimeRoutes);

app.get('/', (req, res) => {
res.redirect('/client');
});

app.get('/client', (req, res) => {
res.sendFile(path.join(__dirname, '../client/index.html'));
});

app.get('/admin', (req, res) => {
res.sendFile(path.join(__dirname, '../admin/index.html'));
});

// Health check mejorado
app.get('/health', async (req, res) => {
try {
const dbStatus = await testConnection();
res.json({
status: 'OK',
database: dbStatus ? 'Connected' : 'Disconnected',
timestamp: new Date().toISOString()
});
} catch (error) {
res.status(500).json({
status: 'Error',
error: error.message,
timestamp: new Date().toISOString()
});
}
});

app.use((err, req, res, next) => {
console.error('Error global:', err.stack);
res.status(500).json({ 
error: 'Algo salió mal!',
details: process.env.NODE_ENV === 'development' ? err.message : undefined
});
});

app.use((req, res) => {
res.status(404).json({ error: 'Ruta no encontrada' });
});

// Función de inicio mejorada
async function startServer() {
try {
console.log('Iniciando servidor...');

// Probar conexión a la base de datos antes de iniciar
console.log('Probando conexión a la base de datos...');
const dbConnected = await testConnection(3, 2000);

if (!dbConnected) {
console.warn('Advertencia: No se pudo establecer conexión con la base de datos');
console.warn('El servidor se iniciará pero algunas funciones pueden no estar disponibles');
}

app.listen(PORT, () => {
console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
console.log(`Base de datos: ${dbConnected ? 'Conectada' : 'Desconectada'}`);
});

} catch (error) {
console.error('Error al iniciar el servidor:', error);
process.exit(1);
}
}

// Manejo de cierre graceful
process.on('SIGTERM', () => {
console.log('Recibido SIGTERM, cerrando servidor...');
process.exit(0);
});

process.on('SIGINT', () => {
console.log('Recibido SIGINT, cerrando servidor...');
process.exit(0);
});

process.on('uncaughtException', (error) => {
console.error('Excepción no capturada:', error);
process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
console.error('Promesa rechazada no manejada:', reason);
process.exit(1);
});

// Iniciar servidor
startServer();