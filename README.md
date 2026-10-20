# API de videojuegos

API REST en Node.js, Express y PostgreSQL. La API corre localmente y PostgreSQL corre en Docker con un volumen persistente. `render.yaml` configura la versión desplegada en Render con PostgreSQL administrado.

## Requisitos

- Node.js 22 o posterior.
- Docker Desktop y Docker Compose.

## Ejecutar en local

1. Copia `.env.example` a `.env` (en PowerShell: `Copy-Item .env.example .env`).
2. Inicia PostgreSQL: `docker compose up -d postgres`.
3. Instala dependencias si hace falta: `npm ci`.
4. Arranca la API: `npm run dev` o `npm start`.
5. Revisa `http://localhost:3000/healthz`; debe responder `{"status":"ok","database":"connected"}`.

Docker usa la imagen `postgres:16-alpine` y guarda los datos en el volumen nombrado `videojuegos_pgdata`. Los registros iniciales se crean al iniciar la base por primera vez. La API también crea la tabla y agrega los registros de ejemplo si la base está vacía. Para borrar intencionalmente el volumen y todos los datos locales: `docker compose down -v`.

## Endpoints

Las rutas de `/api` requieren `Authorization: Bearer <API_KEY>`. En local, el token de `.env.example` es `local-demo-token`; cámbialo antes de usarlo fuera de esta demostración. `/healthz` no requiere token.

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/videojuegos` | Lista los videojuegos |
| GET | `/api/videojuegos/:id` | Consulta un videojuego |
| POST | `/api/videojuegos` | Crea un videojuego |
| PUT | `/api/videojuegos/:id` | Reemplaza todos sus datos |
| PATCH | `/api/videojuegos/:id` | Actualiza uno o más campos |
| DELETE | `/api/videojuegos/:id` | Elimina un videojuego |

Cada registro contiene `id`, `titulo`, `genero`, `plataforma`, `desarrollador`, `anio_lanzamiento` y `created_at`. La respuesta individual se parece al endpoint de ejemplo:

```json
{
  "data": {
    "id": "1",
    "titulo": "The Legend of Zelda: Breath of the Wild",
    "genero": "Acción y aventura",
    "plataforma": "Nintendo Switch",
    "desarrollador": "Nintendo",
    "anio_lanzamiento": 2017,
    "created_at": "2026-10-20T12:30:26.474Z"
  }
}
```

Consulta local:

```sh
curl -H "Authorization: Bearer local-demo-token" http://localhost:3000/api/videojuegos/1
```

Crear un videojuego:

```sh
curl -X POST http://localhost:3000/api/videojuegos \
  -H "Authorization: Bearer local-demo-token" \
  -H "Content-Type: application/json" \
  -d '{"titulo":"Hades","genero":"Roguelike","plataforma":"PC y Nintendo Switch","desarrollador":"Supergiant Games","anio_lanzamiento":2020}'
```

## Conectar desde n8n

Cuando la API esté desplegada, crea una credencial **Header Auth** en n8n:

- **Name:** `Authorization`
- **Value:** `Bearer <API_KEY configurada en Render>`

En un nodo **HTTP Request**, selecciona esa credencial y configura:

- **Method:** `GET`
- **URL:** `https://<servicio>.onrender.com/api/videojuegos/1`
- **Authentication:** `Generic Credential Type` → `Header Auth`

Para crear registros, usa `POST /api/videojuegos` y envía un cuerpo JSON con los cinco campos. En n8n puede usarse **Body Content Type: JSON**.

## Desplegar en Render

El archivo `render.yaml` define un servicio web Node.js y una base Render PostgreSQL, y enlaza `DATABASE_URL` sin copiar contraseñas al repositorio. El Blueprint solicita `API_KEY`; genera un token aleatorio en Render y guarda el mismo valor en la credencial Header Auth de n8n.

1. Sube este proyecto a un repositorio de GitHub.
2. En Render, crea un **Blueprint** y conecta ese repositorio.
3. Confirma la creación del servicio `api-videojuegos` y la base `api-videojuegos-db`; completa el valor secreto de `API_KEY` cuando Render lo solicite.
4. Tras el despliegue, comprueba `/healthz` y luego `/api/videojuegos/1` con el encabezado Bearer.

Render ofrece planes gratuitos para probar, pero sus bases PostgreSQL gratuitas expiran a los 30 días. Para conservar datos, usa una base con plan de pago. Los servicios web gratuitos pueden suspenderse cuando están inactivos.

## Credenciales y Git

`.env` está excluido de Git; solo `.env.example`, sin secretos, se sube al repositorio. No pegues contraseñas de PostgreSQL ni tokens de Render o GitHub en el código o en `render.yaml`.
