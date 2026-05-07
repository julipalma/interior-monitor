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

En `STATE_DIR` (por defecto `.state`) se guardan:

- `seen-urls.json`: URLs ya notificadas.
- `health-state.json`: rachas de fallas por fuente.

Si limpias ese directorio, el monitor vuelve a considerar todas las URLs como nuevas.

## Variables de entorno principales

### Flujo general

- `SLACK_WEBHOOK_URL`: webhook de novedades (un mensaje por ejecución si hay notas).
- `INTERIOR_MONITOR_LOG_DIR`: carpeta de logs diarios (default `logs/` en el cwd).
- `FETCH_CONCURRENCY`: concurrencia de fetch HTML (default `3`).
- `MAX_DEEP_INSPECT`: maximo de URLs a inspeccionar en deteccion profunda (default `400`).
- `GROUPED_TXT_PATH`: salida TXT agrupada (default `salida-notas.txt`).
- `STATE_DIR`: directorio de estado (default `.state`).

### Semantica / scoring

- `SEMANTIC_DISABLE=1`: desactiva el uso de CSV de frecuencia.
- `TAGS_CSV_PATH`: ruta de CSV (default `data/frecuencia_tags_unificado.csv`).
- `SEMANTIC_MIN_SIMILARITY`
- `SEMANTIC_TOP_MATCHES`
- `SEMANTIC_GENERIC_MULTIPLIER`
- `SEMANTIC_GENERIC_TAGS`
- `SEMANTIC_REQUIRE_MATCH` (default activo)
- `SEMANTIC_MIN_INTEREST_SCORE` (default `1.2`)
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

- **Un** mensaje de Slack con notas nuevas (agrupadas por medio, solo URLs), solo si hay notas que pasan filtros.
- Archivo TXT agrupado por medio en `GROUPED_TXT_PATH`.
- Archivos `logs/interior-monitor-YYYY-MM-DD.log`: errores por URL/fase y bloque de salud de fuentes; se borran archivos de más de 30 días.
- Logs de consola con:
  - cantidad de URLs recolectadas
  - cantidad de coincidencias por fuente
  - resumen de salud en una línea (`severity`, `shouldNotify`; el detalle está en el archivo .log)

## Ejecucion en GitHub Actions

Hay un workflow en `.github/workflows/monitor.yml` que:

- corre cada 30 minutos y manualmente (`workflow_dispatch`)
- usa Node 22
- ejecuta `npm ci` y `npm run start`
- cachea `.state`

Secret esperado:

- `SLACK_WEBHOOK_URL`

## Estructura rapida

- `src/index.ts`: orquestacion principal.
- `src/config/sources.ts`: fuentes monitoreadas y reglas de deteccion.
- `src/sitemap/`: parseo/recoleccion desde sitemap.
- `src/section/`: logica de deteccion por nota.
- `src/article/`: enriquecimiento por HTML (titulo/texto/tags).
- `src/semantic/`: runtime lexical/hybrid.
- `src/monitoring/health.ts`: calculo de salud y severidad.
- `src/state.ts`: persistencia de estado.
- `src/report/groupedTxt.ts`: render de salida TXT.

