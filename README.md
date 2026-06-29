# Interior Monitor

Monitor de medios que revisa sitemaps, detecta notas de secciones policiales/seguridad, evita duplicados, enriquece resultados con senales semanticas y notifica por Slack.

## Que hace

- Recorre fuentes configuradas en `src/config/sources.ts`.
- Descarga y parsea sitemaps para obtener URLs candidatas.
- Filtra por reglas de deteccion (`url_path`, `url_suffix`, `news_keywords`, `html_badge`, `json_ld_article_section`).
- Evita duplicados con estado persistente (`seen-urls.json`).
- Enriquece notas con scoring semantico (lexical o hybrid).
- Genera salida agrupada en TXT.
- Envia **un solo** mensaje de Slack con novedades (por medio y lista de URLs). Errores y salud operativa van a archivos `logs/interior-monitor-YYYY-MM-DD.log` (retención 30 días).

## Requisitos

- Node.js `>=20` (recomendado: 22).
- npm.

## Instalacion

```bash
npm ci
```

## Configuracion inicial

```bash
cp .env.example .env
```

Configura como minimo:

- `SLACK_WEBHOOK_URL`

Opcional recomendado:

- `STATE_DIR` (default: `.state`)
- `GROUPED_TXT_PATH` (default: `salida-notas.txt`)

## Uso local

```bash
npm run start
```

Si no hay `SLACK_WEBHOOK_URL`, el monitor imprime una vista previa del mensaje en consola.

## Scripts

- `npm run start`: ejecuta el monitor.
- `npm run typecheck`: corre chequeo de tipos.

## Estado persistente

En `STATE_DIR` (por defecto `.state` en local) se guardan:

- `seen-urls.json`: URLs ya notificadas.
- `health-state.json`: rachas de fallas por fuente.

Si limpias ese directorio, el monitor vuelve a considerar todas las URLs como nuevas.

**GitHub Actions** usa `STATE_DIR=monitor-state`: esa carpeta está en el repo y, al terminar cada corrida exitosa, el workflow hace commit y push de los JSON actualizados (`[skip ci]`). Así el estado **no depende de la caché de Actions** y las notas no se repiten entre corridas. En local seguís usando `.state` salvo que definas `STATE_DIR`.

Si migrás desde un setup anterior y querés conservar el historial de vistas, copiá tu `seen-urls.json` local sobre `monitor-state/seen-urls.json` antes del primer run en CI.

## Variables de entorno principales

### Flujo general

- `SLACK_WEBHOOK_URL`: webhook de novedades (un mensaje por ejecución si hay notas).
- `INTERIOR_MONITOR_LOG_DIR`: carpeta de logs diarios (default `logs/` en el cwd).
- `FETCH_CONCURRENCY`: concurrencia de fetch HTML (default `3`).
- `INTERIOR_MONITOR_USER_AGENT` / `INTERIOR_MONITOR_ACCEPT_LANGUAGE`: cabeceras HTTP opcionales (por defecto UA tipo Chrome y `es-AR`).
- `INTERIOR_MONITOR_FETCH_RETRY`: si no es `0`, ante HTTP 403 o 429 se reintenta una vez tras una pausa (por defecto activo).
- `HTTPS_PROXY` / `HTTP_PROXY`: proxy opcional; en GitHub Actions configurar como secrets si el medio bloquea la IP del runner.
- `MAX_DEEP_INSPECT`: maximo de URLs a inspeccionar en deteccion profunda (default `400`).
- `GROUPED_TXT_PATH`: salida TXT agrupada (default `salida-notas.txt`).
- `JSON_FEED_PATH`: ruta del feed JSON (default `public/notas.json`). Se actualiza en cada corrida acumulando notas de los últimos 7 días, ordenadas de más nueva a más vieja.
- `JSON_FEED_MAX_SCORE`: score semántico máximo para normalizar `relevancia` (default `25`). Divide `semantic.score` por este valor y lo acota a 1.0.
- `STATE_DIR`: directorio de estado (default `.state`; en CI del repo es `monitor-state`).

### Semantica / scoring

