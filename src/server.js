require('dotenv').config();

const app = require('./app');
const { initializeDatabase, pool } = require('./db');

const port = Number.parseInt(process.env.PORT || '3000', 10);

async function start() {
  if (process.env.NODE_ENV === 'production' && !process.env.API_KEY) {
    throw new Error('API_KEY es obligatoria en producción. Configúrala en el entorno del servicio.');
  }

  await initializeDatabase();
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`API de videojuegos lista en el puerto ${port}`);
  });

  async function shutdown(signal) {
    console.log(`Recibida señal ${signal}; cerrando servidor y conexiones...`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  }

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch(async (error) => {
  console.error('No se pudo iniciar la API:', error.message);
  await pool.end();
  process.exit(1);
});
