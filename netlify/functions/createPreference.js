const { MercadoPagoConfig, Preference } = require("mercadopago");
const { getFirebaseAdmin } = require("../lib/firebaseAdmin");

const catalogo = {
  // CALZADO
  "Velocity Aura": 48000,
  "Apex Trainer": 52000,
  "Terra Shift": 46000,
  "Pulse Flow": 50000,
  "Endurance X": 56000,
  "Motion Core": 49000,
  "Strike Phantom": 62000,
  "Nova Control": 59000,
  "Field Pro X": 64000,
  "Court Elevate": 68000,
  "Court Pulse": 65000,
  "Hoop Dynamic": 70000,

  // INDUMENTARIA
  "Core Motion Hoodie": 44000,
  "Flex Sculpt Legging": 38000,
  "Storm Active Jacket": 58000,
  "Urban Performance Jacket": 54000,
  "Aero Shield Jacket": 62000,
  "Motion Track Pant": 42000,
  "Performance Dry Tee": 29000,
  "Pulse Fit Tee": 29000,
  "Thermal Pro Base": 36000,
  "Thermal Flex Base": 36000,
  "Sprint Training Short": 31000,
  "Core Support Top": 32000,

  // EQUIPAMIENTO
  "Hydra Thermal 750": 24000,
  "Shield Pro Guard": 28000,
  "Aero Ride Helmet": 52000,
  "Impact Pro Gloves": 46000,
  "Flex Resistance Kit": 32000,
  "Power Adjust Dumbbell": 69000,
  "Balance Training Mat": 27000,
  "Active Gear Backpack": 43000,
  "Court Control Ball": 31000,
  "Core Power Kettlebell": 74000,
  "Precision Court Pro": 58000,
  "Run Belt Motion": 22000
};

exports.handler = async (event) => {
  const headersCORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: headersCORS, body: "" };
  }

  try {

  const authHeader =
  event.headers.authorization ||
  event.headers.Authorization;

if (!authHeader || !authHeader.startsWith("Bearer ")) {
  return {
    statusCode: 401,
    headers: headersCORS,
    body: JSON.stringify({
      error: "Usuario no autenticado"
    })
  };
}

const idToken = authHeader.substring(7);

const { auth, db } = getFirebaseAdmin();

let usuarioVerificado;

try {
  usuarioVerificado = await auth.verifyIdToken(idToken);
} catch (error) {
  return {
    statusCode: 401,
    headers: headersCORS,
    body: JSON.stringify({
      error: "Sesión inválida o vencida"
    })
  };
}

    const client = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN
    });

    const preference = new Preference(client);

    const datos = JSON.parse(event.body || "{}");
    const carrito = datos.carrito || [];

    if (!Array.isArray(carrito) || carrito.length === 0) {
  return {
    statusCode: 400,
    headers: headersCORS,
    body: JSON.stringify({ error: "El carrito está vacío" })
  };
}

const items = carrito.map(function(producto) {
  const precioReal = catalogo[producto.nombre];

  if (!precioReal) {
    throw new Error("Producto no válido: " + producto.nombre);
  }

  const cantidad = Number(producto.cantidad);

  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 10) {
    throw new Error("Cantidad no válida para: " + producto.nombre);
  }

  return {
    title: producto.nombre,
    quantity: cantidad,
    unit_price: precioReal,
    currency_id: "ARS"
  };
});

const totalOrden = items.reduce(function(total, item) {
  return total + item.unit_price * item.quantity;
}, 0);

const itemsOrden = items.map(function(item) {
  return {
    nombre: item.title,
    cantidad: item.quantity,
    precio: item.unit_price
  };
});

const ordenRef = db.collection("compras").doc();

const result = await preference.create({
  body: {
    items: items,
    external_reference: ordenRef.id,
    back_urls: {
      success: "https://tienda-deportiva-b14c3.web.app/success.html",
      failure: "https://tienda-deportiva-b14c3.web.app/failure.html",
      pending: "https://tienda-deportiva-b14c3.web.app/pending.html"
    },
    auto_return: "approved"
  }
});

await ordenRef.set({
  usuarioUid: usuarioVerificado.uid,
  usuarioEmail: usuarioVerificado.email || null,
  items: itemsOrden,
  total: totalOrden,
  estado: "pending_payment",
  mercadoPagoPreferenceId: result.id,
  mercadoPagoPaymentId: null,
  fecha: new Date()
});

return {
  statusCode: 200,
  headers: headersCORS,
  body: JSON.stringify({
    id: result.id,
    init_point: result.init_point
  })
};

  } catch (error) {
    console.error("Error al crear la preferencia:", error);
    return {
      statusCode: 500,
      headers: headersCORS,
      body: JSON.stringify({ error: "No se pudo crear la preferencia de pago" })
    };
  }
};