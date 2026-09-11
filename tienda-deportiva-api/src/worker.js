const FIREBASE_API_KEY = "AIzaSyBUbslhRu_N1KK6fD0jTYaf-_lAhRTjJh0";

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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

let googleTokenCache = null;


// ======================================================
// RESPUESTAS
// ======================================================

function responderJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json"
    }
  });
}


// ======================================================
// BASE64 / CRYPTO
// ======================================================

function decodificarBase64UTF8(base64) {
  const limpio = base64.replace(/\s/g, "");
  const binario = atob(limpio);

  const bytes = Uint8Array.from(
    binario,
    caracter => caracter.charCodeAt(0)
  );

  return new TextDecoder().decode(bytes);
}

function base64UrlDesdeBytes(bytes) {
  let binario = "";

  for (const byte of bytes) {
    binario += String.fromCharCode(byte);
  }

  return btoa(binario)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDesdeTexto(texto) {
  return base64UrlDesdeBytes(
    new TextEncoder().encode(texto)
  );
}

function pemAArrayBuffer(pem) {
  const base64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binario = atob(base64);

  const bytes = Uint8Array.from(
    binario,
    caracter => caracter.charCodeAt(0)
  );

  return bytes.buffer;
}


// ======================================================
// GOOGLE / FIREBASE ADMIN REST
// ======================================================

async function obtenerGoogleAccessToken(env) {
  if (
    googleTokenCache &&
    Date.now() < googleTokenCache.expira
  ) {
    return googleTokenCache;
  }

  const serviceAccount = JSON.parse(
    decodificarBase64UTF8(
      env.FIREBASE_SERVICE_ACCOUNT_BASE64
    )
  );

  const ahora = Math.floor(Date.now() / 1000);

  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: ahora,
    exp: ahora + 3600
  };

  const parteHeader = base64UrlDesdeTexto(
    JSON.stringify(header)
  );

  const partePayload = base64UrlDesdeTexto(
    JSON.stringify(payload)
  );

  const contenidoFirmar =
    parteHeader + "." + partePayload;

  const clavePrivada =
    await crypto.subtle.importKey(
      "pkcs8",
      pemAArrayBuffer(serviceAccount.private_key),
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256"
      },
      false,
      ["sign"]
    );

  const firma = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    clavePrivada,
    new TextEncoder().encode(contenidoFirmar)
  );

  const jwt =
    contenidoFirmar +
    "." +
    base64UrlDesdeBytes(
      new Uint8Array(firma)
    );

  const respuesta = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type:
          "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt
      })
    }
  );

  const data = await respuesta.json();

  if (!respuesta.ok || !data.access_token) {
    throw new Error(
      "No se pudo autenticar con Google"
    );
  }

  googleTokenCache = {
    token: data.access_token,
    projectId: serviceAccount.project_id,
    expira:
      Date.now() +
      ((Number(data.expires_in) || 3600) - 60) * 1000
  };

  return googleTokenCache;
}


// ======================================================
// FIREBASE AUTH
// ======================================================

async function validarUsuarioFirebase(idToken) {
  const respuesta = await fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" +
      FIREBASE_API_KEY,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        idToken
      })
    }
  );

  if (!respuesta.ok) {
    return null;
  }

  const data = await respuesta.json();
  const usuario = data.users?.[0];

  if (!usuario || usuario.disabled) {
    return null;
  }

  return {
    uid: usuario.localId,
    email: usuario.email || null
  };
}


// ======================================================
// FIRESTORE - CREAR ORDEN
// ======================================================

async function guardarOrdenFirestore(
  env,
  ordenId,
  usuario,
  items,
  total,
  preferenceId
) {
  const google =
    await obtenerGoogleAccessToken(env);

  const url =
    "https://firestore.googleapis.com/v1/projects/" +
    encodeURIComponent(google.projectId) +
    "/databases/(default)/documents/compras" +
    "?documentId=" +
    encodeURIComponent(ordenId);

  const itemsFirestore = items.map(item => ({
    mapValue: {
      fields: {
        nombre: {
          stringValue: item.title
        },

        cantidad: {
          integerValue: String(item.quantity)
        },

        precio: {
          integerValue: String(item.unit_price)
        }
      }
    }
  }));

  const documento = {
    fields: {
      usuarioUid: {
        stringValue: usuario.uid
      },

      usuarioEmail: usuario.email
        ? {
            stringValue: usuario.email
          }
        : {
            nullValue: null
          },

      items: {
        arrayValue: {
          values: itemsFirestore
        }
      },

      total: {
        integerValue: String(total)
      },

      estado: {
        stringValue: "pending_payment"
      },

      mercadoPagoPreferenceId: {
        stringValue: String(preferenceId)
      },

      mercadoPagoPaymentId: {
        nullValue: null
      },

      fecha: {
        timestampValue:
          new Date().toISOString()
      }
    }
  };

  const respuesta = await fetch(url, {
    method: "POST",
    headers: {
      Authorization:
        "Bearer " + google.token,

      "Content-Type":
        "application/json"
    },

    body: JSON.stringify(documento)
  });

  if (!respuesta.ok) {
    const detalle =
      await respuesta.text();

    console.error(
      "Error Firestore:",
      respuesta.status,
      detalle
    );

    throw new Error(
      "No se pudo guardar la orden en Firestore"
    );
  }
}


