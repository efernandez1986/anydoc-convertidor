'use strict';

const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const anydoc = require('@firecrawl/anydoc');

let mainWindow = null;

// ---------------------------------------------------------------------------
// Ventana principal
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 820,
    minHeight: 560,
    backgroundColor: '#0f1117',
    title: 'anydoc Convertidor',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------------------
// Ajustes persistentes (API key + OCR)
// ---------------------------------------------------------------------------
function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return { apiKey: '', ocrEnabled: false };
  }
}

function saveSettings(settings) {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Mensajes de error en español
// ---------------------------------------------------------------------------
const ERROR_MESSAGES = {
  unsupported: 'Formato no soportado o no identificable.',
  needsOcr: 'El PDF contiene páginas escaneadas (solo imagen). Activa «OCR en la nube» en Ajustes, o usa un PDF con texto seleccionable.',
  malformed: 'El archivo está dañado o no contiene contenido extraíble.',
  encrypted: 'El archivo está encriptado o protegido con contraseña.',
  resourceLimit: 'El archivo supera los límites de seguridad (descompresión o anidamiento excesivo).',
  missingPart: 'Falta una parte necesaria dentro del archivo.',
  io: 'No se pudo leer el archivo en el disco.',
  hosted: 'El OCR en la nube (Firecrawl Parse) no pudo convertir el documento. Revisa tu API key y la conexión a internet.'
};

function describeError(error) {
  const code = error && error.code ? String(error.code) : '';
  const base = ERROR_MESSAGES[code] || 'Ocurrió un error inesperado durante la conversión.';
  const detail = error && error.message ? ` Detalle: ${error.message}` : '';
  return { code, message: base + detail };
}

// ---------------------------------------------------------------------------
// Serialización del modelo a JSON limpio (bytes -> base64)
// ---------------------------------------------------------------------------
function serializeDocument(doc) {
  return JSON.stringify(doc, (_key, value) => {
    if (value instanceof Uint8Array) {
      return { __type: 'bytes', base64: Buffer.from(value).toString('base64') };
    }
    return value;
  }, 2);
}

// ---------------------------------------------------------------------------
// Conversión
// ---------------------------------------------------------------------------
async function convertFile(filePath, options) {
  const bytes = fs.readFileSync(filePath);
  // Detección por contenido primero; la extensión es el respaldo (CSV sin firma).
  const format = anydoc.formatFromBytes(bytes) || anydoc.formatFromPath(filePath) || null;

  const ocrOpts = {};
  if (options && options.ocrEnabled) {
    ocrOpts.ocr = 'hosted';
    if (options.apiKey) ocrOpts.apiKey = options.apiKey;
  }
  const hasOcr = Object.keys(ocrOpts).length > 0;

  // Markdown desde la ruta.
  const markdown = await anydoc.toMarkdown(filePath, hasOcr ? ocrOpts : undefined);

  // Modelo de documento (no disponible para PDF: se convierte a Markdown directo).
  let document = null;
  let documentNote = null;
  if (format === 'pdf') {
    documentNote = 'Los PDF se convierten a Markdown directamente y no exponen el modelo de documento estructurado.';
  } else {
    try {
      // Para CSV (sin firma) hay que indicar el formato explícitamente.
      document = await anydoc.toDocument(bytes, format || undefined);
    } catch (err) {
      documentNote = describeError(err).message;
    }
  }

  const filename = path.basename(filePath);
  const fileSize = bytes.length;

  const jsonPayload = {
    filename,
    format,
    fileSize,
    markdown,
    document: document !== null ? JSON.parse(serializeDocument(document)) : null,
    documentNote
  };

  return {
    filename,
    format,
    fileSize,
    markdown,
    json: JSON.stringify(jsonPayload, null, 2)
  };
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecciona un documento',
    properties: ['openFile'],
    filters: [
      {
        name: 'Documentos compatibles',
        extensions: [
          'doc', 'docx', 'docm',
          'ppt', 'pps', 'pot', 'pptx', 'pptm', 'ppsx', 'ppsm',
          'xls', 'xlsx', 'xlsm', 'xlsb',
          'odt', 'ods', 'odp',
          'rtf', 'epub', 'csv', 'pdf'
        ]
      },
      { name: 'Todos los archivos', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }
  return { canceled: false, filePath: result.filePaths[0] };
});

ipcMain.handle('convert', async (_event, filePath, options) => {
  try {
    const result = await convertFile(filePath, options);
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, ...describeError(error) };
  }
});

ipcMain.handle('dialog:saveFile', async (_event, payload) => {
  const { defaultName, content, isJson } = payload;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Guardar resultado',
    defaultPath: defaultName,
    filters: isJson
      ? [{ name: 'JSON', extensions: ['json'] }]
      : [{ name: 'Markdown', extensions: ['md'] }]
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  try {
    fs.writeFileSync(result.filePath, content, 'utf8');
    return { canceled: false, filePath: result.filePath };
  } catch (error) {
    return { canceled: false, error: error.message };
  }
});

ipcMain.handle('settings:load', () => loadSettings());
ipcMain.handle('settings:save', (_event, settings) => saveSettings(settings));

ipcMain.handle('clipboard:write', (_event, text) => {
  clipboard.writeText(String(text ?? ''));
  return true;
});
