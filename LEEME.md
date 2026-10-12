# OBSIDIAN — tienda de sneakers + panel de pedidos

Sitio estático (HTML, CSS y JS) con 52 páginas, publicado en **https://obsidiancol.shop**. Los pedidos se registran en tu hoja de Google Sheets **OBSIDIAN Pedidos**, los ves en tu panel privado y te llegan por WhatsApp al 319 255 9674. El cliente paga contraentrega.

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Tienda | https://obsidiancol.shop |
| Panel de pedidos | https://obsidiancol.shop/panel.html |
| Hoja de pedidos | Google Sheets → "OBSIDIAN Pedidos" (cuenta rooneyagamez0@gmail.com) |
| Código del sitio | github.com/estroncri/obsidiancol (GitHub Pages lo publica solo) |
| Dominio | Hostinger → obsidiancol.shop → DNS: 4 registros A a GitHub (185.199.108–111.153) y `www` → estroncri.github.io |

Si algún día quieres volver a Shopify, los registros DNS anteriores eran: A `@` → 23.227.38.65 y CNAME `www` → shops.myshopify.com.

## Páginas

| Página | Archivo |
|---|---|
| Inicio | `index.html` |
| Tienda (catálogo con búsqueda, filtros y vista galería o índice) | `tienda.html` |
| Novedades, Hombre, Mujer | `novedades.html`, `hombre.html`, `mujer.html` |
| Cada producto (21) | `productos/<nombre>.html` |
| Colecciones y cada colección (4) | `colecciones.html`, `colecciones/<nombre>.html` |
| Marcas y cada marca (7) | `marcas.html`, `marcas/<nombre>.html` |
| Lookbook, Nosotros | `lookbook.html`, `nosotros.html` |
| Ayuda | `como-comprar.html`, `envios.html`, `pagos.html`, `cambios.html`, `guia-de-tallas.html`, `preguntas-frecuentes.html`, `contacto.html`, `privacidad.html` |
| Bolsa y pedido | `carrito.html` |
| Panel privado | `panel.html` (no aparece en el menú ni en Google) |

## Clave del panel

Abre la hoja **OBSIDIAN Pedidos** en Google Sheets (en el computador) → menú **OBSIDIAN** → **Definir clave del panel**. La primera vez Google te pedirá permiso para mostrar ese cuadro; acéptalo. Con esa clave entras a obsidiancol.shop/panel.html, también desde el celular.

## Cambiar datos — `js/config.js`

WhatsApp, Instagram, correo, margen sobre el precio (`aumentoPrecio`) y los textos de pago, envío y cambios.

## Productos — `js/productos.js`

Cambiar precios, textos o marcar `"agotado": true` no requiere nada más. Para **agregar o quitar** productos, edita el archivo, pon las fotos en `img/products/` y ejecuta:

```bash
node herramientas/generar-paginas.js
```

## Publicar cambios

Cualquier cambio que subas al repositorio se publica solo en unos minutos:

```bash
git add -A
```

```bash
git commit -m "Actualizo la tienda"
```

```bash
git push
```

## Revisa

Los textos de envíos, cambios, pagos y privacidad son una base. Confírmalos con tu proveedor y ajústalos.
