/**
 * @OnlyCurrentDoc  El script solo puede acceder a esta hoja, no a tus otros archivos.
 */
/* =====================================================================
   OBSIDIAN — pedidos, vendedores y costos en Google Sheets (Apps Script)

   Pestañas que crea y usa:
   - "Pedidos": un pedido por fila, con vendedor y ganancias.
   - "Vendedores": tus trabajadores (código, nombre, celular, PIN).
   - "Costos": por modelo, lo que te cuesta y a cuánto se lo das al vendedor.
   - "PreciosVendedores": el precio de venta que puso cada vendedor.

   CLAVE DEL PANEL: en la hoja, menú  OBSIDIAN → Definir clave del panel.

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
const COLUMNAS = ['numero', 'fecha', 'estado', 'nombre', 'celular', 'ciudad', 'direccion', 'barrio', 'notas', 'productos', 'pares', 'subtotal', 'detalle', 'nota_interna', 'origen', 'referido', 'comision_pagada', 'ganancia_vendedor', 'mi_ganancia'];
const HOJA_VEND = 'Vendedores';
const COLUMNAS_VEND = ['codigo', 'nombre', 'celular', 'pin', 'creado', 'activo'];
const HOJA_COSTOS = 'Costos';
const COLUMNAS_COSTOS = ['producto', 'nombre', 'costo', 'precio_vendedor'];
const HOJA_PRECIOS = 'PreciosVendedores';
const COLUMNAS_PRECIOS = ['codigo', 'producto', 'precio', 'actualizado'];
const SEMILLA_COSTOS = [['af1-white', 'Nike Air Force 1 Triple White', 90000, 100000]];
const ESTADOS = ['Nuevo', 'Confirmado', 'Enviado', 'Entregado', 'Cancelado'];
const PROP_CLAVE = 'CLAVE_PANEL';

/* ---------- menú en la hoja ---------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('OBSIDIAN')
    .addItem('Definir clave del panel', 'definirClave')
    .addToUi();
  todas_();
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
  const head = encabezado_(sh);
  const faltan = columnas.filter(c => head.indexOf(c) < 0);
  if (faltan.length) sh.getRange(1, head.length + 1, 1, faltan.length).setValues([faltan]).setFontWeight('bold');
  return sh;
}
function hoja_() { return pestana_(HOJA, COLUMNAS); }
function hojaVend_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const vieja = ss.getSheetByName('Referidos');
  if (vieja && !ss.getSheetByName(HOJA_VEND)) vieja.setName(HOJA_VEND);
  return pestana_(HOJA_VEND, COLUMNAS_VEND);
}
function hojaCostos_() {
  const nueva = !SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_COSTOS);
  const sh = pestana_(HOJA_COSTOS, COLUMNAS_COSTOS);
  if (nueva) SEMILLA_COSTOS.forEach(r => sh.appendRow(r));
  return sh;
}
function hojaPrecios_() { return pestana_(HOJA_PRECIOS, COLUMNAS_PRECIOS); }
function todas_() { hoja_(); hojaVend_(); hojaCostos_(); hojaPrecios_(); }

function encabezado_(sh) { return sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String); }
function agregar_(sh, obj) { sh.appendRow(encabezado_(sh).map(h => (obj[h] === undefined ? '' : obj[h]))); }
function filas_(sh) {
  if (sh.getLastRow() < 2) return [];
  const rows = sh.getDataRange().getValues();
  const head = rows.shift().map(String);
  return rows.map(r => { const o = {}; head.forEach((h, i) => { o[h] = r[i]; }); return o; });
}
function buscarFila_(sh, criterios) {
  const head = encabezado_(sh);
  const total = sh.getLastRow() - 1;
  if (total < 1) return 0;
  const vals = sh.getRange(2, 1, total, head.length).getValues();
  const idx = Object.keys(criterios).map(k => [head.indexOf(k), String(criterios[k])]);
  for (let i = 0; i < vals.length; i++) if (idx.every(([c, v]) => c >= 0 && String(vals[i][c]) === v)) return i + 2;
  return 0;
}
function poner_(sh, fila, columna, valor) {
  const col = encabezado_(sh).indexOf(columna) + 1;
  if (col) sh.getRange(fila, col).setValue(valor);
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function txt_(v, max) {
  const s = String(v == null ? '' : v).slice(0, max || 300).trim();
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function codigo_(v) {
  const s = String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_-]/g, '').slice(0, 30);
  return s.length >= 2 ? s : '';
}
function num_(v) { const n = Number(v); return isFinite(n) && n > 0 ? Math.round(n) : 0; }
function iso_(v) { return v instanceof Date ? v.toISOString() : String(v || ''); }

/* costos: { producto: { costo, base } } */
function costos_() {
  const m = {};
  filas_(hojaCostos_()).forEach(r => { if (r.producto) m[String(r.producto)] = { costo: num_(r.costo), base: num_(r.precio_vendedor), nombre: String(r.nombre || '') }; });
  return m;
}
function vendedor_(codigo) {
  const c = codigo_(codigo); if (!c) return null;
  const r = filas_(hojaVend_()).find(v => String(v.codigo) === c);
  return r ? { codigo: c, nombre: String(r.nombre || ''), celular: String(r.celular || ''), pin: String(r.pin || ''), activo: String(r.activo) !== 'No' } : null;
}
/* precios de venta válidos de un vendedor (nunca por debajo de lo que le cuesta) */
function preciosDe_(codigo, costos) {
  const m = {};
  filas_(hojaPrecios_()).forEach(r => {
    if (String(r.codigo) !== codigo) return;
    const id = String(r.producto), p = num_(r.precio), base = costos[id] ? costos[id].base : 0;
    if (p && base && p >= base) m[id] = p;
  });
  return m;
}

