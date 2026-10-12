# OBSIDIAN — tienda de sneakers + panel de pedidos

Sitio estático (HTML, CSS y JS) con 52 páginas. Los pedidos se registran en tu Google Sheets, los ves en tu panel privado y le llegan al cliente por WhatsApp. El cliente paga contraentrega.

## Páginas

| Página | Archivo |
|---|---|
| Inicio | `index.html` |
| Tienda (todo el catálogo, con búsqueda, filtros y vista galería o índice) | `tienda.html` |
| Novedades, Hombre, Mujer | `novedades.html`, `hombre.html`, `mujer.html` |
| Cada producto (21) | `productos/<nombre>.html` |
| Colecciones y cada colección (4) | `colecciones.html`, `colecciones/<nombre>.html` |
| Marcas y cada marca (7) | `marcas.html`, `marcas/<nombre>.html` |
| Lookbook, Nosotros | `lookbook.html`, `nosotros.html` |
| Ayuda | `como-comprar.html`, `envios.html`, `pagos.html`, `cambios.html`, `guia-de-tallas.html`, `preguntas-frecuentes.html`, `contacto.html`, `privacidad.html` |
| Bolsa y pedido | `carrito.html` |
| Panel privado de pedidos | `panel.html` (no aparece en el menú ni en Google) |
| Página de error | `404.html` |

## 1. Tus datos — `js/config.js`

- `whatsapp`: tu número con código de país, sin espacios (ej. `'573001234567'`).
- `instagram`, `instagramUser`, `tiktok`, `email`: vacíos = no aparecen.
- `pedidosApi`: la URL de tu hoja de pedidos (paso 3).
- `aumentoPrecio`: pesos que se suman a cada par (tu margen sobre el precio del proveedor).
- Textos de pago, envío y cambios: ajústalos a lo que acordaste con tu proveedor.

## 2. Productos — `js/productos.js`

Cambiar precios, textos o marcar `"agotado": true` no requiere nada más.

Para **agregar o quitar** un producto: edita el archivo (las instrucciones están arriba en él), pon las fotos en `img/products/` y ejecuta:

```bash
node herramientas/generar-paginas.js
```

Eso vuelve a crear todas las páginas, incluidas la del producto nuevo, su marca y su colección.

## 3. Panel de pedidos (Google Sheets)

1. Abre `herramientas/pedidos-google-apps-script.gs` y sigue los pasos del comienzo (unos 5 minutos). Ahí eliges la **clave** de tu panel.
2. Pega la URL que te da Google (termina en `/exec`) en `js/config.js` → `pedidosApi`.
3. Entra a `obsidiancol.store/panel.html` con tu clave.

Cada pedido llega a la pestaña **Pedidos** de tu hoja y aparece en el panel con estado *Nuevo*. Desde el panel ves los datos del cliente, le escribes por WhatsApp, cambias el estado (Nuevo, Confirmado, Enviado, Entregado, Cancelado) y dejas notas internas. Todo se guarda en la hoja. Si no configuras `pedidosApi`, la tienda sigue funcionando y los pedidos llegan solo por WhatsApp.

## 4. Publicar en obsidiancol.store

Opción fácil (Netlify): entra a app.netlify.com/drop, arrastra la carpeta `obsidian` y luego, en *Domain management*, agrega `obsidiancol.store` y sigue las instrucciones de DNS que te muestre.

Opción GitHub Pages: sube esta carpeta a un repositorio, activa Pages y apunta el dominio. El archivo `CNAME` ya trae `obsidiancol.store`.

## Revisa antes de publicar

Los textos de envíos, cambios, pagos y privacidad son una base. Confírmalos con tu proveedor y ajústalos a cómo trabajas.

## Probarlo en tu computador

```bash
python -m http.server 5173 --directory obsidian
```

Luego abre http://localhost:5173
