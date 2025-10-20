import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
throw new Error('DATABASE_URL no está definida en las variables de entorno');
}

const pool = new Pool({
connectionString,
ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
max: 20,
idleTimeoutMillis: 30000,
connectionTimeoutMillis: 20000,
maxUses: 7500,
});

// Manejo mejorado de errores
pool.on('error', (err) => {
console.error('Error inesperado en el pool de conexiones:', err);
});

pool.on('connect', () => {
console.log('Nueva conexión establecida con la base de datos');
});

pool.on('remove', () => {
console.log('Conexión removida del pool');
});

export async function testConnection() {
let client;
try {
client = await pool.connect();
// Consulta simple para verificar conexión
const result = await client.query('SELECT 1 as test');
console.log('Conexión a PostgreSQL exitosa');
return true;
} catch (error) {
console.error('Error de conexión a la base de datos:', error.message);
return false;
} finally {
if (client) client.release();
}
}

export default pool;