/* Ganancias de un pedido. Usa el costo y el precio de vendedor guardados al crearlo;
   si en ese momento no estaban en la tabla, toma los de hoy. */
function ganancias_(p, costos) {
  const ref = String(p.referido || '');
  let gv = 0, mia = 0, completa = true;
  (Array.isArray(p.detalle) ? p.detalle : []).forEach(i => {
    const c = costos[i.id] || {};
    const base = Number(i.base) || c.base || 0, costo = Number(i.costo) || c.costo || 0;
    const cant = Number(i.cantidad) || 1, precio = Number(i.precio) || 0;
    if (ref && base) gv += Math.max(0, precio - base) * cant;
    if (costo) mia += ((ref && base ? base : precio) - costo) * cant; else completa = false;
  });
  return { vendedor: gv, mia: completa ? mia : null };
}

/* ---------- seguridad ---------- */
function autorizar_(clave) {
  const guardada = PropertiesService.getScriptProperties().getProperty(PROP_CLAVE);
  if (!guardada) return 'sin_clave';
  const cache = CacheService.getScriptCache();
  const fallos = Number(cache.get('fallos') || 0);
  if (fallos >= 25) return 'bloqueado';
  if (!clave || String(clave) !== guardada) { cache.put('fallos', String(fallos + 1), 600); return 'clave'; }
  return '';
}
function autorizarVendedor_(codigo, pin) {
  const c = codigo_(codigo);
  const cache = CacheService.getScriptCache(), k = 'fv_' + c;
  const fallos = Number(cache.get(k) || 0);
  if (fallos >= 10) return { error: 'bloqueado' };
  const v = vendedor_(c);
  if (!v || !v.pin || String(pin || '') !== v.pin) { cache.put(k, String(fallos + 1), 900); return { error: 'acceso' }; }
  if (!v.activo) return { error: 'inactivo' };
  return { v: v };
}

/* ---------- web ---------- */
function doGet() {
  todas_();
  return json_({ ok: true, servicio: 'OBSIDIAN pedidos' });
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ ok: false, error: 'formato' }); }
  // públicas
  if (body.accion === 'crear') return crear_(body);
  if (body.accion === 'preciosRef') return preciosRef_(body);
  // vendedores (código + PIN)
  if (body.accion === 'vendedorEntrar' || body.accion === 'vendedorPrecios') {
    const a = autorizarVendedor_(body.codigo, body.pin);
    if (a.error) return json_({ ok: false, error: a.error });
    return body.accion === 'vendedorEntrar' ? vendedorEntrar_(a.v) : vendedorPrecios_(a.v, body);
  }
  // dueño (clave del panel)
  const error = autorizar_(body.clave);
  if (error) return json_({ ok: false, error: error });
  if (body.accion === 'listar') return listar_();
  if (body.accion === 'actualizar') return actualizar_(body);
  if (body.accion === 'guardarVendedor') return guardarVendedor_(body);
  if (body.accion === 'pagarVendedor') return pagarVendedor_(body);
  if (body.accion === 'guardarCostos') return guardarCostos_(body);
  return json_({ ok: false, error: 'accion' });
}

