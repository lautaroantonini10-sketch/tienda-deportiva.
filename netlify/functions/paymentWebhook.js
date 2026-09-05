const {
  WebhookSignatureValidator,
  InvalidWebhookSignatureError
} = require("mercadopago");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({
        error: "Método no permitido"
      })
    };
  }

  try {
    const xSignature = event.headers["x-signature"];
    const xRequestId = event.headers["x-request-id"];

    const dataId =
      event.queryStringParameters?.["data.id"] ||
      event.queryStringParameters?.data_id;

    const secret = process.env.MP_WEBHOOK_SECRET;

    console.log("Diagnóstico webhook:", {
  tieneXSignature: Boolean(xSignature),
  tieneXRequestId: Boolean(xRequestId),
  queryParams: event.queryStringParameters || {},
  tieneDataId: Boolean(dataId),
  tieneSecret: Boolean(secret)
});

    if (!xSignature || !xRequestId || !dataId || !secret) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Faltan datos para validar la notificación"
        })
      };
    }

    try {
      WebhookSignatureValidator.validate({
        xSignature,
        xRequestId,
        dataId,
        secret
      });
    } catch (error) {
      if (error instanceof InvalidWebhookSignatureError) {
        console.warn("Webhook rechazado: firma inválida");

        return {
          statusCode: 401,
          body: JSON.stringify({
            error: "Firma inválida"
          })
        };
      }

      throw error;
    }

    const body = JSON.parse(event.body || "{}");

    console.log("Webhook válido recibido:", {
      type: body.type,
      action: body.action,
      dataId
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
      statusCode: 500,
      body: JSON.stringify({
        error: "Error interno"
      })
    };
  }
};