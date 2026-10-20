const crypto = require('node:crypto');
const express = require('express');
const { pool } = require('./db');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

const fields = ['titulo', 'genero', 'plataforma', 'desarrollador', 'anio_lanzamiento'];
const selectColumns = 'id, titulo, genero, plataforma, desarrollador, anio_lanzamiento, created_at';

function requireApiKey(req, res, next) {
  const expected = process.env.API_KEY;
  if (!expected) return next();

  const authorization = req.get('authorization') || '';
  const supplied = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!supplied) {
    return res.status(401).json({ error: 'Se requiere Authorization: Bearer <API_KEY>.' });
  }

  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (
    expectedBuffer.length !== suppliedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)
  ) {
    return res.status(401).json({ error: 'Credencial inválida.' });
  }
  return next();
}

app.get('/', (req, res) => {
  return res.json({
    nombre: 'API de videojuegos',
    version: '1.0.0',
    endpoints: {
      salud: 'GET /healthz',
      listar: 'GET /api/videojuegos',
      consultar: 'GET /api/videojuegos/:id',
      crear: 'POST /api/videojuegos',
      reemplazar: 'PUT /api/videojuegos/:id',
      actualizar: 'PATCH /api/videojuegos/:id',
      eliminar: 'DELETE /api/videojuegos/:id',
    },
    autenticacion: 'Authorization: Bearer <API_KEY>',
  });
});

app.get('/healthz', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    return res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

app.use('/api', requireApiKey);

app.get('/api/videojuegos', async (req, res) => {
  const result = await pool.query(`SELECT ${selectColumns} FROM videojuegos ORDER BY id ASC`);
  return res.json({ data: result.rows });
});

app.get('/api/videojuegos/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return invalidId(res);

  const result = await pool.query(
    `SELECT ${selectColumns} FROM videojuegos WHERE id = $1`,
    [id],
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'No se encontró el videojuego solicitado.' });
  }
  return res.json({ data: result.rows[0] });
});

app.post('/api/videojuegos', async (req, res) => {
  const videojuego = validateVideojuego(req.body);
  if (!videojuego.ok) return res.status(400).json({ error: videojuego.error });

  const result = await pool.query(
    `INSERT INTO videojuegos (${fields.join(', ')})
     VALUES ($1, $2, $3, $4, $5) RETURNING ${selectColumns}`,
    fields.map((field) => videojuego.value[field]),
  );
  return res.status(201).json({ data: result.rows[0] });
});

app.put('/api/videojuegos/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return invalidId(res);

  const videojuego = validateVideojuego(req.body);
  if (!videojuego.ok) return res.status(400).json({ error: videojuego.error });

  const result = await pool.query(
    `UPDATE videojuegos
     SET titulo = $1, genero = $2, plataforma = $3, desarrollador = $4, anio_lanzamiento = $5
     WHERE id = $6 RETURNING ${selectColumns}`,
    [...fields.map((field) => videojuego.value[field]), id],
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'No se encontró el videojuego solicitado.' });
  }
  return res.json({ data: result.rows[0] });
});

app.patch('/api/videojuegos/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return invalidId(res);

  const current = await pool.query(
    `SELECT ${selectColumns} FROM videojuegos WHERE id = $1`,
    [id],
  );
  if (current.rowCount === 0) {
    return res.status(404).json({ error: 'No se encontró el videojuego solicitado.' });
  }

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'El cuerpo debe ser un objeto JSON.' });
  }
  const unknownFields = Object.keys(body).filter((field) => !fields.includes(field));
  if (unknownFields.length > 0) {
    return res.status(400).json({ error: `Campo(s) no permitido(s): ${unknownFields.join(', ')}.` });
  }
  if (Object.keys(body).length === 0) {
    return res.status(400).json({ error: 'Incluye al menos un campo para actualizar.' });
  }

  const videojuego = validateVideojuego({ ...current.rows[0], ...body });
  if (!videojuego.ok) return res.status(400).json({ error: videojuego.error });

  const result = await pool.query(
    `UPDATE videojuegos
     SET titulo = $1, genero = $2, plataforma = $3, desarrollador = $4, anio_lanzamiento = $5
     WHERE id = $6 RETURNING ${selectColumns}`,
    [...fields.map((field) => videojuego.value[field]), id],
  );
  return res.json({ data: result.rows[0] });
});

app.delete('/api/videojuegos/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return invalidId(res);

  const result = await pool.query('DELETE FROM videojuegos WHERE id = $1 RETURNING id', [id]);
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'No se encontró el videojuego solicitado.' });
  }
  return res.status(204).end();
});

app.use('/api', (req, res) => {
  return res.status(404).json({ error: 'Ruta de API no encontrada.' });
});

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'El cuerpo de la solicitud debe ser JSON válido.' });
  }
  console.error('Error no controlado en la API:', error.message);
  return res.status(500).json({ error: 'Ocurrió un error interno.' });
});

function parseId(rawId) {
  if (!/^\d+$/.test(rawId)) return null;
  const id = BigInt(rawId);
  return id > 0n && id <= 9223372036854775807n ? rawId : null;
}

function invalidId(res) {
  return res.status(400).json({ error: 'El id debe ser un entero positivo válido.' });
}

function validateVideojuego(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'El cuerpo debe ser un objeto JSON.' };
  }

  const videojuego = {};
  const limits = { titulo: 150, genero: 80, plataforma: 100, desarrollador: 120 };
  for (const [field, maxLength] of Object.entries(limits)) {
    if (typeof value[field] !== 'string') {
      return { ok: false, error: `El campo ${field} es obligatorio y debe ser texto.` };
    }
    videojuego[field] = value[field].trim();
    if (!videojuego[field] || videojuego[field].length > maxLength) {
      return { ok: false, error: `El campo ${field} debe tener entre 1 y ${maxLength} caracteres.` };
    }
  }

  const year = value.anio_lanzamiento;
  if (!Number.isInteger(year) || year < 1950 || year > 2100) {
    return { ok: false, error: 'El campo anio_lanzamiento debe ser un entero entre 1950 y 2100.' };
  }
  videojuego.anio_lanzamiento = year;
  return { ok: true, value: videojuego };
}

module.exports = app;