/* precios que ve el cliente cuando llega con ?ref= */
function preciosRef_(body) {
  const c = codigo_(body.ref);
  if (!c) return json_({ ok: true, precios: {} });
  const cache = CacheService.getScriptCache(), k = 'pr_' + c;
  const guardado = cache.get(k);
  if (guardado) return json_({ ok: true, precios: JSON.parse(guardado) });
  const v = vendedor_(c);
  const precios = v && v.activo ? preciosDe_(v.codigo, costos_()) : {};
  cache.put(k, JSON.stringify(precios), 300);
  return json_({ ok: true, precios: precios });
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
    const costos = costos_();
    const v = vendedor_(p.ref);
    const ref = v && v.activo ? v.codigo : codigo_(p.ref);
    const props = PropertiesService.getScriptProperties();
    const n = Number(props.getProperty('ULTIMO') || 1000) + 1;
    props.setProperty('ULTIMO', String(n));
    const numero = 'OB-' + n;

    // si llegó con el enlace de un vendedor, manda el precio que él puso
    const propios = v && v.activo ? preciosDe_(v.codigo, costos) : {};
    const limpios = items.map(i => {
      const id = txt_(i.id, 40), cant = Math.min(10, Math.max(1, Number(i.cantidad) || 1));
      const precio = propios[id] || Math.max(0, Number(i.precio) || 0);
      const c = costos[id] || { costo: 0, base: 0 };
      return { id: id, slug: txt_(i.slug, 80), marca: txt_(i.marca, 40), nombre: txt_(i.nombre, 80), color: txt_(i.color, 60),
        talla: Number(i.talla) || 0, cantidad: cant, precio: precio, base: c.base, costo: c.costo };
    });
    const g = ganancias_({ referido: ref, detalle: limpios }, costos);
    agregar_(sh, {
      numero: numero, fecha: new Date(), estado: 'Nuevo',
      nombre: txt_(p.nombre, 80), celular: txt_(p.celular, 20), ciudad: txt_(p.ciudad, 60), direccion: txt_(p.direccion, 160),
      barrio: txt_(p.barrio, 80), notas: txt_(p.notas, 300),
      productos: txt_(limpios.map(i => `${i.cantidad} × ${i.marca} ${i.nombre} (T${i.talla})`).join(' | '), 1000),
      pares: limpios.reduce((a, i) => a + i.cantidad, 0),
      subtotal: limpios.reduce((a, i) => a + i.precio * i.cantidad, 0),
      detalle: JSON.stringify(limpios), nota_interna: '', origen: txt_(p.origen, 60),
      referido: ref, comision_pagada: '', ganancia_vendedor: g.vendedor, mi_ganancia: g.mia === null ? '' : g.mia,
    });
    return json_({ ok: true, numero: numero, subtotal: limpios.reduce((a, i) => a + i.precio * i.cantidad, 0) });
  } finally {
    lock.releaseLock();
  }
}

function pedidos_() {
  return filas_(hoja_()).filter(o => o.numero).map(o => {
    o.fecha = iso_(o.fecha);
    o.comision_pagada = iso_(o.comision_pagada);
    try { o.detalle = JSON.parse(o.detalle || '[]'); } catch (err) { o.detalle = []; }
    return o;
  }).reverse();
}

function listar_() {
  const costos = costos_();
  const vendedores = filas_(hojaVend_()).filter(o => o.codigo).map(o => ({
    codigo: String(o.codigo), nombre: String(o.nombre || ''), celular: String(o.celular || ''), pin: String(o.pin || ''),
    creado: iso_(o.creado), activo: String(o.activo) !== 'No',
  }));
  const precios = {};
  filas_(hojaPrecios_()).forEach(r => { const c = String(r.codigo); (precios[c] = precios[c] || {})[String(r.producto)] = num_(r.precio); });
  return json_({ ok: true, pedidos: pedidos_(), vendedores: vendedores, costos: costos, precios: precios });
}

function actualizar_(body) {
  const sh = hoja_();
  const fila = buscarFila_(sh, { numero: body.numero });
  if (!fila) return json_({ ok: false, error: 'no_existe' });
  if (body.estado && ESTADOS.indexOf(body.estado) >= 0) poner_(sh, fila, 'estado', body.estado);
  if (typeof body.nota === 'string') poner_(sh, fila, 'nota_interna', txt_(body.nota, 500));
  if (typeof body.referido === 'string') poner_(sh, fila, 'referido', codigo_(body.referido));
  return json_({ ok: true });
}

