# OBSIDIAN — tienda de sneakers + panel de pedidos

Sitio estático (HTML, CSS y JS) con 118 páginas, publicado en **https://obsidiancol.shop**. Los pedidos se registran en tu hoja de Google Sheets **OBSIDIAN Pedidos**, los ves en tu panel privado y te llegan por WhatsApp al 319 255 9674. Solo 4 pares se pagan contraentrega: Air Force 1 Triple White, Numeris azul, Numeris negro y Superstar negro de dama con logo dorado (marcados con `"contraentrega": true` en `js/productos.js`; sus nombres para los textos están en `contraentregaModelos` de `js/config.js`). Los demás modelos, por adelantado.

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Tienda | https://obsidiancol.shop |
| Panel de pedidos | https://obsidiancol.shop/panel.html |
| Portal de vendedores | https://obsidiancol.shop/vendedores.html |
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
| Portal de vendedores | `vendedores.html` (no aparece en el menú ni en Google) |

## Clave del panel

Abre la hoja **OBSIDIAN Pedidos** en Google Sheets (en el computador) → menú **OBSIDIAN** → **Definir clave del panel**. La primera vez Google te pedirá permiso para mostrar ese cuadro; acéptalo. Con esa clave entras a obsidiancol.shop/panel.html, también desde el celular.

## Vendedores (trabajadores con su propio precio)

Ejemplo con el Air Force 1: al proveedor le pagas **$90.000** (te cuesta), al vendedor se lo das en **$100.000** (precio vendedor) y él lo vende al precio que quiera, por ejemplo $140.000. Él gana $40.000 y tú $10.000.

1. **Costos** (pestaña del panel): escribe en cada modelo cuánto te cuesta y cuál es el precio vendedor. Solo tú ves esta tabla; los modelos sin precio vendedor no aparecen para los vendedores. Si tienes la lista en un archivo CSV (columnas `producto;costo;precio_vendedor`), usa **Importar CSV** en esa misma pestaña y luego **Guardar costos**. Ese archivo nunca va en la carpeta del sitio: el repositorio es público.
2. **Vendedores** (pestaña del panel): escribe nombre y celular. Se crea su código, su enlace (`https://obsidiancol.shop/?ref=juan`) y un PIN de 6 números. Mándale todo con el botón **Enviar acceso por WhatsApp**.
3. El vendedor entra a **obsidiancol.shop/vendedores.html** con su código y PIN, pone su precio en cada modelo (nunca por debajo del precio vendedor) y ve sus ventas y lo que ha ganado.
4. Quien entra por su enlace ve **los precios de ese vendedor** durante 30 días (`referidoDias` en `js/config.js`). Sin enlace, la tienda muestra el precio normal. El pedido llega con el vendedor en la hoja, en el panel y en el mensaje de WhatsApp.
5. La ganancia del vendedor se vuelve "por pagar" cuando marcas el pedido como **Entregado**. Cuando le pagues, toca "Marcar como pagado" y queda la fecha.
6. Si un cliente te dice que lo atendió un vendedor, abre el pedido en el panel y asígnale el código a mano.

En la hoja de Google quedan las pestañas **Pedidos**, **Vendedores**, **Costos** y **PreciosVendedores**. Cada pedido guarda la ganancia del vendedor y la tuya.

## Reseñas de clientes

Al final de todas las páginas hay una sección **Reseñas**. Los clientes ponen estrellas, su opinión, hasta 4 fotos y un video (máx. 20 MB). Todo llega a la pestaña **Reseñas** del panel como *Por revisar*; en la página no aparece nada hasta que le das **Publicar**. **Ocultar** la quita.

- Las reseñas quedan en la hoja (pestaña `Resenas`) y las fotos y videos en tu Google Drive, carpeta **OBSIDIAN reseñas (fotos y videos)**. Son privados hasta que publicas la reseña.
- En la página solo se ve el nombre con la inicial del apellido y la ciudad. El número de pedido o celular que deja el cliente solo lo ves tú, para comprobar que compró.
- El script usa el servicio avanzado **Drive API** con el permiso `drive.file` (solo los archivos que él crea). Ver `herramientas/appsscript.json`.
- Enlace directo para pedir reseñas por WhatsApp: `https://obsidiancol.shop/#escribir-resena` (abre el formulario).

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
