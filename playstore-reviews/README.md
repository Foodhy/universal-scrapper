# Reseñas de Google Play

Prueba de concepto para bajar reseñas públicas de cualquier app de Google Play y dejarlas en un Excel. La configuración de ejemplo apunta a **SoyRappi - Gana plata** (`com.rappi.storekeeper`) en Colombia, teléfono y tablet, solo 1 y 2 estrellas.

El listado de reseñas no viene en el HTML de la ficha. Play lo pide por un endpoint público (`batchexecute`, RPC `oCPfdb`), el mismo que usa la web al filtrar por estrellas y por dispositivo. Este módulo tiene dos formas de llamarlo:

| Estrategia | Qué hace |
|---|---|
| `library` | Usa [`google-play-scraper`](https://github.com/JoMingyu/google-play-scraper). |
| `batchexecute` | Arma el POST directo con `requests`. Aquí se rota el proxy, el User-Agent y las pausas. |
| `auto` | Prueba `library` y, si no devuelve filas o falla, usa `batchexecute`. Es el valor por defecto. |

País e idioma salen de `gl` y `hl` (en el enlace de ejemplo, `hl=es_CO` es idioma `es` y país `co`). El filtro de estrellas y el de dispositivo van en el mismo request, así que 1 estrella en teléfono y 1 estrella en tablet son consultas distintas.

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

## Corrida de prueba

Con el `config.yaml` de este folder (20 reseñas como máximo por cada par dispositivo + estrellas):

```bash
python -m playstore_reviews --config config.yaml
```

El Excel queda en `playstore-reviews/output/reviews-com.rappi.storekeeper-co-<fecha>.xlsx`.

Hojas:

- **resenas**: usuario, comentario, estrellas, fecha UTC, dispositivo, país, versión, votos de “útil”, respuesta del desarrollador y enlace de la reseña.
- **resumen**: qué se pidió y cuántas filas devolvió cada consulta. Si una falla, el error queda ahí y el resto sigue.

Para una pasada más chica mientras pruebas la red:

```bash
python -m playstore_reviews --config config.yaml --limit 5 --strategy batchexecute
```

## Qué se cambia después, sin tocar código

Todo vive en `config.yaml` o en flags:

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
| `per_query_limit` | Tope por cada combinación. Súbelo cuando quieras la corrida grande. |
| `strategy` | `auto`, `library` o `batchexecute`. |
| `delay_seconds`, `jitter_seconds` | Pausa entre consultas. |
| `proxies` | Lista de URLs `http://user:pass@host:puerto`. |

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

Los tests cubren el parseo del enlace, el YAML de ejemplo y el armado del payload. No llaman a Play Store.