// ======================================================
// FIRESTORE - LEER ORDEN
// ======================================================

async function obtenerOrdenFirestore(
  env,
  ordenId
) {
  const google =
    await obtenerGoogleAccessToken(env);

  const url =
    "https://firestore.googleapis.com/v1/projects/" +
    encodeURIComponent(google.projectId) +
    "/databases/(default)/documents/compras/" +
    encodeURIComponent(ordenId);

  const respuesta = await fetch(url, {
    headers: {
      Authorization:
        "Bearer " + google.token
    }
  });

  if (respuesta.status === 404) {
    return null;
  }

  if (!respuesta.ok) {
    const detalle =
      await respuesta.text();

    console.error(
      "Error leyendo orden:",
      respuesta.status,
      detalle
    );

    throw new Error(
      "No se pudo leer la orden"
    );
  }

  return await respuesta.json();
}


// ======================================================
// FIRESTORE - APROBAR ORDEN
// ======================================================

async function aprobarOrdenFirestore(
  env,
  ordenId,
  paymentId,
  updateTime
) {
  if (
    typeof updateTime !== "string" ||
    !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.(?:\d{3}|\d{6}|\d{9}))?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(updateTime)
  ) {
    throw new Error("updateTime inválido para aprobar la orden");
  }

  const google =
    await obtenerGoogleAccessToken(env);

  const base =
    "https://firestore.googleapis.com/v1/projects/" +
    encodeURIComponent(google.projectId) +
    "/databases/(default)/documents/compras/" +
    encodeURIComponent(ordenId);

  const url =
    base +
    "?updateMask.fieldPaths=estado" +
    "&updateMask.fieldPaths=mercadoPagoPaymentId" +
    "&updateMask.fieldPaths=fechaPago" +
    "&currentDocument.updateTime=" +
    encodeURIComponent(updateTime);

  const documento = {
    fields: {
      estado: {
        stringValue: "approved"
      },

      mercadoPagoPaymentId: {
        stringValue: String(paymentId)
      },

      fechaPago: {
        timestampValue:
          new Date().toISOString()
      }
    }
  };

  const respuesta = await fetch(url, {
    method: "PATCH",

    headers: {
      Authorization:
        "Bearer " + google.token,

      "Content-Type":
        "application/json"
    },

    body: JSON.stringify(documento)
  });

  if (!respuesta.ok) {
    const detalle =
      await respuesta.text();

    if (respuesta.status === 400) {
      let errorFirestore;
      try {
        errorFirestore = JSON.parse(detalle);
      } catch {
        errorFirestore = null;
      }

      if (errorFirestore?.error?.status === "FAILED_PRECONDITION") {
        return "precondition_failed";
      }
    }

    console.error(
      "Error aprobando orden:",
      respuesta.status,
      detalle
    );

    throw new Error(
      "No se pudo aprobar la orden"
    );
  }

  return "updated";
}


// ======================================================
// CREATE PREFERENCE
// ======================================================

