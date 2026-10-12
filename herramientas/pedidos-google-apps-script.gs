/**
 * @OnlyCurrentDoc  El script solo puede acceder a esta hoja, no a tus otros archivos.
 */
/* =====================================================================
   OBSIDIAN — pedidos y referidos en Google Sheets (Google Apps Script)

   La tienda envía aquí cada pedido y el panel (panel.html) los lee.
   - Pestaña "Pedidos": un pedido por fila (incluye el código de referido).
   - Pestaña "Referidos": tus afiliados (código, nombre, celular, % de comisión).

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
const COLUMNAS = ['numero', 'fecha', 'estado', 'nombre', 'celular', 'ciudad', 'direccion', 'barrio', 'notas', 'productos', 'pares', 'subtotal', 'detalle', 'nota_interna', 'origen', 'referido', 'comision_pagada'];
const HOJA_REF = 'Referidos';
const COLUMNAS_REF = ['codigo', 'nombre', 'celular', 'comision', 'creado', 'activo'];
const ESTADOS = ['Nuevo', 'Confirmado', 'Enviado', 'Entregado', 'Cancelado'];
const PROP_CLAVE = 'CLAVE_PANEL';

/* ---------- menú en la hoja ---------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('OBSIDIAN')
    .addItem('Definir clave del panel', 'definirClave')
    .addToUi();
  hoja_();
  hojaRef_();
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

/* ---------- hojas ---------- */
/* Crea la pestaña si no existe y agrega al final las columnas que falten */
function pestana_(nombre, columnas) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nombre);
  if (!sh) sh = ss.insertSheet(nombre);
  if (sh.getLastRow() === 0) {
    sh.appendRow(columnas);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, columnas.length).setFontWeight('bold');
    return sh;
  }
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const faltan = columnas.filter(c => head.indexOf(c) < 0);
  if (faltan.length) {
    sh.getRange(1, head.length + 1, 1, faltan.length).setValues([faltan]).setFontWeight('bold');
  }
  return sh;
}
function hoja_() { return pestana_(HOJA, COLUMNAS); }
function hojaRef_() { return pestana_(HOJA_REF, COLUMNAS_REF); }
function encabezado_(sh) { return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String); }

/* Agrega una fila usando los nombres de columna (no importa el orden en la hoja) */
function agregar_(sh, obj) {
  const head = encabezado_(sh);
  sh.appendRow(head.map(h => (obj[h] === undefined ? '' : obj[h])));
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* Limpia textos y evita que alguien escriba fórmulas en tu hoja */
function txt_(v, max) {
  const s = String(v == null ? '' : v).slice(0, max || 300).trim();
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function codigo_(v) {
  const s = String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_-]/g, '').slice(0, 30);
  return s.length >= 2 ? s : '';
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
  hoja_();
  hojaRef_();
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
  if (body.accion === 'guardarReferido') return guardarReferido_(body);
  if (body.accion === 'pagarComisiones') return pagarComisiones_(body);
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
    agregar_(sh, {
      numero: numero, fecha: new Date(), estado: 'Nuevo',
      nombre: txt_(p.nombre, 80), celular: txt_(p.celular, 20), ciudad: txt_(p.ciudad, 60), direccion: txt_(p.direccion, 160),
      barrio: txt_(p.barrio, 80), notas: txt_(p.notas, 300),
      productos: txt_(limpios.map(i => `${i.cantidad} × ${i.marca} ${i.nombre} (T${i.talla})`).join(' | '), 1000),
      pares: limpios.reduce((a, i) => a + i.cantidad, 0),
      subtotal: limpios.reduce((a, i) => a + i.precio * i.cantidad, 0),
      detalle: JSON.stringify(limpios), nota_interna: '', origen: txt_(p.origen, 60),
      referido: codigo_(p.ref), comision_pagada: '',
    });
    return json_({ ok: true, numero: numero });
  } finally {
    lock.releaseLock();
  }
}

function filas_(sh) {
  const rows = sh.getDataRange().getValues();
  const head = rows.shift().map(String);
  return rows.map(r => { const o = {}; head.forEach((h, i) => { o[h] = r[i]; }); return o; });
}

