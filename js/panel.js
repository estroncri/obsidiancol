/* =====================================================================
   OBSIDIAN — panel de pedidos y referidos
   Lee y actualiza los pedidos y referidos guardados en Google Sheets
   (pedidosApi). Sin conexión configurada ofrece un modo de demostración.
   ===================================================================== */
(() => {
  'use strict';

  const CFG = window.OBSIDIAN_CONFIG || {};
  const API = String(CFG.pedidosApi || '').trim();
  const SITE = `https://${CFG.dominio || 'obsidiancol.shop'}`;
  const EXTRA = Number(CFG.aumentoPrecio) || 0;
  const PRODUCTS = (window.OBSIDIAN_PRODUCTS || []).map(p => ({ ...p, precio: p.precio + EXTRA }));
  const byId = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));
  const ESTADOS = ['Nuevo', 'Confirmado', 'Enviado', 'Entregado', 'Cancelado'];
  const KEY = 'obs-panel-clave';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const cleanCode = v => norm(v).replace(/[^a-z0-9_-]/g, '').slice(0, 30);
  const keep = {
    get() { try { return localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } },
    set(v, remember) { try { (remember ? localStorage : sessionStorage).setItem(KEY, v); } catch (e) { /* bloqueado */ } },
    clear() { try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch (e) { /* bloqueado */ } },
  };
  const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6"/></svg>';
  const btnIco = `<span class="btn__ico">${arrow}${arrow}</span>`;
  $$('.btn__ico:empty').forEach(el => { el.innerHTML = arrow + arrow; });

  const dfDay = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short' });
  const dfFull = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
  const dfTime = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' });
  const toDate = v => { const d = new Date(v); return isNaN(d) ? null : d; };
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  let clave = '', demo = false, pedidos = [], referidos = [], filtro = 'Todos', q = '', abierto = null, timer = null, tab = 'pedidos', editando = null, pagando = null;

  /* ---------- utilidades de interfaz ---------- */
  let toastT;
  function toast(t) {
    const el = $('.toast'); $('span', el).textContent = t; el.classList.add('is-on');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('is-on'), 2600);
  }
  function setStatus(s) {
    const el = $('#status');
    el.dataset.s = s;
    el.textContent = { on: 'Conectado a Google Sheets', demo: 'Demostración', off: 'Sin conexión', cargando: 'Cargando…' }[s] || s;
  }
  function view(v) { $('#login').hidden = v !== 'login'; $('#app').hidden = v !== 'app'; }
  function copyText(t, ok = 'Copiado') {
    const fallback = () => { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast(ok); } catch (e) { toast('Selecciona el texto y cópialo'); } ta.remove(); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(t).then(() => toast(ok), fallback); else fallback();
  }

  async function api(body) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await fetch(API, { method: 'POST', body: JSON.stringify(body), signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  /* ---------- acceso ---------- */
  async function enter(key, remember) {
    const err = $('#loginErr'), btn = $('#loginBtn');
    err.textContent = '';
    if (!API) { err.textContent = 'Primero conecta tu hoja de pedidos (pasos abajo).'; return; }
    if (!key) { err.textContent = 'Escribe tu clave.'; $('#clave').focus(); return; }
    btn.disabled = true;
    try {
      const j = await api({ accion: 'listar', clave: key });
      if (!j.ok) {
        err.textContent = {
          clave: 'La clave no es correcta.',
          sin_clave: 'Aún no defines tu clave. Abre tu hoja "OBSIDIAN Pedidos" en Google Sheets → menú OBSIDIAN → Definir clave del panel.',
          bloqueado: 'Demasiados intentos fallidos. Espera 10 minutos y vuelve a intentar.',
        }[j.error] || 'La hoja respondió con un error. Revisa la instalación del script.';
        keep.clear(); return;
      }
      clave = key; demo = false; keep.set(key, remember);
      pedidos = j.pedidos || []; referidos = j.referidos || [];
      start();
    } catch (e) {
      err.textContent = 'No se pudo conectar con la hoja. Revisa tu internet y la URL en js/config.js.';
    } finally { btn.disabled = false; }
  }
  function start() {
    view('app');
    $('#demoBar').hidden = !demo;
    setStatus(demo ? 'demo' : 'on');
    stamp();
    render();
    clearInterval(timer);
    if (!demo) timer = setInterval(() => { if (!document.hidden) load(true); }, 60000);
  }
  function logout(msg) {
    clearInterval(timer); keep.clear(); clave = ''; demo = false; pedidos = []; referidos = []; closeDetail();
    view('login'); $('#clave').value = ''; $('#loginErr').textContent = msg || '';
    document.title = 'Panel OBSIDIAN';
  }
  const stamp = () => { $('#updated').textContent = demo ? '' : `Actualizado ${dfTime.format(new Date())}`; };

  async function load(silent) {
    if (demo) { render(); return; }
    setStatus('cargando');
    try {
      const j = await api({ accion: 'listar', clave });
      if (!j.ok) { if (j.error === 'clave') { logout('Tu clave cambió. Vuelve a entrar.'); return; } throw new Error(j.error); }
      const before = new Set(pedidos.map(p => String(p.numero)));
      pedidos = j.pedidos || []; referidos = j.referidos || [];
      const nuevos = pedidos.filter(p => !before.has(String(p.numero))).length;
      setStatus('on'); stamp(); render();
      if (abierto) openDetail(abierto, true);
      if (silent && nuevos && before.size) toast(`${nuevos} ${nuevos === 1 ? 'pedido nuevo' : 'pedidos nuevos'}`);
    } catch (e) {
      setStatus('off');
      if (!silent) toast('No se pudo actualizar. Revisa tu conexión.');
    }
  }

  /* ---------- datos de ejemplo ---------- */
  function demoData() {
    const nombres = ['Laura M.', 'Andrés P.', 'Camila R.', 'Juan D.', 'Valentina S.', 'Sebastián G.', 'Mariana T.', 'Felipe C.', 'Daniela V.', 'Tomás L.'];
    const ciudades = ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Bucaramanga', 'Cartagena', 'Pereira', 'Manizales', 'Santa Marta', 'Cúcuta'];
    const estados = ['Nuevo', 'Nuevo', 'Confirmado', 'Nuevo', 'Enviado', 'Entregado', 'Confirmado', 'Entregado', 'Cancelado', 'Entregado'];
    const refs = ['', 'carlos', '', 'sofia', '', 'carlos', 'sofia', 'carlos', '', 'sofia'];
    const ahora = Date.now();
    const lista = nombres.map((n, i) => {
      const picks = [PRODUCTS[(i * 3) % PRODUCTS.length]];
      if (i % 3 === 0) picks.push(PRODUCTS[(i * 5 + 2) % PRODUCTS.length]);
      const detalle = picks.filter(Boolean).map((p, k) => ({ id: p.id, slug: p.slug, marca: p.marca, nombre: p.nombre, color: p.color, talla: p.tallas[(i + k) % p.tallas.length], cantidad: 1, precio: p.precio }));
      return {
        numero: 'OB-' + (1010 - i), fecha: new Date(ahora - (i * 9 + 1) * 3600e3).toISOString(), estado: estados[i],
        nombre: `Ejemplo · ${n}`, celular: '300000' + String(1000 + i), ciudad: ciudades[i], direccion: `Calle 00 # 00-${10 + i}`, barrio: 'Barrio de ejemplo',
        notas: i % 4 === 0 ? 'Entregar en portería' : '', productos: detalle.map(d => `${d.cantidad} × ${d.marca} ${d.nombre} (T${d.talla})`).join(' | '),
        pares: detalle.length, subtotal: detalle.reduce((a, d) => a + d.precio * d.cantidad, 0), detalle, nota_interna: i === 2 ? 'Cliente pidió entrega en la tarde.' : '',
        origen: 'demostración', referido: refs[i], comision_pagada: i === 9 ? new Date(ahora - 86400e3).toISOString() : '',
      };
    });
    const refsDemo = [
      { codigo: 'carlos', nombre: 'Ejemplo · Carlos R.', celular: '3000000101', comision: 10, creado: new Date(ahora - 20 * 86400e3).toISOString(), activo: true },
      { codigo: 'sofia', nombre: 'Ejemplo · Sofía M.', celular: '3000000102', comision: 12, creado: new Date(ahora - 12 * 86400e3).toISOString(), activo: true },
    ];
    return { lista, refsDemo };
  }

  /* ---------- cálculos de referidos ---------- */
  const refOf = code => referidos.find(r => r.codigo === code);
  const linkOf = code => `${SITE}/?ref=${code}`;
  const isPaid = p => !!String(p.comision_pagada || '').trim();
  function refStats(code) {
    const r = refOf(code), pct = r ? Number(r.comision) || 0 : 0;
    const mine = pedidos.filter(p => p.referido === code);
    const vivos = mine.filter(p => p.estado !== 'Cancelado');
    const entregados = mine.filter(p => p.estado === 'Entregado');
    const ventas = entregados.reduce((a, p) => a + Number(p.subtotal || 0), 0);
    const porPagar = entregados.filter(p => !isPaid(p)).reduce((a, p) => a + Number(p.subtotal || 0) * pct / 100, 0);
    const pagado = entregados.filter(isPaid).reduce((a, p) => a + Number(p.subtotal || 0) * pct / 100, 0);
    const enCurso = vivos.filter(p => p.estado !== 'Entregado').length;
    return { pct, pedidos: vivos.length, entregados: entregados.length, ventas, porPagar, pagado, enCurso };
  }

  /* ---------- render pedidos ---------- */
  const items = p => (Array.isArray(p.detalle) && p.detalle.length) ? p.detalle : [];
  const resumen = p => {
    const it = items(p);
    if (!it.length) return esc(p.productos || '');
    const first = it.slice(0, 2).map(i => `${i.cantidad > 1 ? i.cantidad + ' × ' : ''}${esc(i.marca)} ${esc(i.nombre)} · T${esc(i.talla)}`).join(', ');
    return first + (it.length > 2 ? ` y ${it.length - 2} más` : '');
  };
  function visible() {
    const nq = norm(q).trim();
    return pedidos.filter(p => (filtro === 'Todos' || p.estado === filtro) &&
      (!nq || norm(`${p.numero} ${p.nombre} ${p.celular} ${p.ciudad} ${p.productos} ${p.referido}`).includes(nq)));
  }
  function render() {
    const hoy = new Date();
    const vivos = pedidos.filter(p => p.estado !== 'Cancelado');
    const mes = vivos.filter(p => { const d = toDate(p.fecha); return d && d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear(); });
    const nNew = pedidos.filter(p => p.estado === 'Nuevo').length;
    $('#kNew b').textContent = nNew; $('#kNew').classList.toggle('is-alert', nNew > 0);
    $('#kToday b').textContent = pedidos.filter(p => { const d = toDate(p.fecha); return d && sameDay(d, hoy); }).length;
    $('#kMonth b').textContent = fmt(mes.reduce((a, p) => a + Number(p.subtotal || 0), 0));
    $('#kMonth p:last-child').textContent = `${mes.length} ${mes.length === 1 ? 'pedido' : 'pedidos'} sin cancelados`;
    $('#kAvg b').textContent = fmt(vivos.length ? vivos.reduce((a, p) => a + Number(p.subtotal || 0), 0) / vivos.length : 0);
    $('#totalTxt').textContent = `${pedidos.length} ${pedidos.length === 1 ? 'pedido' : 'pedidos'} en total`;
    $('#tabPedN').textContent = nNew ? `(${nNew})` : '';
    document.title = nNew ? `(${nNew}) Panel OBSIDIAN` : 'Panel OBSIDIAN';

    const count = e => e === 'Todos' ? pedidos.length : pedidos.filter(p => p.estado === e).length;
    $('#chips').innerHTML = ['Todos', ...ESTADOS].map(e => `<button type="button" class="chip mono${filtro === e ? ' is-on' : ''}"${e !== 'Todos' ? ` data-e="${e}"` : ''} data-f="${e}">${e} <small>${count(e)}</small></button>`).join('');

    const list = visible();
    $('#list').innerHTML = list.map(p => {
      const d = toDate(p.fecha);
      return `<button type="button" class="pn-row${p.estado === 'Nuevo' ? ' is-new' : ''}" data-n="${esc(p.numero)}">
        <span class="c-num"><span class="mono num">${esc(p.numero)}</span><br><span class="mono muted">${d ? dfDay.format(d) + ' · ' + dfTime.format(d) : ''}</span></span>
        <span class="c-cli"><span class="serif">${esc(p.nombre)}</span><br><span class="mono muted">${esc(p.ciudad)}</span>${p.referido ? `<span class="pn-refchip">Ref · ${esc(p.referido)}</span>` : ''}</span>
        <span class="c-prod pn-prod">${resumen(p)}</span>
        <span class="c-tot mono num">${fmt(p.subtotal)}</span>
        <span class="c-st"><span class="pill" data-e="${esc(p.estado)}">${esc(p.estado)}</span></span>
        <span class="c-go" aria-hidden="true">›</span>
      </button>`;
    }).join('');
    $('#empty').hidden = list.length > 0;
    $('#emptyTxt').textContent = pedidos.length ? 'Ningún pedido coincide con el filtro o la búsqueda.' : 'Cuando alguien haga un pedido en la tienda, aparecerá aquí.';

    const tally = new Map();
    vivos.forEach(p => items(p).forEach(i => tally.set(i.id, (tally.get(i.id) || 0) + Number(i.cantidad || 1))));
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    $('#top5').innerHTML = top.length ? top.map(([id, n]) => {
      const p = byId[id];
      return `<li>${p ? `<img src="${esc(p.imagenes[0])}" alt="">` : '<span></span>'}<span><span class="mono muted">${esc(p ? p.marca : '')}</span><br><span class="serif">${esc(p ? p.nombre : id)}</span></span><span class="mono">${n} ${n === 1 ? 'par' : 'pares'}</span></li>`;
    }).join('') : '<li><span></span><span class="muted">Aún no hay datos suficientes.</span><span></span></li>';

    renderRefs();
  }

  /* ---------- render referidos ---------- */
  function renderRefs() {
    const activos = referidos.filter(r => r.activo !== false);
    let ventas = 0, due = 0, paid = 0;
    referidos.forEach(r => { const s = refStats(r.codigo); ventas += s.ventas; due += s.porPagar; paid += s.pagado; });
    $('#rkActive b').textContent = activos.length;
    $('#rkSales b').textContent = fmt(ventas);
    $('#rkDue b').textContent = fmt(due); $('#rkDue').classList.toggle('is-alert', due > 0);
    $('#rkPaid b').textContent = fmt(paid);
    const conRef = pedidos.filter(p => p.referido && p.estado !== 'Cancelado').length;
    $('#refTotalTxt').textContent = `${conRef} ${conRef === 1 ? 'pedido referido' : 'pedidos referidos'}`;
    $('#tabRefN').textContent = due > 0 ? `(${fmt(due)})` : '';

    const known = new Set(referidos.map(r => r.codigo));
    const unknown = [...new Set(pedidos.map(p => p.referido).filter(c => c && !known.has(c)))];
    const cards = referidos.slice().sort((a, b) => refStats(b.codigo).porPagar - refStats(a.codigo).porPagar || String(a.nombre).localeCompare(String(b.nombre), 'es')).map(r => {
      const s = refStats(r.codigo), link = linkOf(r.codigo);
      const cel = String(r.celular || '').replace(/\D/g, ''), wa = cel.length === 10 && cel[0] === '3' ? '57' + cel : cel;
      const msg = `¡Hola ${String(r.nombre || '').replace(/^Ejemplo · /, '').split(' ')[0]}! 👋 Este es tu enlace de OBSIDIAN: ${link}\n\nCada compra que hagan con tu enlace (hasta ${CFG.referidoDias || 30} días después de entrar) te deja ${s.pct}% de comisión cuando el pedido se entrega.`;
      const confirmPay = pagando === r.codigo;
      return `<article class="pn-ref${r.activo === false ? ' is-off' : ''}">
        <div class="pn-ref__top"><div><p class="serif">${esc(r.nombre || r.codigo)}</p><p class="mono muted">Código ${esc(r.codigo)} · ${s.pct}% comisión${r.celular ? ' · ' + esc(r.celular) : ''}</p></div><span class="pill" data-e="${r.activo === false ? 'Cancelado' : 'Entregado'}">${r.activo === false ? 'Inactivo' : 'Activo'}</span></div>
        <div class="pn-ref__link"><label class="sr-only" for="lk-${esc(r.codigo)}">Enlace de ${esc(r.nombre)}</label><input id="lk-${esc(r.codigo)}" readonly value="${esc(link)}"><button class="chip mono" type="button" data-copy-link="${esc(link)}">Copiar</button></div>
        <dl class="pn-ref__stats mono">
          <div><dt>Pedidos</dt><dd>${s.pedidos}</dd></div>
          <div><dt>Entregados</dt><dd>${s.entregados}</dd></div>
          <div><dt>Ventas</dt><dd>${fmt(s.ventas)}</dd></div>
          <div><dt>Por pagar</dt><dd class="${s.porPagar > 0 ? 'due' : ''}">${fmt(s.porPagar)}</dd></div>
          <div><dt>Pagado</dt><dd>${fmt(s.pagado)}</dd></div>
        </dl>
        <div class="pn-ref__btns">
          ${wa ? `<a class="btn btn--sm" href="https://wa.me/${wa}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Enviar enlace por WhatsApp ${btnIco}</a>` : `<button class="btn btn--sm" type="button" data-copy-msg="${esc(msg)}">Copiar mensaje para enviar ${btnIco}</button>`}
          ${s.porPagar > 0 ? `<button class="btn btn--line btn--sm" type="button" data-pay="${esc(r.codigo)}">${confirmPay ? `Confirmar: pagué ${fmt(s.porPagar)}` : `Marcar ${fmt(s.porPagar)} como pagado`}</button>` : ''}
          <button class="link" type="button" data-edit-ref="${esc(r.codigo)}">Editar</button>
        </div>
        ${s.enCurso ? `<p class="mono muted">${s.enCurso} ${s.enCurso === 1 ? 'pedido en curso' : 'pedidos en curso'}: su comisión se suma cuando se entregue.</p>` : ''}
      </article>`;
    });
    const unk = unknown.map(c => `<article class="pn-ref is-unknown"><div class="pn-ref__top"><div><p class="serif">Código sin registrar: ${esc(c)}</p><p class="mono muted">${pedidos.filter(p => p.referido === c).length} pedidos llegaron con este código.</p></div></div><div class="pn-ref__btns"><button class="btn btn--line btn--sm" type="button" data-register="${esc(c)}">Registrar este referido</button></div></article>`);
    $('#refList').innerHTML = cards.concat(unk).join('') || `<div class="empty"><p class="s-md">Sin <em>referidos</em></p><p>Crea el primero con el formulario: escribe el nombre de tu amigo y te damos su enlace.</p></div>`;
    updatePreview();
  }

  /* ---------- formulario de referidos ---------- */
  const form = () => $('#refForm');
  function updatePreview() {
    const code = cleanCode($('#rCod').value) || 'codigo';
    $('#rPrev').textContent = linkOf(code);
  }
  function resetForm() {
    editando = null; form().reset(); $('#rCom').value = 10; $('#rAct').checked = true;
    $('#rCod').readOnly = false; delete $('#rCod').dataset.touched; $('#rErr').textContent = '';
    $('#refFormTitle').innerHTML = 'Nuevo <em>referido</em>'; $('#rSave').firstChild.textContent = 'Crear enlace '; $('#rCancel').hidden = true;
    updatePreview();
  }
  function editRef(code) {
    const r = refOf(code); if (!r) return;
    editando = code;
    $('#rNombre').value = r.nombre || ''; $('#rCel').value = r.celular || ''; $('#rCom').value = r.comision || 0; $('#rCod').value = r.codigo; $('#rAct').checked = r.activo !== false;
    $('#rCod').readOnly = true; $('#rErr').textContent = '';
    $('#refFormTitle').innerHTML = 'Editar <em>referido</em>'; $('#rSave').firstChild.textContent = 'Guardar cambios '; $('#rCancel').hidden = false;
    updatePreview();
    $('.pn-refform').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function saveRef(e) {
    e.preventDefault();
    const nombre = $('#rNombre').value.trim(), codigo = cleanCode($('#rCod').value);
    const comision = Math.min(90, Math.max(0, Number($('#rCom').value) || 0));
    const err = $('#rErr'); err.textContent = '';
    if (nombre.length < 2) { $('#rNombre').focus(); err.textContent = 'Escribe el nombre del referido.'; return; }
    if (codigo.length < 2) { err.textContent = 'El código necesita al menos 2 letras o números.'; return; }
    if (!editando && refOf(codigo)) { err.textContent = 'Ese código ya existe. Usa otro, por ejemplo agregando un número.'; return; }
    const datos = { codigo, nombre, celular: $('#rCel').value.trim(), comision, activo: $('#rAct').checked, nuevo: !editando };
    const btn = $('#rSave'); btn.disabled = true;
    try {
      if (!demo) {
        const j = await api({ accion: 'guardarReferido', clave, referido: datos });
        if (!j.ok) { err.textContent = j.error === 'codigo_existe' ? 'Ese código ya existe.' : 'No se pudo guardar. Intenta de nuevo.'; return; }
      }
      const prev = refOf(codigo);
      if (prev) Object.assign(prev, datos); else referidos.push({ ...datos, creado: new Date().toISOString() });
      delete (refOf(codigo) || {}).nuevo;
      toast(editando ? 'Referido actualizado' : `Enlace creado: ${linkOf(codigo)}`);
      resetForm(); renderRefs();
    } catch (ex) {
      err.textContent = 'No se pudo conectar con la hoja. Intenta de nuevo.';
    } finally { btn.disabled = false; }
  }
  async function payRef(code) {
    if (pagando !== code) { pagando = code; renderRefs(); return; }
    pagando = null;
    const ahora = new Date().toISOString();
    const afectados = pedidos.filter(p => p.referido === code && p.estado === 'Entregado' && !isPaid(p));
    afectados.forEach(p => { p.comision_pagada = ahora; });
    renderRefs();
    if (demo) { toast('Comisiones marcadas como pagadas (demostración)'); return; }
    try {
      const j = await api({ accion: 'pagarComisiones', clave, codigo: code });
      if (!j.ok) throw new Error(j.error);
      toast(`Listo: ${j.pagados} ${j.pagados === 1 ? 'pedido marcado como pagado' : 'pedidos marcados como pagados'}`);
    } catch (e) {
      afectados.forEach(p => { p.comision_pagada = ''; }); renderRefs();
      toast('No se pudo guardar el pago. Intenta de nuevo.');
    }
  }

  /* ---------- detalle de pedido ---------- */
  const waNumber = cel => { const d = String(cel || '').replace(/\D/g, ''); return d.length === 10 && d[0] === '3' ? '57' + d : d; };
  function waText(p) {
    const nombre = String(p.nombre || '').replace(/^Ejemplo · /, '').split(' ')[0];
    const lista = items(p).map(i => `• ${i.cantidad} × ${i.marca} ${i.nombre} — Talla ${i.talla}`).join('\n') || p.productos;
    if (p.estado === 'Enviado') return `Hola ${nombre} 👋 Te escribimos de OBSIDIAN: tu pedido ${p.numero} ya va en camino.`;
    if (p.estado === 'Entregado') return `Hola ${nombre} 👋 Gracias por comprar en OBSIDIAN. ¿Cómo te quedaron tus tenis? (pedido ${p.numero})`;
    return `Hola ${nombre} 👋 Te escribimos de OBSIDIAN sobre tu pedido ${p.numero}:\n\n${lista}\n\nSubtotal: ${fmt(p.subtotal)}\n¿Confirmamos los datos de envío a ${p.ciudad}?`;
  }
  function refBlock(p) {
    const r = p.referido ? refOf(p.referido) : null;
    const pct = r ? Number(r.comision) || 0 : 0;
    const com = Number(p.subtotal || 0) * pct / 100;
    const estado = !p.referido ? 'Este pedido no llegó por un enlace de referido.'
      : !r ? 'Este código no está registrado. Regístralo en la pestaña Referidos para calcular su comisión.'
      : p.estado === 'Cancelado' ? 'Pedido cancelado: no genera comisión.'
      : p.estado !== 'Entregado' ? `Comisión de ${fmt(com)} (${pct}%) cuando se entregue.`
      : isPaid(p) ? `Comisión de ${fmt(com)} pagada.` : `Comisión de ${fmt(com)} por pagar.`;
    return `<section class="pn-sec"><h3 class="mono muted">Referido</h3>
      <p>${p.referido ? `<b>${esc(r ? r.nombre : p.referido)}</b> <span class="mono muted">(${esc(p.referido)})</span>` : '—'}</p>
      <p class="mono muted" style="margin-top:.3rem">${estado}</p>
      <div class="pn-refedit"><label class="sr-only" for="refEdit">Código de referido del pedido</label><input id="refEdit" list="refCodes" placeholder="Asignar código (ej. juan)" value="${esc(p.referido || '')}"><button class="chip mono" type="button" data-save-ref>Guardar</button></div>
      <datalist id="refCodes">${referidos.map(x => `<option value="${esc(x.codigo)}">${esc(x.nombre)}</option>`).join('')}</datalist>
    </section>`;
  }
  function openDetail(num, keepOpen) {
    const p = pedidos.find(x => String(x.numero) === String(num)); if (!p) return;
    abierto = String(p.numero);
    const d = toDate(p.fecha);
    $('#detTitle').innerHTML = `Pedido <em>${esc(p.numero)}</em>`;
    $('#detDate').textContent = d ? dfFull.format(d) : '';
    const its = items(p);
    $('#detBody').innerHTML = `
      <section class="pn-sec"><h3 class="mono muted">Estado</h3><div class="pn-states">${ESTADOS.map(e => `<button type="button" class="chip mono${p.estado === e ? ' is-on' : ''}" data-e="${e}" data-set="${e}">${e}</button>`).join('')}</div></section>
      <section class="pn-sec"><h3 class="mono muted">Cliente</h3>
        <dl class="pn-dl mono">
          <div><dt>Nombre</dt><dd>${esc(p.nombre)}</dd></div>
          <div><dt>Celular</dt><dd>${esc(p.celular)}</dd></div>
          <div><dt>Ciudad</dt><dd>${esc(p.ciudad)}</dd></div>
          <div><dt>Dirección</dt><dd>${esc(p.direccion)}</dd></div>
          ${p.barrio ? `<div><dt>Barrio</dt><dd>${esc(p.barrio)}</dd></div>` : ''}
          ${p.notas ? `<div><dt>Notas</dt><dd>${esc(p.notas)}</dd></div>` : ''}
        </dl>
        <div class="pn-btns">
          <a class="btn btn--block" href="https://wa.me/${waNumber(p.celular)}?text=${encodeURIComponent(waText(p))}" target="_blank" rel="noopener">Escribir por WhatsApp ${btnIco}</a>
          <button class="btn btn--line btn--block btn--sm" type="button" data-copy>Copiar datos de envío</button>
        </div>
      </section>
      <section class="pn-sec"><h3 class="mono muted">Productos · ${its.reduce((a, i) => a + Number(i.cantidad || 1), 0) || p.pares || 0} ${Number(p.pares) === 1 ? 'par' : 'pares'}</h3>
        ${its.length ? its.map(i => {
          const cat = byId[i.id];
          const diff = cat && Number(cat.precio) !== Number(i.precio);
          return `<div class="pn-item">${cat ? `<img src="${esc(cat.imagenes[0])}" alt="">` : '<span></span>'}<div><p class="mono muted">${esc(i.marca)}</p><p class="serif">${esc(i.nombre)}</p><p class="mono">${esc(i.color)} · Talla ${esc(i.talla)} · ${i.cantidad} ${Number(i.cantidad) === 1 ? 'par' : 'pares'}</p>${diff ? `<p class="mono pn-warn">El catálogo hoy dice ${fmt(cat.precio)}</p>` : ''}</div><span class="mono">${fmt(i.precio * i.cantidad)}</span></div>`;
        }).join('') : `<p>${esc(p.productos)}</p>`}
        <div class="tot" style="margin-top:.8rem"><span class="mono">Subtotal</span><b>${fmt(p.subtotal)}</b></div>
        <p class="mono muted">El envío se acuerda con el cliente por WhatsApp.</p>
      </section>
      ${refBlock(p)}
      <section class="pn-sec pn-note"><h3 class="mono muted">Nota interna</h3><label class="sr-only" for="nota">Nota interna</label><textarea id="nota" placeholder="Solo la ves tú. Ej: pagó envío, cambiar a talla 42…">${esc(p.nota_interna || '')}</textarea><p style="margin-top:.6rem"><button class="btn btn--sm" type="button" data-save-note>Guardar nota</button></p></section>
      <p class="mono muted" style="padding:1rem 0">Origen: ${esc(p.origen || '—')}</p>`;
    if (!keepOpen) {
      const dw = $('#det'); dw.classList.add('is-open'); dw.setAttribute('aria-hidden', 'false');
      setTimeout(() => $('#det .dw__close')?.focus(), 60);
    }
  }
  function closeDetail() { abierto = null; const dw = $('#det'); dw.classList.remove('is-open'); dw.setAttribute('aria-hidden', 'true'); }

  async function update(num, patch) {
    const p = pedidos.find(x => String(x.numero) === String(num)); if (!p) return;
    const prev = { estado: p.estado, nota_interna: p.nota_interna, referido: p.referido };
    if (patch.estado) p.estado = patch.estado;
    if (typeof patch.nota === 'string') p.nota_interna = patch.nota;
    if (typeof patch.referido === 'string') p.referido = patch.referido;
    render(); openDetail(num, true);
    if (demo) { toast('Guardado (demostración)'); return; }
    try {
      const j = await api({ accion: 'actualizar', clave, numero: p.numero, ...patch });
      if (!j.ok) throw new Error(j.error);
      toast('Guardado en tu hoja');
    } catch (e) {
      Object.assign(p, prev); render(); openDetail(num, true);
      toast('No se pudo guardar. Intenta de nuevo.');
    }
  }

  function copyShipping() {
    const p = pedidos.find(x => String(x.numero) === abierto); if (!p) return;
    copyText([p.nombre, p.celular, p.direccion, p.barrio, p.ciudad, p.notas].filter(Boolean).join('\n'), 'Datos copiados');
  }

  function exportCSV() {
    const cols = ['numero', 'fecha', 'estado', 'nombre', 'celular', 'ciudad', 'direccion', 'barrio', 'notas', 'productos', 'pares', 'subtotal', 'referido', 'comision_pagada', 'nota_interna'];
    const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = '﻿' + [cols.join(';'), ...visible().map(p => cols.map(c => cell(p[c])).join(';'))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `pedidos-obsidian-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function setTab(t) {
    tab = t;
    $$('.pn-tabs [data-tab]').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on); });
    $('#tabPedidos').hidden = t !== 'pedidos'; $('#tabReferidos').hidden = t !== 'referidos';
    $('#csvBtn').hidden = t !== 'pedidos';
  }

  /* ---------- eventos ---------- */
  $('#loginForm').addEventListener('submit', e => { e.preventDefault(); enter($('#clave').value.trim(), $('#recordar').checked); });
  $('#demoBtn').addEventListener('click', () => { demo = true; const d = demoData(); pedidos = d.lista; referidos = d.refsDemo; start(); });
  $('#refreshBtn').addEventListener('click', () => { if (demo) { toast('En la demostración no hay datos nuevos'); return; } load(false); });
  $('#logoutBtn').addEventListener('click', () => logout(''));
  $('#csvBtn').addEventListener('click', exportCSV);
  $('#q').addEventListener('input', e => { q = e.target.value; render(); });
  $('#refForm').addEventListener('submit', saveRef);
  $('#rNombre').addEventListener('input', () => { if (!editando && !$('#rCod').dataset.touched) $('#rCod').value = cleanCode($('#rNombre').value.split(/\s+/).slice(0, 2).join('')); updatePreview(); });
  $('#rCod').addEventListener('input', () => { $('#rCod').dataset.touched = $('#rCod').value ? '1' : ''; $('#rCod').value = cleanCode($('#rCod').value); updatePreview(); });
  $('#rCancel').addEventListener('click', resetForm);
  document.addEventListener('click', e => {
    const tb = e.target.closest('[data-tab]'); if (tb) { setTab(tb.dataset.tab); return; }
    const f = e.target.closest('[data-f]'); if (f) { filtro = f.dataset.f; render(); return; }
    const row = e.target.closest('.pn-row'); if (row) { openDetail(row.dataset.n); return; }
    if (e.target.closest('[data-close]')) { closeDetail(); return; }
    const s = e.target.closest('[data-set]'); if (s && abierto) { update(abierto, { estado: s.dataset.set }); return; }
    if (e.target.closest('[data-copy]')) { copyShipping(); return; }
    if (e.target.closest('[data-save-note]') && abierto) { update(abierto, { nota: $('#nota').value.trim() }); return; }
    if (e.target.closest('[data-save-ref]') && abierto) { update(abierto, { referido: cleanCode($('#refEdit').value) }); return; }
    const cl = e.target.closest('[data-copy-link]'); if (cl) { copyText(cl.dataset.copyLink, 'Enlace copiado'); return; }
    const cm = e.target.closest('[data-copy-msg]'); if (cm) { copyText(cm.dataset.copyMsg, 'Mensaje copiado'); return; }
    const pay = e.target.closest('[data-pay]'); if (pay) { payRef(pay.dataset.pay); return; }
    const ed = e.target.closest('[data-edit-ref]'); if (ed) { editRef(ed.dataset.editRef); return; }
    const rg = e.target.closest('[data-register]'); if (rg) { resetForm(); $('#rCod').value = rg.dataset.register; $('#rCod').dataset.touched = '1'; updatePreview(); $('#rNombre').focus(); return; }
    if (pagando && !e.target.closest('[data-pay]')) { pagando = null; renderRefs(); }
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && clave && !demo) load(true); });

  /* ---------- arranque ---------- */
  $('#setup').hidden = !!API;
  updatePreview();
  const saved = keep.get();
  if (API && saved) { $('#clave').value = saved; enter(saved, true); }
  else view('login');
})();
