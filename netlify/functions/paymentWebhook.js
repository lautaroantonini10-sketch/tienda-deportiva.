const {
  MercadoPagoConfig,
  Payment,
  WebhookSignatureValidator,
  InvalidWebhookSignatureError
} = require("mercadopago");

const { getFirebaseAdmin } = require("../lib/firebaseAdmin");


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

    const client = new MercadoPagoConfig({
     accessToken: process.env.MP_ACCESS_TOKEN
});

    const paymentClient = new Payment(client);

    const payment = await paymentClient.get({
     id: dataId
});

    console.log("Pago consultado en Mercado Pago:", {
     id: payment.id,
     status: payment.status,
     statusDetail: payment.status_detail,
     transactionAmount: payment.transaction_amount
});

    const externalReference = payment.external_reference;

if (!externalReference) {
  console.log("Pago sin external_reference. Se ignora.");

  return {
    statusCode: 200,
    body: JSON.stringify({
      received: true,
      ignored: "missing_external_reference"
    })
  };
}

const { db } = getFirebaseAdmin();

const ordenRef = db.collection("compras").doc(externalReference);
const ordenDoc = await ordenRef.get();

if (!ordenDoc.exists) {
  console.warn(
    "No existe una orden para external_reference:",
    externalReference
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      received: true,
      ignored: "order_not_found"
    })
  };
}

const orden = ordenDoc.data();

const montoPago = Number(payment.transaction_amount);
const montoOrden = Number(orden.total);

if (montoPago !== montoOrden) {
  console.error("El monto del pago no coincide con la orden:", {
    montoPago,
    montoOrden,
    externalReference
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      received: true,
      ignored: "amount_mismatch"
    })
  };
}

if (
  payment.status === "approved" &&
  payment.status_detail === "accredited"
) {
  await ordenRef.update({
    estado: "approved",
    mercadoPagoPaymentId: String(payment.id),
    fechaPago: new Date()
  });

  console.log("Orden aprobada en Firestore:", {
    ordenId: externalReference,
    paymentId: payment.id
  });
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