function guardarVendedor_(body) {
  const r = body.vendedor || {};
  const codigo = codigo_(r.codigo);
  if (!codigo) return json_({ ok: false, error: 'codigo' });
  const pin = String(r.pin || '').replace(/\D/g, '').slice(0, 8);
  if (pin.length < 4) return json_({ ok: false, error: 'pin' });
  const sh = hojaVend_();
  const datos = { codigo: codigo, nombre: txt_(r.nombre, 80), celular: txt_(r.celular, 20), pin: "'" + pin, activo: r.activo === false ? 'No' : 'Sí' };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const fila = buscarFila_(sh, { codigo: codigo });
    if (fila) {
      if (r.nuevo) return json_({ ok: false, error: 'codigo_existe' });
      ['nombre', 'celular', 'pin', 'activo'].forEach(k => poner_(sh, fila, k, datos[k]));
    } else {
      datos.creado = new Date();
      agregar_(sh, datos);
    }
    CacheService.getScriptCache().remove('pr_' + codigo);
    return json_({ ok: true, codigo: codigo });
  } finally {
    lock.releaseLock();
  }
}

/* Marca como pagadas las ganancias de los pedidos entregados de un vendedor */
function pagarVendedor_(body) {
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

/* body.costos = { producto: { nombre, costo, precio_vendedor } } */
function guardarCostos_(body) {
  const sh = hojaCostos_();
  const lista = body.costos || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    Object.keys(lista).slice(0, 300).forEach(id => {
      const prod = txt_(id, 40); if (!prod) return;
      const c = lista[id] || {};
      const fila = buscarFila_(sh, { producto: prod });
      const datos = { producto: prod, nombre: txt_(c.nombre, 120), costo: num_(c.costo) || '', precio_vendedor: num_(c.precio_vendedor) || '' };
      if (fila) ['nombre', 'costo', 'precio_vendedor'].forEach(k => poner_(sh, fila, k, datos[k]));
      else agregar_(sh, datos);
    });
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- portal del vendedor ---------- */
function vendedorEntrar_(v) {
  const costos = costos_();
  const bases = {};
  Object.keys(costos).forEach(id => { if (costos[id].base) bases[id] = costos[id].base; });
  const propios = {};
  filas_(hojaPrecios_()).forEach(r => { if (String(r.codigo) === v.codigo) propios[String(r.producto)] = num_(r.precio); });
  const pedidos = pedidos_().filter(p => String(p.referido) === v.codigo).map(p => ({
    numero: p.numero, fecha: p.fecha, estado: p.estado, cliente: String(p.nombre || '').split(' ')[0], ciudad: p.ciudad,
    productos: p.productos, pares: p.pares, subtotal: p.subtotal, ganancia: ganancias_(p, costos).vendedor, pagado: p.comision_pagada,
  }));
  return json_({ ok: true, vendedor: { codigo: v.codigo, nombre: v.nombre }, bases: bases, precios: propios, pedidos: pedidos });
}

/* body.precios = { producto: precio }  (0 o vacío = quitar) */
function vendedorPrecios_(v, body) {
  const costos = costos_();
  const sh = hojaPrecios_();
  const lista = body.precios || {};
  const errores = [];
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    Object.keys(lista).slice(0, 300).forEach(id => {
      const prod = txt_(id, 40), base = costos[prod] ? costos[prod].base : 0, precio = num_(lista[id]);
      const fila = buscarFila_(sh, { codigo: v.codigo, producto: prod });
      if (!precio) { if (fila) { poner_(sh, fila, 'precio', ''); poner_(sh, fila, 'actualizado', new Date()); } return; }
      if (!base) { errores.push(prod); return; }
      if (precio < base || precio > base * 5) { errores.push(prod); return; }
      if (fila) { poner_(sh, fila, 'precio', precio); poner_(sh, fila, 'actualizado', new Date()); }
      else agregar_(sh, { codigo: v.codigo, producto: prod, precio: precio, actualizado: new Date() });
    });
    CacheService.getScriptCache().remove('pr_' + v.codigo);
    return json_({ ok: true, errores: errores });
  } finally {
    lock.releaseLock();
  }
}
