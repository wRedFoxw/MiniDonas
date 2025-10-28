import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
throw new Error('DATABASE_URL no está definida en las variables de entorno');
}

const poolConfig = {
connectionString,
ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
max: 20,
idleTimeoutMillis: 30000,
connectionTimeoutMillis: 30000,
maxUses: 7500,
// Configuraciones adicionales para mejorar estabilidad
keepAlive: true,
keepAliveInitialDelayMillis: 10000,
};

const pool = new Pool(poolConfig);

// Manejo mejorado de errores
pool.on('error', (err) => {
console.error('Error inesperado en el pool de conexiones:', err);
console.error('Stack trace:', err.stack);
});

pool.on('connect', () => {
console.log('Nueva conexión establecida con la base de datos');
});

pool.on('remove', () => {
console.log('Conexión removida del pool');
});

// Función mejorada de test de conexión con reintentos
export async function testConnection(retries = 3, delay = 1000) {
let client;
for (let attempt = 1; attempt <= retries; attempt++) {
try {
client = await pool.connect();
const result = await client.query('SELECT NOW() as current_time');
console.log('Conexión a PostgreSQL exitosa');
return true;
} catch (error) {
console.error(`Intento ${attempt} de ${retries}: Error de conexión a la base de datos:`, error.message);

if (attempt === retries) {
return false;
}

// Esperar antes del siguiente intento
await new Promise(resolve => setTimeout(resolve, delay * attempt));
} finally {
if (client) client.release();
}
}
return false;
}

// Middleware para manejar conexiones en rutas
export function withConnection(handler) {
return async (req, res, next) => {
let client;
try {
client = await pool.connect();
req.dbClient = client;
await handler(req, res, next);
} catch (error) {
next(error);
} finally {
if (client) client.release();
}
};
}

export default pool;