- `SEMANTIC_DISABLE=1`: desactiva el uso de CSV de frecuencia.
- `TAGS_CSV_PATH`: ruta de CSV (default `data/frecuencia_tags_unificado.csv`).
- `SEMANTIC_MIN_SIMILARITY`
- `SEMANTIC_TOP_MATCHES`
- `SEMANTIC_GENERIC_MULTIPLIER`
- `SEMANTIC_GENERIC_TAGS`
- `SEMANTIC_REQUIRE_MATCH` (default activo)
- `SEMANTIC_MIN_INTEREST_SCORE` (default `4.0`; es la suma del top-5 de scores, no el máximo)
- `SEMANTIC_ONLY_SIM_ONE=1` (solo deja pasar notas con algun tag sim=1.00)

### Modo hybrid (OpenAI)

- `SEMANTIC_MODE=hybrid`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL` (default `https://api.openai.com/v1`)
- `SEMANTIC_EMBEDDING_MODEL`
- `SEMANTIC_LLM_MODEL`
- `SEMANTIC_EMBED_TOP_K`
- `SEMANTIC_EMBED_MIN_SIMILARITY`

Si activas hybrid sin `OPENAI_API_KEY`, cae automaticamente a modo lexical.

### Salud de fuentes (health)

Los umbrales controlan la severidad registrada en el archivo de log (no se envía a Slack).

- `HEALTH_STREAK_THRESHOLD` (default `3`)
- Warning:
  - `HEALTH_WARN_FAILED_PERCENT` (default `15`)
  - `HEALTH_WARN_403_PER_DOMAIN` (default `2`)
  - `HEALTH_WARN_STREAK` (default `2`)
- Critical:
  - `HEALTH_CRIT_FAILED_PERCENT` (default `30`)
  - `HEALTH_CRIT_403_PER_DOMAIN` (default `5`)
  - `HEALTH_CRIT_STREAK` (default `4`)

## Configurar fuentes

Edita `src/config/sources.ts`. Cada fuente define:

- `id`, `name`, `baseUrl`, `sitemapUrl`
- `detection` con tipo y parametros de match

## Salidas

- **Un** mensaje de Slack con notas nuevas (por medio: título, fecha, URL y Temas), solo si hay notas que pasan filtros.
- Archivo TXT agrupado por medio en `GROUPED_TXT_PATH`.
- Archivos `logs/interior-monitor-YYYY-MM-DD.log`: errores por URL/fase y bloque de salud de fuentes; se borran archivos de más de 30 días.
- Logs de consola con:
  - cantidad de URLs recolectadas
  - cantidad de coincidencias por fuente
  - resumen de salud en una línea (`severity`, `shouldNotify`; el detalle está en el archivo .log)

## Ejecucion en GitHub Actions

Hay un workflow en `.github/workflows/monitor.yml` que:

- corre cada 10 minutos (cron con zona `America/Argentina/Buenos_Aires`) y manualmente (`workflow_dispatch`)
- usa una sola corrida activa por rama (`concurrency`) para no pisar el estado
- usa Node 22
- ejecuta `npm ci` y `npm run start` con `STATE_DIR=monitor-state`
- confirma `monitor-state/*.json` en el repo al terminar (fuentes de verdad para URLs vistas)

Si **no aparecen corridas por `schedule`**: el workflow tiene que vivir en la **rama por defecto**. En la lista de Actions, probá el filtro por **evento** (mostrar `schedule`, no solo disparos manuales). Revisá **Settings → Actions → General** (Actions permitidas) y los **minutos** del plan en repos privados. GitHub admite **demoras** en horas punta. Si el workflow estuvo desactivado, un cambio en el cron puede volver a registrar el schedule.

Secrets esperados:

- `SLACK_WEBHOOK_URL`
- Opcional: `HTTPS_PROXY` / `HTTP_PROXY` si algún medio devuelve 403 desde la IP de Actions.

## Estructura rapida

- `src/index.ts`: orquestacion principal.
- `src/config/sources.ts`: fuentes monitoreadas y reglas de deteccion.
- `src/sitemap/`: parseo/recoleccion desde sitemap.
- `src/section/`: logica de deteccion por nota.
- `src/article/`: enriquecimiento por HTML (titulo/texto/tags).
- `src/semantic/`: runtime lexical/hybrid.
- `src/monitoring/health.ts`: calculo de salud y severidad.
- `src/state.ts`: persistencia de estado.
- `monitor-state/`: estado versionado para GitHub Actions (`seen-urls.json`, `health-state.json`).
- `src/report/groupedTxt.ts`: render de salida TXT.

