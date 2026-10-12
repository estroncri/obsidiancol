/* =====================================================================
   OBSIDIAN — sistema de pedidos en Google Sheets (Google Apps Script)

   La tienda envía aquí cada pedido y el panel (panel.html) los lee.
   Los pedidos quedan en la pestaña "Pedidos" de esta hoja de cálculo.

   CLAVE DEL PANEL: en la hoja, menú  OBSIDIAN → Definir clave del panel.
   (Se guarda en las propiedades del script, no en este código.)

   INSTALACIÓN DESDE CERO:
   1. Crea una hoja en sheets.new. Menú Extensiones → Apps Script.
   2. Borra lo que haya, pega TODO este archivo y guarda.
   3. Implementar → Nueva implementación → Aplicación web.
      Ejecutar como: "Yo". Quién tiene acceso: "Cualquier usuario". Implementar y autorizar.
   4. Copia la URL de la aplicación web (termina en /exec) en js/config.js → pedidosApi.
   5. Recarga la hoja y define tu clave en el menú OBSIDIAN.

   Si cambias este código: Implementar → Administrar implementaciones → editar (lápiz)
   → Versión: "Nueva versión" → Implementar. La URL no cambia.
   ===================================================================== */

const HOJA = 'Pedidos';
const COLUMNAS = ['numero', 'fecha', 'estado', 'nombre', 'celular', 'ciudad', 'direccion', 'barrio', 'notas', 'productos', 'pares', 'subtotal', 'detalle', 'nota_interna', 'origen'];
const ESTADOS = ['Nuevo', 'Confirmado', 'Enviado', 'Entregado', 'Cancelado'];
const PROP_CLAVE = 'CLAVE_PANEL';

/* ---------- menú en la hoja ---------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('OBSIDIAN')
    .addItem('Definir clave del panel', 'definirClave')
    .addToUi();
  hoja_();
}

function definirClave() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Clave del panel', 'Escribe la clave para entrar a obsidiancol.shop/panel.html (mínimo 6 caracteres).', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const v = r.getResponseText().trim();
  if (v.length < 6) { ui.alert('La clave debe tener al menos 6 caracteres.'); return; }
  PropertiesService.getScriptProperties().setProperty(PROP_CLAVE, v);
  ui.alert('Listo. Ya puedes entrar al panel con esa clave.');
}

/* ---------- utilidades ---------- */
function hoja_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(HOJA);
  if (!sh) sh = ss.insertSheet(HOJA);
  if (sh.getLastRow() === 0) {
    sh.appendRow(COLUMNAS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, COLUMNAS.length).setFontWeight('bold');
  }
  return sh;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* Limpia textos y evita que alguien escriba fórmulas en tu hoja */
function txt_(v, max) {
  const s = String(v == null ? '' : v).slice(0, max || 300).trim();
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/* Revisa la clave y bloquea 10 minutos tras muchos intentos fallidos */
function autorizar_(clave) {
  const guardada = PropertiesService.getScriptProperties().getProperty(PROP_CLAVE);
  if (!guardada) return 'sin_clave';
  const cache = CacheService.getScriptCache();
  const fallos = Number(cache.get('fallos') || 0);
  if (fallos >= 25) return 'bloqueado';
  if (!clave || String(clave) !== guardada) { cache.put('fallos', String(fallos + 1), 600); return 'clave'; }
  return '';
}

/* ---------- web ---------- */
function doGet() {
  return json_({ ok: true, servicio: 'OBSIDIAN pedidos' });
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ ok: false, error: 'formato' }); }
  if (body.accion === 'crear') return crear_(body);
  const error = autorizar_(body.clave);
  if (error) return json_({ ok: false, error: error });
  if (body.accion === 'listar') return listar_();
  if (body.accion === 'actualizar') return actualizar_(body);
  return json_({ ok: false, error: 'accion' });
}

function crear_(body) {
  if (body.website) return json_({ ok: true, numero: '' }); // campo trampa contra bots
  const p = body.pedido || {};
  const items = Array.isArray(p.items) ? p.items.slice(0, 30) : [];
  if (!p.nombre || !p.celular || !items.length) return json_({ ok: false, error: 'datos' });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = hoja_();
    const props = PropertiesService.getScriptProperties();
    const n = Number(props.getProperty('ULTIMO') || 1000) + 1;
    props.setProperty('ULTIMO', String(n));
    const numero = 'OB-' + n;

    const limpios = items.map(i => ({
      id: txt_(i.id, 40), slug: txt_(i.slug, 80), marca: txt_(i.marca, 40), nombre: txt_(i.nombre, 80), color: txt_(i.color, 60),
      talla: Number(i.talla) || 0, cantidad: Math.min(10, Math.max(1, Number(i.cantidad) || 1)), precio: Math.max(0, Number(i.precio) || 0),
    }));
    const resumen = limpios.map(i => `${i.cantidad} × ${i.marca} ${i.nombre} (T${i.talla})`).join(' | ');
    const pares = limpios.reduce((a, i) => a + i.cantidad, 0);
    const subtotal = limpios.reduce((a, i) => a + i.precio * i.cantidad, 0);

    sh.appendRow([numero, new Date(), 'Nuevo', txt_(p.nombre, 80), txt_(p.celular, 20), txt_(p.ciudad, 60), txt_(p.direccion, 160),
      txt_(p.barrio, 80), txt_(p.notas, 300), txt_(resumen, 1000), pares, subtotal, JSON.stringify(limpios), '', txt_(p.origen, 60)]);
    return json_({ ok: true, numero: numero });
  } finally {
    lock.releaseLock();
  }
}

function listar_() {
  const sh = hoja_();
  const rows = sh.getDataRange().getValues();
  const head = rows.shift();
  const pedidos = rows.filter(r => r[0]).map(r => {
    const o = {};
    head.forEach((h, i) => { o[h] = r[i]; });
    o.fecha = o.fecha instanceof Date ? o.fecha.toISOString() : String(o.fecha);
    try { o.detalle = JSON.parse(o.detalle || '[]'); } catch (err) { o.detalle = []; }
    return o;
  }).reverse();
  return json_({ ok: true, pedidos: pedidos });
}

function actualizar_(body) {
  const sh = hoja_();
  const total = sh.getLastRow() - 1;
  if (total < 1) return json_({ ok: false, error: 'no_existe' });
  const nums = sh.getRange(2, 1, total, 1).getValues().map(r => String(r[0]));
  const i = nums.indexOf(String(body.numero));
  if (i < 0) return json_({ ok: false, error: 'no_existe' });
  const fila = i + 2;
  if (body.estado && ESTADOS.indexOf(body.estado) >= 0) sh.getRange(fila, COLUMNAS.indexOf('estado') + 1).setValue(body.estado);
  if (typeof body.nota === 'string') sh.getRange(fila, COLUMNAS.indexOf('nota_interna') + 1).setValue(txt_(body.nota, 500));
  return json_({ ok: true });
}
