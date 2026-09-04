const { MercadoPagoConfig, Preference } = require("mercadopago");

exports.handler = async (event) => {
  const headersCORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: headersCORS, body: "" };
  }

  try {
    const client = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN
    });

    const preference = new Preference(client);

    const datos = JSON.parse(event.body || "{}");
    const carrito = datos.carrito || [];

    const items = carrito.map(function(producto) {
      return {
        title: producto.nombre,
        quantity: producto.cantidad,
        unit_price: producto.precio,
        currency_id: "ARS"
      };
    });

    const result = await preference.create({
      body: {
        items: items,
        back_urls: {
          success: "https://tienda-deportiva-b14c3.web.app/success.html",
          failure: "https://tienda-deportiva-b14c3.web.app/failure.html",
          pending: "https://tienda-deportiva-b14c3.web.app/pending.html"
        },
        auto_return: "approved"
      }
    });

    return {
      statusCode: 200,
      headers: headersCORS,
      body: JSON.stringify({ id: result.id, init_point: result.init_point })
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