async function crearPreferencia(
  request,
  env
) {
  const authHeader =
    request.headers.get("Authorization");

  if (
    !authHeader ||
    !authHeader.startsWith("Bearer ")
  ) {
    return responderJson(
      {
        error: "Usuario no autenticado"
      },
      401
    );
  }

  const idToken =
    authHeader.substring(7);

  const usuario =
    await validarUsuarioFirebase(idToken);

  if (!usuario) {
    return responderJson(
      {
        error: "Sesión inválida o vencida"
      },
      401
    );
  }

  let datos;

  try {
    datos = await request.json();
  } catch {
    return responderJson(
      {
        error: "Datos inválidos"
      },
      400
    );
  }

  if (
    typeof datos !== "object" ||
    datos === null ||
    Array.isArray(datos) ||
    !Array.isArray(datos.carrito)
  ) {
    return responderJson(
      {
        error: "Datos inválidos"
      },
      400
    );
  }

  const carrito =
    datos.carrito;

  if (
    !Array.isArray(carrito) ||
    carrito.length === 0
  ) {
    return responderJson(
      {
        error: "El carrito está vacío"
      },
      400
    );
  }

  const items = [];
  const cantidadesPorProducto = new Map();

  for (const producto of carrito) {
    if (
      typeof producto !== "object" ||
      producto === null ||
      Array.isArray(producto) ||
      typeof producto.nombre !== "string"
    ) {
      return responderJson(
        {
          error: "Producto no válido"
        },
        400
      );
    }

    if (!Object.hasOwn(catalogo, producto.nombre)) {
      return responderJson(
        {
          error:
            "Producto no válido: " +
            producto.nombre
        },
        400
      );
    }

    const precioReal =
      catalogo[producto.nombre];

    if (
      typeof precioReal !== "number" ||
      !Number.isFinite(precioReal) ||
      precioReal <= 0
    ) {
      return responderJson(
        {
          error: "Precio no válido para: " + producto.nombre
        },
        400
      );
    }

    const cantidad =
      producto.cantidad;

    if (
      typeof cantidad !== "number" ||
      !Number.isInteger(cantidad) ||
      cantidad < 1 ||
      cantidad > 10
    ) {
      return responderJson(
        {
          error:
            "Cantidad no válida para: " +
            producto.nombre
        },
        400
      );
    }

    const cantidadAcumulada =
      (cantidadesPorProducto.get(producto.nombre) || 0) + cantidad;

    if (cantidadAcumulada > 10) {
      return responderJson(
        {
          error: "Máximo 10 unidades por producto: " + producto.nombre
        },
        400
      );
    }

    cantidadesPorProducto.set(producto.nombre, cantidadAcumulada);

    items.push({
      title: producto.nombre,
      quantity: cantidad,
      unit_price: precioReal,
      currency_id: "ARS"
    });
  }

  const totalOrden =
    items.reduce(
      (total, item) =>
        total +
        item.unit_price *
          item.quantity,
      0
    );

  const ordenId =
    crypto.randomUUID();

  const respuestaMP =
    await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",

        headers: {
          Authorization:
            "Bearer " +
            env.MP_ACCESS_TOKEN,

          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          items,

          external_reference:
            ordenId,

          back_urls: {
            success:
              "https://tienda-deportiva-b14c3.web.app/success.html",

            failure:
              "https://tienda-deportiva-b14c3.web.app/failure.html",

            pending:
              "https://tienda-deportiva-b14c3.web.app/pending.html"
          },

          auto_return:
            "approved"
        })
      }
    );

  const resultadoMP =
    await respuestaMP.json();

  if (
    !respuestaMP.ok ||
    !resultadoMP.id ||
    !resultadoMP.init_point
  ) {
    console.error(
      "Error Mercado Pago:",
      respuestaMP.status,
      resultadoMP
    );

    throw new Error(
      "Mercado Pago no pudo crear la preferencia"
    );
  }

  await guardarOrdenFirestore(
    env,
    ordenId,
    usuario,
    items,
    totalOrden,
    resultadoMP.id
  );

  return responderJson({
    id: resultadoMP.id,
    init_point: resultadoMP.init_point
  });
}


// ======================================================
// WEBHOOK - FIRMA MERCADO PAGO
// ======================================================

function extraerFirma(xSignature) {
  const resultado = {};

  const partes =
    xSignature.split(",");

  for (const parte of partes) {
    const posicion =
      parte.indexOf("=");

    if (posicion === -1) {
      continue;
    }

    const clave =
      parte.slice(0, posicion).trim();

    const valor =
      parte.slice(posicion + 1).trim();

    resultado[clave] = valor;
  }

  return resultado;
}

function hexadecimal(bytes) {
  return Array.from(bytes)
    .map(byte =>
      byte
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}

function compararHashConstante(
  calculado,
  recibido
) {
  if (
    calculado.length !==
    recibido.length
  ) {
    return false;
  }

  let diferencia = 0;

  for (
    let i = 0;
    i < calculado.length;
    i++
  ) {
    diferencia |=
      calculado.charCodeAt(i) ^
      recibido.charCodeAt(i);
  }

  return diferencia === 0;
}

async function validarFirmaWebhook({
  xSignature,
  xRequestId,
  dataId,
  secret
}) {
  const partes =
    extraerFirma(xSignature);

  const ts = partes.ts;
  const v1 = partes.v1;

  if (!ts || !v1) {
    return false;
  }

  const manifest =
    "id:" +
    dataId +
    ";" +
    "request-id:" +
    xRequestId +
    ";" +
    "ts:" +
    ts +
    ";";

  const clave =
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      {
        name: "HMAC",
        hash: "SHA-256"
      },
      false,
      ["sign"]
    );

  const firma =
    await crypto.subtle.sign(
      "HMAC",
      clave,
      new TextEncoder().encode(
        manifest
      )
    );

  const calculado =
    hexadecimal(
      new Uint8Array(firma)
    );

  return compararHashConstante(
    calculado,
    v1.toLowerCase()
  );
}


