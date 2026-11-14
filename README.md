# universal-scrapper (espejo público)

El desarrollo activo del ecosistema de scraping de alimentos para supermercados en Colombia vive en el monorepo privado **[Foodhy/scrapper-ecosystem](https://github.com/Foodhy/scrapper-ecosystem)**.

Ese repo incluye:

- `extension-click/` con registry de cadenas (`config/sites.js`), adaptador retail y batch runner
- `scrapers/` (Selenium) y checklist por categorías de alimento
- Proxies y política ética (`packages/transport`, `docs/ETHICAL-SCRAPING.md`)

Esta copia en `main` conserva solo la extensión base (picker universal) **sin** presets Colombia ni runners automatizados. Para trabajar en precios, ofertas y categorías diarias, clona o abre **scrapper-ecosystem**.

La rama `cursor/playstore-reviews-poc-e4bb` sigue siendo un PoC aparte de reseñas Play Store (patrón de proxy reutilizado en scrapper-ecosystem).

## Instalación rápida (solo extensión local)

1. Cargar la carpeta `extension-click/` en `chrome://extensions` (Developer mode → Load unpacked).
2. Ver `extension-click/README.md` para modos de extracción manual.