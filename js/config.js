/* ============================================================
 *  OBSIDIAN — configuración de la tienda
 *  Edita solo este archivo para cambiar tus datos de contacto.
 * ============================================================ */
window.OBSIDIAN_CONFIG = {
  marca: 'OBSIDIAN',
  dominio: 'obsidiancol.shop',

  // Número de WhatsApp que recibe los pedidos: código de país + número, sin "+" ni espacios.
  // Ejemplo Colombia: '573001234567'. Si lo dejas vacío, WhatsApp le pedirá al cliente elegir el contacto.
  whatsapp: '573192559674',

  // Redes (déjalas vacías para ocultarlas)
  instagram: 'https://www.instagram.com/obsidian.col/',
  instagramUser: '@obsidian.col',
  tiktok: 'https://www.tiktok.com/@obsidiancol.shop',
  tiktokUser: '@obsidiancol.shop',
  email: '',          // ej: 'hola@obsidiancol.shop'

  ciudad: 'Colombia',

  // Sistema de pedidos (Google Sheets). Pega aquí la URL de tu Apps Script (termina en /exec).
  // Instrucciones en herramientas/pedidos-google-apps-script.gs. Vacío = los pedidos solo llegan por WhatsApp.
  pedidosApi: 'https://script.google.com/macros/s/AKfycbza702qJ3pv81ozSRvWaBb-mrI-DpzhCkIVLYxgH3iC3CGw9wTN14m__iQkjnSdYuKK/exec',

  // Referidos: días que se recuerda el código de un enlace como obsidiancol.shop/?ref=juan
  referidoDias: 30,

  // Suma este valor (COP) al precio de cada par. Útil si revendes con margen.
  aumentoPrecio: 0,

  // Textos de la promesa de compra (ajústalos a lo que acordaste con tu proveedor)
  pago: 'AF1 Triple White contraentrega',
  pagoDetalle: 'Los Air Force 1 Triple White los pagas cuando te llegan. Los demás modelos se pagan por adelantado, por transferencia: te mandamos los datos por WhatsApp y despachamos apenas confirmemos el pago.',
  // Qué modelos se pagan contraentrega se marca en js/productos.js con "contraentrega": true.
  envio: 'Envíos a toda Colombia',
  envioDetalle: 'El costo del envío depende de tu ciudad y te lo confirmamos por WhatsApp antes de despachar.',
  cambios: 'Cambios de talla',
  cambiosDetalle: '¿No te quedó? Escríbenos por WhatsApp y te ayudamos con el cambio de talla.',
};