// ======================================================
// WEBHOOK MERCADO PAGO
// ======================================================

async function procesarWebhook(
  request,
  env
) {
  const url =
    new URL(request.url);

  const xSignature =
    request.headers.get(
      "x-signature"
    );

  const xRequestId =
    request.headers.get(
      "x-request-id"
    );

  const dataId =
    url.searchParams.get("data.id") ||
    url.searchParams.get("data_id");

  const secret =
    env.MP_WEBHOOK_SECRET;

  if (
    !xSignature ||
    !xRequestId ||
    !dataId ||
    !secret
  ) {
    return responderJson(
      {
        error:
          "Faltan datos para validar la notificación"
      },
      400
    );
  }

  const firmaValida =
    await validarFirmaWebhook({
      xSignature,
      xRequestId,
      dataId,
      secret
    });

  if (!firmaValida) {
    console.warn(
      "Webhook rechazado: firma inválida"
    );

    return responderJson(
      {
        error: "Firma inválida"
      },
      401
    );
  }

  let body = {};

  try {
    body =
      await request.json();
  } catch {
    body = {};
  }

  if (
    body.type &&
    body.type !== "payment"
  ) {
    console.log(
      "Notificación ignorada:",
      body.type
    );

    return responderJson({
      received: true,
      ignored:
        "unsupported_notification_type"
    });
  }

  const respuestaPago =
    await fetch(
      "https://api.mercadopago.com/v1/payments/" +
      encodeURIComponent(dataId),
      {
        headers: {
          Authorization:
            "Bearer " +
            env.MP_ACCESS_TOKEN
        }
      }
    );

  if (!respuestaPago.ok) {
    const detalle =
      await respuestaPago.text();

    console.error(
      "Error consultando pago:",
      respuestaPago.status,
      detalle
    );

    throw new Error(
      "No se pudo consultar el pago"
    );
  }

  const payment =
    await respuestaPago.json();

  console.log(
    "Pago consultado en Mercado Pago:",
    {
      id: payment.id,
      status: payment.status,
      statusDetail:
        payment.status_detail,
      transactionAmount:
        payment.transaction_amount
    }
  );

  const externalReference =
    payment.external_reference;

  if (!externalReference) {
    console.log(
      "Pago sin external_reference. Se ignora."
    );

    return responderJson({
      received: true,
      ignored:
        "missing_external_reference"
    });
  }

  const orden =
    await obtenerOrdenFirestore(
      env,
      externalReference
    );

  if (!orden) {
    console.warn(
      "No existe una orden para external_reference:",
      externalReference
    );

    return responderJson({
      received: true,
      ignored: "order_not_found"
    });
  }

  const totalFirestore =
    orden.fields?.total;

  const montoOrden =
    Number(
      totalFirestore?.integerValue ??
      totalFirestore?.doubleValue
    );

  const montoPago =
    Number(
      payment.transaction_amount
    );

  if (
    !Number.isFinite(montoOrden) ||
    montoPago !== montoOrden
  ) {
    console.error(
      "El monto del pago no coincide con la orden:",
      {
        montoPago,
        montoOrden,
        externalReference
      }
    );

    return responderJson({
      received: true,
      ignored: "amount_mismatch"
    });
  }

  if (payment.currency_id !== "ARS") {
    console.error(
      "La moneda del pago no coincide con la orden:",
      {
        monedaPago: payment.currency_id,
        externalReference
      }
    );

    return responderJson({
      received: true,
      ignored: "currency_mismatch"
    });
  }

  if (
    payment.status === "approved" &&
    payment.status_detail ===
      "accredited"
  ) {
    const paymentId = String(payment.id);

    function evaluarOrdenParaAprobacion(ordenActual, esRelectura) {
      const fields = ordenActual?.fields;
      const estado = fields?.estado?.stringValue;
      const campoPaymentId = fields?.mercadoPagoPaymentId;
      const paymentIdAlmacenado = campoPaymentId?.stringValue;
      const fechaPago = fields?.fechaPago;
      const updateTime = ordenActual?.updateTime;
      const paymentIdValido =
        campoPaymentId === undefined ||
        campoPaymentId?.nullValue === null ||
        (typeof paymentIdAlmacenado === "string" && paymentIdAlmacenado !== "");
      const fechaPagoValida =
        fechaPago === undefined ||
        (typeof fechaPago?.timestampValue === "string" && fechaPago.timestampValue !== "");
      const estructuraValida =
        typeof estado === "string" && estado !== "" &&
        paymentIdValido && fechaPagoValida;
      const updateTimeValido =
        typeof updateTime === "string" &&
        /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.(?:\d{3}|\d{6}|\d{9}))?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(updateTime);

      if (esRelectura && (
        !estructuraValida ||
        !updateTimeValido ||
        (estado === "approved" && (!paymentIdAlmacenado || !fechaPago))
      )) {
        throw new Error("Orden incoherente después del conflicto de precondición");
      }

      if (estructuraValida && estado === "approved" && paymentIdAlmacenado === paymentId) {
        return responderJson({ received: true });
      }

      if (typeof paymentIdAlmacenado === "string" && paymentIdAlmacenado !== "" && paymentIdAlmacenado !== paymentId) {
        console.warn("Conflicto de payment ID:", {
          externalReference,
          paymentIdAlmacenado,
          paymentIdRecibido: paymentId
        });
        return responderJson({
          received: true,
          ignored: "payment_id_conflict"
        });
      }

      if (
        !estructuraValida ||
        estado !== "pending_payment" ||
        paymentIdAlmacenado !== undefined ||
        fechaPago !== undefined ||
        !updateTimeValido
      ) {
        if (esRelectura && estado === "pending_payment") {
          throw new Error("Orden pendiente incoherente después del conflicto de precondición");
        }
        console.warn("Estado de orden incompatible con primera aprobación:", {
          externalReference,
          estado
        });
        return responderJson({
          received: true,
          ignored: "order_state_conflict"
        });
      }

      return null;
    }

    const respuestaEstado = evaluarOrdenParaAprobacion(orden, false);
    if (respuestaEstado) {
      return respuestaEstado;
    }

    const resultadoActualizacion = await aprobarOrdenFirestore(
      env,
      externalReference,
      paymentId,
      orden.updateTime
    );

    if (resultadoActualizacion === "precondition_failed") {
      const ordenReleida = await obtenerOrdenFirestore(env, externalReference);
      if (!ordenReleida) {
        throw new Error("La orden desapareció después del conflicto de precondición");
      }

      const totalReleido = ordenReleida.fields?.total;
      const montoOrdenReleida = Number(
        totalReleido?.integerValue ?? totalReleido?.doubleValue
      );
      if (!Number.isFinite(montoOrdenReleida) || montoOrdenReleida !== montoPago) {
        console.error("El monto del pago no coincide con la orden releída:", {
          montoPago,
          montoOrden: montoOrdenReleida,
          externalReference
        });
        return responderJson({
          received: true,
          ignored: "amount_mismatch"
        });
      }

      const respuestaRelectura = evaluarOrdenParaAprobacion(ordenReleida, true);
      if (respuestaRelectura) {
        return respuestaRelectura;
      }

      throw new Error("La orden sigue pendiente después del conflicto de precondición");
    }

    console.log(
      "Orden aprobada en Firestore:",
      {
        ordenId:
          externalReference,

        paymentId:
          payment.id
      }
    );
  }

  console.log(
    "Webhook válido recibido:",
    {
      type: body.type,
      action: body.action,
      dataId
    }
  );

  return responderJson({
    received: true
  });
}


// ======================================================
// WORKER
// ======================================================

export default {
  async fetch(request, env) {
    const url =
      new URL(request.url);

    if (
      request.method ===
      "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status: 204,
          headers: CORS
        }
      );
    }

    try {
      if (
        url.pathname === "/" &&
        request.method === "GET"
      ) {
        return responderJson({
          ok: true,
          servicio:
            "tienda-deportiva-api"
        });
      }

      if (
        url.pathname ===
          "/createPreference" &&
        request.method === "POST"
      ) {
        return await crearPreferencia(
          request,
          env
        );
      }

      if (
        url.pathname ===
          "/paymentWebhook" &&
        request.method === "POST"
      ) {
        return await procesarWebhook(
          request,
          env
        );
      }

      return responderJson(
        {
          error:
            "Ruta no encontrada"
        },
        404
      );

    } catch (error) {
      console.error(
        "Error del Worker:",
        error
      );

      return responderJson(
        {
          error:
            "No se pudo procesar la solicitud"
        },
        500
      );
    }
  }
};