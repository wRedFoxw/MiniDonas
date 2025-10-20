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
console.error(err.stack);
res.status(500).json({ error: 'Algo salió mal!' });
});

app.use((req, res) => {
res.status(404).json({ error: 'Ruta no encontrada' });
});

app.listen(PORT, async () => {
console.log(`Servidor ejecutándose en http://localhost:${PORT}`);

try {
await testConnection();
} catch (error) {
console.log('Advertencia: No se pudo conectar a la base de datos');
}
});