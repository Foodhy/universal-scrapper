# Reseñas de Google Play

Exporta reseñas públicas de cualquier app de Google Play a Excel. La ficha de ejemplo es **SoyRappi - Gana plata** (`com.rappi.storekeeper`) en Colombia, teléfono y tablet, solo 1 y 2 estrellas.

Lo que ya corre es la base. La ficha, el ritmo y el histórico están separados para poder endurecer la corrida cambiando YAML, no el código.

El listado de reseñas no viene en el HTML de la ficha. Play lo pide por un endpoint público (`batchexecute`, RPC `oCPfdb`), el mismo que usa la web al filtrar por estrellas y por dispositivo. Este módulo tiene dos formas de llamarlo:

| Estrategia | Qué hace |
|---|---|
| `library` | Usa [`google-play-scraper`](https://github.com/JoMingyu/google-play-scraper). |
| `batchexecute` | Arma el POST directo con `requests`. Aquí se rota el proxy, el User-Agent y las pausas. |
| `auto` | Prueba `library` y, si no devuelve filas o falla, usa `batchexecute`. Es el valor por defecto. |

País e idioma salen de `gl` y `hl` (en el enlace de ejemplo, `hl=es_CO` es idioma `es` y país `co`). El filtro de estrellas y el de dispositivo van en el mismo request, así que 1 estrella en teléfono y 1 estrella en tablet son consultas distintas.

## Comandos

Desde `playstore-reviews`, con el entorno activo:

```bash
python -m playstore_reviews --config config.yaml --dry-run
python -m playstore_reviews --config config.yaml
python -m playstore_reviews --config profiles/rappi-co-full.yaml
python -m playstore_reviews.server
python -m playstore_reviews.classify --threshold 0.8
python -m pytest -q
```

Lo mismo, si tienes `make`: `make dry-run`, `make scrape`, `make scrape-full`, `make panel`, `make classify`, `make test`.

El panel abre en http://127.0.0.1:8765 y solo escucha en tu máquina. Ahí se elige la ficha, los países, el dispositivo, las estrellas y el límite; se corre y se detiene. La clasificación usa Jev (`typesafe/jev-1.13`) por la Decisions API de OpenRouter. La clave va en `OPENROUTER_API_KEY` y el panel no la pide. Cada comentario es una llamada con las 8 preguntas; cada respuesta es la probabilidad de sí. El umbral inicial es 80% y se puede mover sin volver a llamar. El JSON completo queda en `output/latest-classification.json` y el Excel de probabilidades en `output/clasificacion-*.xlsx`.

## Setup

Hace falta Python 3.11+.

```bash
cd playstore-reviews
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

En Windows el activate es `.venv\Scripts\activate`.

## Qué archivo se toca

| Archivo | Para qué |
|---|---|
| `profiles/rappi-co.yaml` | La ficha: app, país, idioma, dispositivos, estrellas, orden. Otra app es otro archivo en `profiles/`. |
| `config.yaml` | La corrida corta. Apunta a ese perfil y fija límite 20, pausas y el orden de estrategias. |
| `profiles/rappi-co-full.yaml` | La misma ficha con límite 2000 y pausa más larga. Es la corrida de histórico, no el default. |
| `.env` | `PLAYSTORE_PROXIES`. Pisa la lista del YAML. |

`config.yaml` parte el trabajo en dos bloques:

- `transport`: estrategia, orden de respaldo, límite, tamaño de página, pausa, jitter, reintentos, backoff, timeout y proxies.
- `output`: carpeta, si escribe el manifiesto JSON y el nivel de log.

`strategy: auto` recorre `strategy_order` y se queda con la primera vía que devuelva filas. Hoy el orden es `library` y después `batchexecute`. Una tercera vía se agrega en `playstore_reviews/strategies/` y se registra en `NAMED_STRATEGIES`.

## Corrida de prueba

```bash
python -m playstore_reviews --config config.yaml --dry-run
python -m playstore_reviews --config config.yaml
```

El Excel queda en `playstore-reviews/output/reviews-com.rappi.storekeeper-co-<fecha>.xlsx`. Al lado queda un `.json` con el plan y el conteo por consulta, sin las URLs de los proxies. El log va a `output/playstore-reviews.log`.

Hojas:

- **resenas**: usuario, comentario, estrellas, fecha UTC, dispositivo, país, versión, votos de “útil”, respuesta del desarrollador y enlace de la reseña.
- **resumen**: qué se pidió y cuántas filas devolvió cada consulta. Si una falla, el error queda ahí y el resto sigue.

Para una pasada más chica mientras pruebas la red:

```bash
python -m playstore_reviews --config config.yaml --limit 5 --strategy batchexecute
```

## Corrida larga

Cuando quieras el histórico de esta misma ficha, sin cambiar el código:

```bash
python -m playstore_reviews --config profiles/rappi-co-full.yaml --dry-run
python -m playstore_reviews --config profiles/rappi-co-full.yaml
```

Ese perfil pide hasta 2000 reseñas por cada par dispositivo + estrellas, de a 150, con 2 segundos más jitter entre consultas y 5 reintentos. Sigue siendo teléfono y tablet, 1 y 2 estrellas, Colombia.

## Qué se cambia sin tocar código

Flags que pisan el YAML:

```bash
python -m playstore_reviews \
  --app-url "https://play.google.com/store/apps/details?id=com.rappi.storekeeper&hl=es_CO" \
  --devices phone,tablet \
  --scores 1,2 \
  --sort newest \
  --limit 200 \
  --strategy auto
```

| Campo | Valores |
|---|---|
| `app_id` / `app_url` | Id de paquete o el enlace de la ficha. `hl=es_CO` rellena idioma y país si no los fijas aparte. |
| `lang`, `country` | `es` y `co` para esta ficha. Otro país es otro `gl`. |
| `devices` | `phone` (Teléfono), `tablet` (Tablet). También `chromebook` y `tv`. |
| `scores` | `1` a `5`. Esta prueba usa `1` y `2`. |
| `sort` | `newest`, `relevant`, `rating`. |
| `per_query_limit` | Tope por cada combinación. 20 en la prueba, 2000 en el perfil full. |
| `strategy` / `strategy_order` | `auto`, `library` o `batchexecute`. En `auto`, el orden es la lista de respaldo. |
| `delay_seconds`, `jitter_seconds`, `max_retries`, `retry_backoff_seconds` | Ritmo y reintentos. |
| `proxies` | Lista de URLs `http://user:pass@host:puerto`. El manifiesto solo guarda cuántos había. |

Los proxies del entorno pisan los del YAML:

```bash
PLAYSTORE_PROXIES="http://user:pass@host:8080,http://host2:8080" \
  python -m playstore_reviews --config config.yaml --strategy batchexecute
```

Cada request de `batchexecute` toma el siguiente proxy de la lista. `library` usa el primero que le toque en esa consulta, porque la librería lee `HTTPS_PROXY` del proceso.

## Ritmo

Play responde 429 o `PlayGatewayError` si se le pega muy seguido. Este PoC:

- hace una consulta a la vez, no en paralelo;
- espera `delay_seconds` más un jitter aleatorio entre páginas y entre filtros;
- reintenta con espera creciente ante 429, 5xx y error de gateway;
- manda un User-Agent de navegador y `Accept-Language` acorde al país.

Eso es lo que conviene dejar fijo. Un proxy sirve para salir por otra IP o por el país de la ficha cuando la red local se queda corta. No hace falta un navegador escondido para esta prueba: el filtro de estrellas y de dispositivo ya viaja en el request público.

Cuando quieras el histórico, sube `per_query_limit` (por ejemplo 2000) y mantén la pausa. Cuatro consultas (teléfono/tablet × 1/2 estrellas) con un límite alto tardan más, a propósito.

## Tests

```bash
cd playstore-reviews
source .venv/bin/activate
python -m pytest
```

Los tests cubren perfiles, el plan, el deduplicado, la parada de una corrida, los 8 problemas, el filtro por fecha y que el panel responde. No llaman a Play Store ni a Jev.
