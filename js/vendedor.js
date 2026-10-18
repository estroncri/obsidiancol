/* =====================================================================
   OBSIDIAN — portal de vendedores
   Cada vendedor entra con su código y PIN, pone sus precios
   (nunca por debajo de su precio de vendedor) y ve sus ventas y ganancias.
   ===================================================================== */
(() => {
  'use strict';

  const CFG = window.OBSIDIAN_CONFIG || {};
  const API = String(CFG.pedidosApi || '').trim();
  const SITE = `https://${CFG.dominio || 'obsidiancol.shop'}`;
  const EXTRA = Number(CFG.aumentoPrecio) || 0;
  const PRODUCTS = (window.OBSIDIAN_PRODUCTS || []).map(p => ({ ...p, precio: p.precio + EXTRA }));
  const KEY = 'obs-vend';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => (n < 0 ? '−$' : '$') + Math.abs(Math.round(Number(n) || 0)).toLocaleString('es-CO');
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const cleanCode = v => norm(v).replace(/[^a-z0-9_-]/g, '').slice(0, 30);
  const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6"/></svg>';
  $$('.btn__ico:empty').forEach(el => { el.innerHTML = arrow + arrow; });
  const waLink = t => `https://wa.me/${CFG.whatsapp || ''}?text=${encodeURIComponent(t)}`;
  $$('[data-wa]').forEach(a => { a.href = waLink(a.dataset.wa); a.target = '_blank'; a.rel = 'noopener'; });

  const dfDay = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short' });
  const dfTime = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' });
  const toDate = v => { const d = new Date(v); return isNaN(d) ? null : d; };
  const keep = {
    get() { try { return JSON.parse(localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } },
    set(v, remember) { try { (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(v)); } catch (e) { /* bloqueado */ } },
    clear() { try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch (e) { /* bloqueado */ } },
  };

  let cred = null, data = null, dirty = {}, timer = null;

  let toastT;
  function toast(t) {
    const el = $('.toast'); $('span', el).textContent = t; el.classList.add('is-on');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('is-on'), 2600);
  }
  function setStatus(s) {
    const el = $('#status'); el.dataset.s = s;
    el.textContent = { on: 'Conectado', off: 'Sin conexión', cargando: 'Cargando…' }[s] || s;
  }
  function view(v) { $('#login').hidden = v !== 'login'; $('#app').hidden = v !== 'app'; }
  function copyText(t, ok) {
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
  const ERR = {
    acceso: 'El código o el PIN no son correctos.',
    bloqueado: 'Demasiados intentos. Espera 15 minutos y vuelve a intentar.',
    inactivo: 'Tu acceso está pausado. Escríbele a OBSIDIAN.',
  };

  /* ---------- acceso ---------- */
  async function enter(c, remember) {
    const err = $('#loginErr'), btn = $('#loginBtn');
    err.textContent = '';
    if (!API) { err.textContent = 'El portal todavía no está conectado.'; return; }
    if (!c.codigo || !c.pin) { err.textContent = 'Escribe tu código y tu PIN.'; return; }
    btn.disabled = true;
    try {
      const j = await api({ accion: 'vendedorEntrar', codigo: c.codigo, pin: c.pin });
      if (!j.ok) { err.textContent = ERR[j.error] || 'No se pudo entrar. Intenta de nuevo.'; keep.clear(); view('login'); return; }
      cred = c; keep.set(c, remember);
      data = j; dirty = {};
      start();
    } catch (e) {
      err.textContent = 'No se pudo conectar. Revisa tu internet e intenta de nuevo.';
      view('login');
    } finally { btn.disabled = false; }
  }
  function start() {
    view('app'); setStatus('on'); stamp(); render();
    clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden) load(true); }, 120000);
  }
  function logout(msg) {
    clearInterval(timer); keep.clear(); cred = null; data = null; dirty = {};
    view('login'); $('#pin').value = ''; $('#loginErr').textContent = msg || '';
  }
  const stamp = () => { $('#updated').textContent = `Actualizado ${dfTime.format(new Date())}`; };
  async function load(silent) {
    if (!cred) return;
    setStatus('cargando');
    try {
      const j = await api({ accion: 'vendedorEntrar', codigo: cred.codigo, pin: cred.pin });
      if (!j.ok) { logout(ERR[j.error] || 'Vuelve a entrar.'); return; }
      data = j; setStatus('on'); stamp();
      const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('#priceList');
      if (typing) renderTop(); else render();
    } catch (e) {
      setStatus('off');
      if (!silent) toast('No se pudo actualizar. Revisa tu conexión.');
    }
  }

  /* ---------- cálculos ---------- */
  const isPaid = p => !!String(p.pagado || '').trim();
  const link = () => `${SITE}/?ref=${data.vendedor.codigo}`;
  const own = id => (id in dirty ? dirty[id] : Number(data.precios[id]) || 0);
  function rowState(p) {
    const base = Number(data.bases[p.id]) || 0, mine = own(p.id);
    const sale = mine || p.precio;
    let error = '';
    if (mine && mine < base) error = `Mínimo ${fmt(base)}`;
    else if (mine && mine > base * 5) error = `Máximo ${fmt(base * 5)}`;
    return { base, mine, sale, gain: sale - base, error };
  }

  /* ---------- render ---------- */
  function render() { renderTop(); renderPrices(); renderSales(); renderPhotos(); }
  function renderTop() {
    const v = data.vendedor;
    $('#vName').textContent = String(v.nombre || v.codigo).split(' ')[0];
    $('#vCode').textContent = v.codigo;
    const l = link();
    $('#vLink').value = l;
    $('#seeStore').href = l;
    const msg = `Mira los tenis de OBSIDIAN 👟 Pide aquí y te llegan a tu casa (${CFG.contraentregaModelos || 'los modelos contraentrega'} los pagas al recibir):\n${l}`;
    $('#shareWa').href = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    $('#shareNative').hidden = !navigator.share;
    $('#shareNative').onclick = () => navigator.share({ title: 'OBSIDIAN', text: 'Mira los tenis de OBSIDIAN 👟', url: l }).catch(() => {});

    const peds = data.pedidos || [];
    const vivos = peds.filter(p => p.estado !== 'Cancelado');
    const ent = vivos.filter(p => p.estado === 'Entregado');
    const sum = (l2, f) => l2.reduce((a, p) => a + f(p), 0);
    const due = sum(ent.filter(p => !isPaid(p)), p => Number(p.ganancia) || 0);
    $('#gDue b').textContent = fmt(due); $('#gDue').classList.toggle('is-alert', due > 0);
    $('#gWay b').textContent = fmt(sum(vivos.filter(p => p.estado !== 'Entregado'), p => Number(p.ganancia) || 0));
    $('#gPaid b').textContent = fmt(sum(ent.filter(isPaid), p => Number(p.ganancia) || 0));
    $('#gOrders b').textContent = vivos.length;
    const np = Object.values(data.precios || {}).filter(Boolean).length;
    $('#vSummary').textContent = np ? `${np} ${np === 1 ? 'precio propio' : 'precios propios'}` : 'Aún sin precios propios';
    const nuevos = vivos.filter(p => p.estado !== 'Entregado').length;
    $('#tabVentasN').textContent = nuevos ? `(${nuevos})` : '';
  }
  function priceRow(p) {
    const s = rowState(p), d = p.id in dirty;
    return `<div class="pn-cost pn-cost--v${d ? ' is-dirty' : ''}${s.error ? ' is-bad' : ''}" role="row" data-id="${esc(p.id)}">
      <div class="pn-cost__name" role="cell"><img src="${esc(p.imagenes[0])}" alt=""><span><span class="mono muted">${esc(p.marca)}</span><br><span class="serif">${esc(p.nombre)}</span><br><span class="mono muted">${esc(p.color)}</span></span></div>
      <div role="cell"><span class="pn-cost__lbl mono">Te cuesta</span><span class="mono">${fmt(s.base)}</span></div>
      <div role="cell"><span class="pn-cost__lbl mono">Tienda</span><span class="mono">${fmt(p.precio)}</span></div>
      <label role="cell"><span class="pn-cost__lbl mono">Tu precio</span><input type="number" inputmode="numeric" min="${s.base}" step="1000" value="${s.mine || ''}" placeholder="${p.precio}"></label>
      <div role="cell"><span class="pn-cost__lbl mono">Ganas por par</span><span class="mono${s.gain <= 0 ? ' pn-warn' : ''}"><b>${s.gain > 0 ? fmt(s.gain) : '$0'}</b></span></div>
      ${s.error ? `<p class="pn-cost__warn mono pn-warn" role="cell">${s.error}</p>` : !s.mine && s.gain <= 0 ? `<p class="pn-cost__warn mono pn-warn" role="cell">El precio de la tienda no te deja ganancia: pon tu precio.</p>` : ''}
    </div>`;
  }
  function renderPrices() {
    const list = PRODUCTS.filter(p => Number(data.bases[p.id]) > 0 && !p.agotado);
    $('#priceList').innerHTML = list.length
      ? `<div class="pn-cost pn-cost--v pn-cost--head mono" role="row"><span role="columnheader">Modelo</span><span role="columnheader">Te cuesta</span><span role="columnheader">Tienda</span><span role="columnheader">Tu precio</span><span role="columnheader">Ganas por par</span></div>` + list.map(priceRow).join('')
      : `<div class="empty"><p class="s-md">Pronto <em>tendrás modelos</em></p><p>OBSIDIAN todavía no activa precios de vendedor. Cuando lo haga, aparecen aquí.</p></div>`;
    const missing = PRODUCTS.length - list.length;
    $('#priceNote').textContent = missing && list.length ? `${missing} ${missing === 1 ? 'modelo aún no está disponible' : 'modelos aún no están disponibles'} para vendedores.` : '';
    bar();
  }
  function bar() {
    const n = Object.keys(dirty).length;
    const bad = $$('#priceList .is-bad').length;
    $('#priceBar').hidden = !n;
    $('#priceDirty').textContent = bad ? `Revisa ${bad} ${bad === 1 ? 'precio' : 'precios'}` : `${n} ${n === 1 ? 'precio sin guardar' : 'precios sin guardar'}`;
    $('#priceSave').disabled = !!bad;
  }
  function onPriceInput(e) {
    const inp = e.target.closest('input'); if (!inp) return;
    const row = inp.closest('[data-id]'), id = row.dataset.id;
    const v = Math.round(Number(inp.value) || 0), saved = Number(data.precios[id]) || 0;
    if (v === saved) delete dirty[id]; else dirty[id] = v;
    const tmp = document.createElement('div'); tmp.innerHTML = priceRow(PRODUCTS.find(p => p.id === id));
    const fresh = tmp.firstElementChild;
    row.className = fresh.className;
    [...row.children].forEach((cell, i) => { if (!cell.matches('label') && !cell.classList.contains('pn-cost__warn') && fresh.children[i]) cell.innerHTML = fresh.children[i].innerHTML; });
    $('.pn-cost__warn', row)?.remove();
    const w = $('.pn-cost__warn', fresh); if (w) row.appendChild(w);
    bar();
  }
  async function savePrices() {
    const ids = Object.keys(dirty); if (!ids.length || $$('#priceList .is-bad').length) return;
    const btn = $('#priceSave'); btn.disabled = true;
    try {
      const j = await api({ accion: 'vendedorPrecios', codigo: cred.codigo, pin: cred.pin, precios: dirty });
      if (!j.ok) { if (ERR[j.error]) { logout(ERR[j.error]); return; } throw new Error(j.error); }
      const fallaron = new Set(j.errores || []);
      ids.forEach(id => { if (!fallaron.has(id)) { data.precios[id] = dirty[id]; delete dirty[id]; } });
      renderPrices(); renderTop(); renderPhotos();
      toast(fallaron.size ? `${fallaron.size} ${fallaron.size === 1 ? 'precio no se guardó' : 'precios no se guardaron'}: revisa el mínimo` : 'Precios guardados: tus clientes ya los ven');
    } catch (e) {
      toast('No se pudo guardar. Intenta de nuevo.');
    } finally { bar(); }
  }
  function renderSales() {
    const peds = data.pedidos || [];
    $('#sales').innerHTML = peds.map(p => {
      const d = toDate(p.fecha);
      const g = Number(p.ganancia) || 0;
      const st = p.estado === 'Cancelado' ? 'Sin ganancia' : p.estado !== 'Entregado' ? `Ganarás ${fmt(g)}` : isPaid(p) ? `Cobrado ${fmt(g)}` : `Por cobrar ${fmt(g)}`;
      return `<div class="pn-row pn-row--static">
        <span class="c-num"><span class="mono num">${esc(p.numero)}</span><br><span class="mono muted">${d ? dfDay.format(d) + ' · ' + dfTime.format(d) : ''}</span></span>
        <span class="c-cli"><span class="serif">${esc(p.cliente || 'Cliente')}</span><br><span class="mono muted">${esc(p.ciudad || '')}</span></span>
        <span class="c-prod pn-prod">${esc(p.productos || '')}</span>
        <span class="c-tot mono num">${fmt(p.subtotal)}<br><span class="${p.estado === 'Entregado' && !isPaid(p) ? 'pn-due' : 'muted'}">${st}</span></span>
        <span class="c-st"><span class="pill" data-e="${esc(p.estado)}">${esc(p.estado)}</span></span>
        <span class="c-go" aria-hidden="true"></span>
      </div>`;
    }).join('');
    $('#salesEmpty').hidden = peds.length > 0;
  }

  /* ---------- fotos para compartir ---------- */
  const NEW_TAGS = ['Nuevo', 'Tendencia', 'Edición especial', 'Colaboración'];
  const FILTERS = [['todos', 'Todos'], ['nuevos', 'Nuevos'], ['Hombre', 'Hombre'], ['Mujer', 'Mujer'], ['Niños', 'Niños'], ['chanclas', 'Chanclas']];
  const fullName = p => (norm(p.nombre).startsWith(norm(p.marca)) || /^air jordan/i.test(p.nombre)) ? p.nombre : `${p.marca} ${p.nombre}`;
  const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const ph = { q: '', f: 'todos', sel: new Set(), pending: null };
  const isCOD = p => !!p.contraentrega;
  const salePrice = p => { const mine = Number(data.precios[p.id]) || 0; return { v: mine || p.precio, mine: !!mine }; };
  const productLink = p => `${SITE}/productos/${p.slug}.html?ref=${data.vendedor.codigo}`;
  const tallas = p => (p.tallas.length ? `${p.tallas[0]} a la ${p.tallas[p.tallas.length - 1]}` : '');
  const shareText = p => `👟 ${fullName(p)} · ${p.color}` +
    (p.colores?.length ? `\nColores: ${p.colores.map(c => c.nombre).join(', ')}` : '') +
    `\nTallas: ${tallas(p)}\nPrecio: ${fmt(salePrice(p).v)}\n${isCOD(p) ? 'Pagas contraentrega' : 'Pago anticipado por transferencia'} · envíos a toda Colombia\nPídelo aquí 👉 ${productLink(p)}`;
  const matches = p => {
    if (p.agotado) return false;
    const f = ph.f;
    if (f === 'nuevos' && !NEW_TAGS.includes(p.etiqueta)) return false;
    if (f === 'chanclas' && p.etiqueta !== 'Chanclas') return false;
    if (['Hombre', 'Mujer'].includes(f) && !(p.genero === f || p.genero === 'Unisex')) return false;
    if (f === 'Niños' && p.genero !== 'Niños') return false;
    const terms = norm(ph.q).trim().split(/\s+/).filter(Boolean);
    const h = norm(`${fullName(p)} ${p.marca} ${p.color} ${(p.colores || []).map(c => c.nombre).join(' ')}`);
    return terms.every(t => h.includes(t));
  };
  const visible = () => PRODUCTS.filter(matches);
  function phCard(p) {
    const s = salePrice(p), on = ph.sel.has(p.id);
    return `<article class="ph${on ? ' is-sel' : ''}" data-id="${esc(p.id)}">
      <label class="ph__pick"><input type="checkbox"${on ? ' checked' : ''} aria-label="Elegir ${esc(fullName(p))}"></label>
      ${p.imagenes.length > 1 ? `<span class="ph__n mono">${p.imagenes.length} fotos</span>` : ''}
      <div class="ph__img"><img src="${esc(p.imagenes[0])}" alt="${esc(fullName(p))}" loading="lazy" width="520" height="650"></div>
      <div class="ph__body">
        <p class="mono muted">${esc(p.marca)}</p>
        <p class="serif ph__name">${esc(p.nombre)}</p>
        <p class="mono muted">${esc(p.colores?.length ? `${p.colores.length} colores` : p.color)} · ${tallas(p)}</p>
        <p class="ph__price">${fmt(s.v)} <small>${s.mine ? 'tu precio' : 'precio tienda'}</small></p>
        <div class="ph__btns"><button class="btn btn--sm" type="button" data-act="share">Compartir</button><button class="chip mono" type="button" data-act="dl">Fotos</button><button class="chip mono" type="button" data-act="copy">Texto</button></div>
      </div>
    </article>`;
  }
  function renderPhotos() {
    $('#phChips').innerHTML = FILTERS.map(([k, l]) => `<button type="button" class="chip mono${ph.f === k ? ' is-on' : ''}" data-f="${k}" aria-pressed="${ph.f === k}">${l}</button>`).join('');
    const list = visible();
    $('#phGrid').innerHTML = list.map(phCard).join('') || '<div class="empty"><p class="s-md">Sin <em>resultados</em></p><p>Prueba con otra búsqueda.</p></div>';
    $('#phCount').textContent = `${list.length} ${list.length === 1 ? 'modelo' : 'modelos'}`;
    phBar();
  }
  function phBar() {
    const n = ph.sel.size;
    $('#phBar').hidden = !n;
    $('#phSel').textContent = `${n} ${n === 1 ? 'elegido' : 'elegidos'}${n > 20 ? ' · se comparten de a 20' : ''}`;
  }
  const blobs = new Map();
  const getBlob = src => { if (!blobs.has(src)) blobs.set(src, fetch(src).then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })); return blobs.get(src); };
  const fileName = (p, i) => `${slug(`${fullName(p)} ${p.color}`)}${i ? '-' + (i + 1) : ''}.jpg`;
  async function payload(list, todas) {
    const pairs = todas ? list[0].imagenes.map((src, i) => [list[0], src, i]) : list.map(p => [p, p.imagenes[0], 0]);
    const files = await Promise.all(pairs.slice(0, 20).map(async ([p, src, i]) => { const b = await getBlob(src); return new File([b], fileName(p, i), { type: b.type || 'image/jpeg' }); }));
    return { files, text: list.slice(0, 20).map(shareText).join('\n\n') };
  }
  function downloadFiles(files) {
    files.forEach((f, i) => setTimeout(() => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, i * 350));
  }
  async function share(list, todas, key) {
    try {
      const pl = ph.pending && ph.pending.key === key ? ph.pending : { ...(await payload(list, todas)), key };
      if (navigator.canShare && navigator.share && navigator.canShare({ files: pl.files })) {
        try { await navigator.share({ files: pl.files, text: pl.text }); ph.pending = null; }
        catch (e) {
          if (e.name === 'NotAllowedError') { ph.pending = pl; toast('Listo: toca Compartir otra vez'); }
          else if (e.name !== 'AbortError') throw e;
        }
      } else {
        downloadFiles(pl.files);
        copyText(pl.text, `${pl.files.length === 1 ? 'Foto descargada' : 'Fotos descargadas'} y texto copiado: pégalo en WhatsApp`);
      }
    } catch (e) { toast('No se pudo preparar la foto. Revisa tu conexión.'); }
  }
  let zipLib = null;
  const loadZip = () => zipLib || (zipLib = new Promise((ok, bad) => {
    if (window.JSZip) return ok(window.JSZip);
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload = () => ok(window.JSZip); s.onerror = () => { zipLib = null; bad(new Error('zip')); }; document.head.appendChild(s);
  }));
  async function zip(list, btn) {
    if (!list.length) return;
    const label = btn.innerHTML; btn.disabled = true;
    try {
      const JSZip = await loadZip(), z = new JSZip();
      let done = 0;
      for (const p of list) {
        z.file(`${slug(p.marca)}/${fileName(p, 0)}`, await getBlob(p.imagenes[0]));
        btn.textContent = `Preparando ${++done} de ${list.length}…`;
      }
      z.file('precios-y-enlaces.txt', list.map(shareText).join('\n\n'));
      const out = await z.generateAsync({ type: 'blob' });
      downloadFiles([new File([out], `obsidian-fotos-${data.vendedor.codigo}.zip`, { type: 'application/zip' })]);
      toast('ZIP descargado: adentro van las fotos y un archivo con tus precios y enlaces');
    } catch (e) { toast('No se pudo armar el ZIP. Intenta de nuevo.'); }
    finally { btn.disabled = false; btn.innerHTML = label; }
  }
  function onPhotoClick(e) {
    const chip = e.target.closest('[data-f]');
    if (chip) { ph.f = chip.dataset.f; renderPhotos(); return; }
    const card = e.target.closest('.ph'); if (!card) return;
    const p = PRODUCTS.find(x => x.id === card.dataset.id);
    const pick = e.target.closest('.ph__pick input');
    if (pick) { if (pick.checked) ph.sel.add(p.id); else ph.sel.delete(p.id); card.classList.toggle('is-sel', pick.checked); phBar(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'share') share([p], true, 'uno:' + p.id);
    else if (act === 'dl') payload([p], true).then(pl => { downloadFiles(pl.files); toast(`${pl.files.length === 1 ? 'Foto descargada' : pl.files.length + ' fotos descargadas'}`); }).catch(() => toast('No se pudieron descargar las fotos.'));
    else if (act === 'copy') copyText(shareText(p), 'Texto copiado con tu precio y tu enlace');
  }
  const selected = () => PRODUCTS.filter(p => ph.sel.has(p.id));

  function setTab(t) {
    $$('.pn-tabs [data-tab]').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on); });
    $('#tabFotos').hidden = t !== 'fotos'; $('#tabPrecios').hidden = t !== 'precios'; $('#tabVentas').hidden = t !== 'ventas';
  }

  /* ---------- eventos ---------- */
  $('#loginForm').addEventListener('submit', e => {
    e.preventDefault();
    enter({ codigo: cleanCode($('#codigo').value), pin: $('#pin').value.replace(/\D/g, '') }, $('#recordar').checked);
  });
  $('#pin').addEventListener('input', () => { $('#pin').value = $('#pin').value.replace(/\D/g, '').slice(0, 8); });
  $('#refreshBtn').addEventListener('click', () => load(false));
  $('#logoutBtn').addEventListener('click', () => logout(''));
  $('#copyLink').addEventListener('click', () => copyText($('#vLink').value, 'Enlace copiado'));
  $('#priceList').addEventListener('input', onPriceInput);
  $('#priceSave').addEventListener('click', savePrices);
  $('#tabFotos').addEventListener('click', onPhotoClick);
  $('#phQ').addEventListener('input', e => { ph.q = e.target.value; renderPhotos(); });
  $('#phShare').addEventListener('click', () => { const l = selected(); share(l, false, 'sel:' + l.map(p => p.id).join(',')); });
  $('#phZip').addEventListener('click', e => zip(selected(), e.currentTarget));
  $('#phZipAll').addEventListener('click', e => zip(visible(), e.currentTarget));
  $('#phClear').addEventListener('click', () => { ph.sel.clear(); renderPhotos(); });
  document.addEventListener('click', e => { const tb = e.target.closest('[data-tab]'); if (tb) setTab(tb.dataset.tab); });
  addEventListener('beforeunload', e => { if (Object.keys(dirty).length) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && cred) load(true); });

  /* ---------- arranque ---------- */
  const qs = new URLSearchParams(location.search);
  const saved = keep.get();
  if (qs.get('codigo')) $('#codigo').value = cleanCode(qs.get('codigo'));
  if (saved && saved.codigo && saved.pin) { $('#codigo').value = saved.codigo; enter(saved, true); }
  else view('login');
})();
