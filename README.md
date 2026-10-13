# anydoc Convertidor

Aplicación de escritorio (Electron) para convertir documentos de oficina a **Markdown** y **JSON**.

Convierte: Word (`.doc`, `.docx`, `.docm`), PowerPoint (`.ppt`, `.pptx`, …), Excel (`.xls`, `.xlsx`, …), OpenDocument (`.odt`, `.ods`, `.odp`), RTF, EPUB, CSV y PDF.

> **¿Vas a usarlo, no a programarlo?** Lee la [Guía de uso para el equipo](GUIA-EQUIPO.md).

## Qué hace

- Carga un documento con el botón o arrastrándolo y soltándolo.
- Muestra el resultado en dos pestañas: **Markdown** (vista previa + código) y **JSON**.
- Permite **descargar** el resultado como `.md` y `.json`, y **copiarlo** al portapapeles.
- El JSON incluye: `filename`, `format`, `fileSize`, `markdown` y el **modelo estructurado completo** de anydoc (bloques, tablas, notas al pie, activos/archivos incrustados con sus bytes en base64).
- **OCR opcional en la nube** (Firecrawl Parse) para PDFs escaneados, con campo para API key (se guarda localmente).

## Requisitos

- Windows 10/11 (x64).
- Node.js ≥ 20 (solo para desarrollo/ejecución desde código).

## Ejecutar desde código

```bash
npm install
npm start
```

## Generar el instalador .exe

```bash
npm run dist
```

El instalador se genera en `dist/` (archivo `anydoc-convertidor-setup-<versión>.exe`).

## Estructura

```
main.js            → proceso principal (conversión, diálogos, guardado)
preload.js         → puente seguro de IPC (contextBridge)
renderer/
  index.html       → interfaz
  styles.css       → estilos
  renderer.js      → lógica de la interfaz y vista previa de Markdown
```

## Notas

- La conversión es 100 % local (sin conexión) excepto cuando activas **OCR en la nube**, en cuyo caso solo el PDF que lo necesita se envía a Firecrawl Parse.
- Los PDF se convierten a Markdown directamente y **no** exponen modelo de documento; en ese caso el JSON lleva `document: null` con una nota explicativa.