function listar_() {
  const pedidos = filas_(hoja_()).filter(o => o.numero).map(o => {
    o.fecha = o.fecha instanceof Date ? o.fecha.toISOString() : String(o.fecha);
    o.comision_pagada = o.comision_pagada instanceof Date ? o.comision_pagada.toISOString() : String(o.comision_pagada || '');
    try { o.detalle = JSON.parse(o.detalle || '[]'); } catch (err) { o.detalle = []; }
    return o;
  }).reverse();
  const referidos = filas_(hojaRef_()).filter(o => o.codigo).map(o => {
    o.creado = o.creado instanceof Date ? o.creado.toISOString() : String(o.creado);
    o.comision = Number(o.comision) || 0;
    o.activo = String(o.activo) !== 'No';
    return o;
  });
  return json_({ ok: true, pedidos: pedidos, referidos: referidos });
}

function buscarFila_(sh, columna, valor) {
  const head = encabezado_(sh);
  const col = head.indexOf(columna) + 1;
  const total = sh.getLastRow() - 1;
  if (!col || total < 1) return 0;
  const vals = sh.getRange(2, col, total, 1).getValues().map(r => String(r[0]));
  const i = vals.indexOf(String(valor));
  return i < 0 ? 0 : i + 2;
}
function poner_(sh, fila, columna, valor) {
  const col = encabezado_(sh).indexOf(columna) + 1;
  if (col) sh.getRange(fila, col).setValue(valor);
}

function actualizar_(body) {
  const sh = hoja_();
  const fila = buscarFila_(sh, 'numero', body.numero);
  if (!fila) return json_({ ok: false, error: 'no_existe' });
  if (body.estado && ESTADOS.indexOf(body.estado) >= 0) poner_(sh, fila, 'estado', body.estado);
  if (typeof body.nota === 'string') poner_(sh, fila, 'nota_interna', txt_(body.nota, 500));
  if (typeof body.referido === 'string') poner_(sh, fila, 'referido', codigo_(body.referido));
  return json_({ ok: true });
}

function guardarReferido_(body) {
  const r = body.referido || {};
  const codigo = codigo_(r.codigo);
  if (!codigo) return json_({ ok: false, error: 'codigo' });
  const sh = hojaRef_();
  const datos = {
    codigo: codigo, nombre: txt_(r.nombre, 80), celular: txt_(r.celular, 20),
    comision: Math.min(90, Math.max(0, Number(r.comision) || 0)), activo: r.activo === false ? 'No' : 'Sí',
  };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const fila = buscarFila_(sh, 'codigo', codigo);
    if (fila) {
      if (r.nuevo) return json_({ ok: false, error: 'codigo_existe' });
      ['nombre', 'celular', 'comision', 'activo'].forEach(k => poner_(sh, fila, k, datos[k]));
    } else {
      datos.creado = new Date();
      agregar_(sh, datos);
    }
    return json_({ ok: true, codigo: codigo });
  } finally {
    lock.releaseLock();
  }
}

/* Marca como pagadas las comisiones de los pedidos entregados de un referido */
function pagarComisiones_(body) {
  const codigo = codigo_(body.codigo);
  if (!codigo) return json_({ ok: false, error: 'codigo' });
  const sh = hoja_();
  const head = encabezado_(sh);
  const cRef = head.indexOf('referido'), cEst = head.indexOf('estado'), cPag = head.indexOf('comision_pagada');
  const total = sh.getLastRow() - 1;
  if (total < 1 || cRef < 0 || cPag < 0) return json_({ ok: true, pagados: 0 });
  const vals = sh.getRange(2, 1, total, head.length).getValues();
  const ahora = new Date();
  let n = 0;
  vals.forEach((r, i) => {
    if (String(r[cRef]) === codigo && r[cEst] === 'Entregado' && !r[cPag]) { sh.getRange(i + 2, cPag + 1).setValue(ahora); n++; }
  });
  return json_({ ok: true, pagados: n });
}
