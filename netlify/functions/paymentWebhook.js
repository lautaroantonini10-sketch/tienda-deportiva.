exports.handler = async (event) => {
  // Mercado Pago debe llamar a esta función mediante POST.
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({
        error: "Método no permitido"
      })
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    console.log("Webhook de Mercado Pago recibido:", {
      type: body.type,
      action: body.action,
      dataId: body.data?.id
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        received: true
      })
    };

  } catch (error) {
    console.error("Error procesando webhook:", error);

    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Notificación inválida"
      })
    };
  }
};