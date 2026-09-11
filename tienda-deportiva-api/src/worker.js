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

const MAX_BODY_BYTES = 32768;
const MAX_CARRITO_ENTRADAS = 360;

const TIMEOUT_GOOGLE_OAUTH_MS = 4000;
const TIMEOUT_IDENTITY_TOOLKIT_MS = 5000;
const TIMEOUT_FIRESTORE_MS = 3000;
const TIMEOUT_MP_PAYMENT_MS = 6000;
const TIMEOUT_MP_PREFERENCIA_MS = 10000;

let googleTokenCache = null;


// ======================================================
// RESPUESTAS
// ======================================================

async function leerBodyLimitado(request, maxBytes) {
  const contentLength = request.headers.get("Content-Length");
  const errorTamano = new Error("Solicitud demasiado grande");
  errorTamano.name = "PayloadTooLargeError";

  if (
    contentLength !== null &&
    /^\d+$/.test(contentLength.trim()) &&
    BigInt(contentLength.trim()) > BigInt(maxBytes)
  ) {
    throw errorTamano;
  }

  const texto = await request.text();
  if (new TextEncoder().encode(texto).byteLength > maxBytes) {
    throw errorTamano;
  }
  return texto;
}


async function fetchConTimeout(url, opciones, timeoutMs, contexto) {
  const controller = new AbortController();
  const signalExterno = opciones?.signal;
  let timeoutInterno = false;
  let timer;
  const propagarAbort = () => controller.abort(signalExterno.reason);

  try {
    if (signalExterno) {
      if (signalExterno.aborted) {
        propagarAbort();
      } else {
        signalExterno.addEventListener("abort", propagarAbort, { once: true });
      }
    }

    timer = setTimeout(() => {
      if (!controller.signal.aborted) {
        timeoutInterno = true;
        controller.abort();
      }
    }, timeoutMs);

    const respuesta = await fetch(url, {
      ...opciones,
      signal: controller.signal
    });
    const cuerpo = await respuesta.arrayBuffer();
    controller.signal.throwIfAborted();

    return new Response(
      cuerpo.byteLength === 0 || [204, 205, 304].includes(respuesta.status)
        ? null
        : cuerpo,
      {
        status: respuesta.status,
        statusText: respuesta.statusText,
        headers: respuesta.headers
      }
    );
  } catch (error) {
    if (timeoutInterno) {
      console.error({
        servicio: contexto.servicio,
        operacion: contexto.operacion,
        motivo: "timeout"
      });
      const errorTimeout = new Error("Tiempo de espera externo agotado");
      errorTimeout.name = "TimeoutError";
      throw errorTimeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (signalExterno) {
      signalExterno.removeEventListener("abort", propagarAbort);
    }
  }
}


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

  const respuesta = await fetchConTimeout(
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
    },
    TIMEOUT_GOOGLE_OAUTH_MS,
    { servicio: "Google OAuth", operacion: "obtener_token" }
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
  const respuesta = await fetchConTimeout(
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
    },
    TIMEOUT_IDENTITY_TOOLKIT_MS,
    { servicio: "Identity Toolkit", operacion: "validar_usuario" }
  );

  if (!respuesta.ok) {
    if (respuesta.status === 400 || respuesta.status === 401) {
      let errorFirebase;
      try {
        errorFirebase = await respuesta.json();
      } catch {
        errorFirebase = null;
      }

      const codigo = errorFirebase?.error?.message;
      if (
        codigo === "INVALID_ID_TOKEN" ||
        codigo === "TOKEN_EXPIRED" ||
        codigo === "USER_NOT_FOUND" ||
        codigo === "USER_DISABLED"
      ) {
        return null;
      }
    }

    throw new Error("No se pudo verificar la sesión con Identity Toolkit");
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

  const respuesta = await fetchConTimeout(url, {
    method: "POST",
    headers: {
      Authorization:
        "Bearer " + google.token,

      "Content-Type":
        "application/json"
    },

    body: JSON.stringify(documento)
  }, TIMEOUT_FIRESTORE_MS, { servicio: "Firestore", operacion: "crear_orden" });

  if (!respuesta.ok) {
    const detalle =
      await respuesta.text();

    console.error(
      "Error Firestore:",
      { servicio: "Firestore", status: respuesta.status, ordenId }
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

  const respuesta = await fetchConTimeout(url, {
    headers: {
      Authorization:
        "Bearer " + google.token
    }
  }, TIMEOUT_FIRESTORE_MS, { servicio: "Firestore", operacion: "leer_orden" });

  if (respuesta.status === 404) {
    return null;
  }

  if (!respuesta.ok) {
    const detalle =
      await respuesta.text();

    console.error(
      "Error leyendo orden:",
      { servicio: "Firestore", status: respuesta.status, ordenId }
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

  const respuesta = await fetchConTimeout(url, {
    method: "PATCH",

    headers: {
      Authorization:
        "Bearer " + google.token,

      "Content-Type":
        "application/json"
    },

    body: JSON.stringify(documento)
  }, TIMEOUT_FIRESTORE_MS, { servicio: "Firestore", operacion: "aprobar_orden" });

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
      { servicio: "Firestore", status: respuesta.status, ordenId }
    );

    throw new Error(
      "No se pudo aprobar la orden"
    );
  }

  return "updated";
}


function timestampReversoEnNanosegundos(valor) {
  if (typeof valor !== "string") return null;
  const partes = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(valor);
  if (!partes) return null;
  const [anio, mes, dia, hora, minuto, segundo] = partes.slice(1, 7).map(Number);
  const offsetHora = Number(partes[10] || 0);
  const offsetMinuto = Number(partes[11] || 0);
  if (anio < 1 || mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora > 23 || minuto > 59 || segundo > 59 || offsetHora > 23 || offsetMinuto > 59) return null;
  const fecha = new Date(0);
  fecha.setUTCFullYear(anio, mes - 1, dia);
  fecha.setUTCHours(hora, minuto, segundo, 0);
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null;
  const offset = (offsetHora * 60 + offsetMinuto) * (partes[9] === "-" ? -1 : 1);
  const fraccion = BigInt((partes[7] || "").padEnd(9, "0"));
  return BigInt(fecha.getTime()) * 1000000n + fraccion - BigInt(offset) * 60000000000n;
}

function importeReversoEnCentavos(valor) {
  if (typeof valor !== "number" && typeof valor !== "string") return null;
  if (typeof valor === "number" && !Number.isFinite(valor)) return null;
  const partes = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(String(valor));
  if (!partes) return null;
  const centavos = BigInt(partes[1]) * 100n + BigInt((partes[2] || "").padEnd(2, "0"));
  return centavos <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(centavos) : null;
}

async function actualizarReversoFirestore(env, ordenId, updateTime, campos) {
  const permitidos = ["estado", "montoReembolsado", "detalleEstadoPago", "fechaActualizacionPago"];
  const nombres = Object.keys(campos);
  if (timestampReversoEnNanosegundos(updateTime) === null || nombres.length === 0 || nombres.some(nombre => !permitidos.includes(nombre))) {
    throw new Error("Actualización de reverso inválida");
  }
  const google = await obtenerGoogleAccessToken(env);
  const url =
    "https://firestore.googleapis.com/v1/projects/" +
    encodeURIComponent(google.projectId) +
    "/databases/(default)/documents/compras/" +
    encodeURIComponent(ordenId) + "?" +
    nombres.map(nombre => "updateMask.fieldPaths=" + encodeURIComponent(nombre)).join("&") +
    "&currentDocument.updateTime=" + encodeURIComponent(updateTime);
  const respuesta = await fetchConTimeout(url, {
    method: "PATCH",
    headers: {
      Authorization: "Bearer " + google.token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields: campos })
  }, TIMEOUT_FIRESTORE_MS, { servicio: "Firestore", operacion: "actualizar_reverso" });
  if (respuesta.ok) return "updated";
  let errorFirestore;
  try {
    errorFirestore = await respuesta.json();
  } catch {
    errorFirestore = null;
  }
  if (respuesta.status === 400 && errorFirestore?.error?.status === "FAILED_PRECONDITION") {
    return "precondition_failed";
  }
  console.error("Error actualizando reverso:", { ordenId, status: respuesta.status });
  throw new Error("No se pudo actualizar el reverso");
}

function evaluarReverso(orden, payment, esRelectura = false) {
  const externalReference = payment.external_reference;
  const paymentId = String(payment.id);
  function ignorar(motivo) {
    console.warn("Reverso ignorado:", {
      servicio: "Mercado Pago",
      motivo,
      externalReference,
      paymentId
    });
    return { respuesta: responderJson({ received: true, ignored: motivo }) };
  }
  function estructuraInvalida() {
    if (esRelectura) throw new Error("Orden incoherente al releer reverso");
    return ignorar("order_state_conflict");
  }
  const fields = orden?.fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return estructuraInvalida();
  const idAsociado = fields.mercadoPagoPaymentId?.stringValue;
  const estadoActual = fields.estado?.stringValue;
  const campoId = fields.mercadoPagoPaymentId;
  if (typeof estadoActual !== "string" || estadoActual === "") return estructuraInvalida();
  if (campoId !== undefined && campoId?.nullValue !== null && (typeof idAsociado !== "string" || idAsociado === "")) return estructuraInvalida();
  if (esRelectura && !idAsociado && estadoActual !== "pending_payment") return estructuraInvalida();
  if (fields.detalleEstadoPago !== undefined && typeof fields.detalleEstadoPago?.stringValue !== "string") return estructuraInvalida();
  if (typeof idAsociado === "string" && idAsociado !== "" && idAsociado !== paymentId) return ignorar("payment_id_conflict");
  if (!idAsociado || !["approved", "partially_refunded", "refunded", "charged_back"].includes(fields.estado?.stringValue)) return ignorar("order_state_conflict");
  if (timestampReversoEnNanosegundos(fields.fechaPago?.timestampValue) === null || timestampReversoEnNanosegundos(orden.updateTime) === null) return estructuraInvalida();

  const total = importeReversoEnCentavos(payment.transaction_amount);
  const totalOrden = importeReversoEnCentavos(fields.total?.integerValue ?? fields.total?.doubleValue);
  const refund = importeReversoEnCentavos(payment.transaction_amount_refunded);
  const fechaNueva = timestampReversoEnNanosegundos(payment.date_last_updated);
  if (total === null || total <= 0 || fechaNueva === null) return ignorar("payment_state_conflict");
  if (totalOrden === null || total !== totalOrden) return ignorar("amount_mismatch");

  let estadoObjetivo;
  const detalle = payment.status_detail;
  if (payment.status === "charged_back") {
    if (!["in_process", "settled", "reimbursed"].includes(detalle)) return ignorar("payment_state_conflict");
    if (payment.transaction_amount_refunded !== undefined && (refund === null || refund > total)) return ignorar("payment_state_conflict");
    estadoObjetivo = "charged_back";
  } else {
    if (refund === null || refund > total) return ignorar("payment_state_conflict");
    if (payment.status === "approved" && detalle === "partially_refunded" && refund > 0 && refund < total) {
      estadoObjetivo = "partially_refunded";
    } else if (payment.status === "refunded" && ["refunded", "by_admin"].includes(detalle) && refund === total) {
      estadoObjetivo = "refunded";
    } else {
      return ignorar("payment_state_conflict");
    }
  }

  const campoRefund = fields.montoReembolsado;
  const refundGuardado = campoRefund === undefined ? null : importeReversoEnCentavos(campoRefund?.doubleValue ?? campoRefund?.integerValue);
  if (campoRefund !== undefined && (refundGuardado === null || refundGuardado > total)) return estructuraInvalida();
  if (estadoActual === "partially_refunded" && (refundGuardado === null || refundGuardado <= 0 || refundGuardado >= total)) return estructuraInvalida();
  if (estadoActual === "refunded" && refundGuardado !== total) return estructuraInvalida();
  const campoFecha = fields.fechaActualizacionPago;
  const fechaAnterior = campoFecha === undefined ? null : timestampReversoEnNanosegundos(campoFecha?.timestampValue);
  if (campoFecha !== undefined && fechaAnterior === null) return estructuraInvalida();
  if (fechaAnterior !== null && fechaNueva < fechaAnterior) return ignorar("stale_payment_snapshot");
  if (estadoObjetivo !== "charged_back" && refundGuardado !== null && refund < refundGuardado) return ignorar("payment_state_conflict");

  const coincide = fields.estado.stringValue === estadoObjetivo &&
    fields.detalleEstadoPago?.stringValue === detalle &&
    (estadoObjetivo === "charged_back" || refundGuardado === refund);
  if (coincide) return { respuesta: responderJson({ received: true }) };
  if (fechaAnterior !== null && fechaNueva === fechaAnterior) return ignorar("payment_state_conflict");

  const campos = {};
  if (fields.estado.stringValue !== estadoObjetivo) campos.estado = { stringValue: estadoObjetivo };
  if (fields.detalleEstadoPago?.stringValue !== detalle) campos.detalleEstadoPago = { stringValue: detalle };
  if (estadoObjetivo !== "charged_back" && refundGuardado !== refund) campos.montoReembolsado = { doubleValue: refund / 100 };
  campos.fechaActualizacionPago = { timestampValue: payment.date_last_updated };
  return { campos };
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
    const texto = await leerBodyLimitado(request, MAX_BODY_BYTES);
    datos = JSON.parse(texto);
  } catch (error) {
    if (error?.name === "PayloadTooLargeError") {
      return responderJson({ error: "Solicitud demasiado grande" }, 413);
    }
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

  if (carrito.length > MAX_CARRITO_ENTRADAS) {
    return responderJson({ error: "Demasiadas entradas en el carrito" }, 400);
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
    await fetchConTimeout(
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
      },
      TIMEOUT_MP_PREFERENCIA_MS,
      { servicio: "Mercado Pago", operacion: "crear_preferencia" }
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
      { servicio: "Mercado Pago", status: respuestaMP.status, ordenId }
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
    const texto = await leerBodyLimitado(request, MAX_BODY_BYTES);
    body = JSON.parse(texto);
  } catch (error) {
    if (error?.name === "PayloadTooLargeError") {
      return responderJson({ error: "Solicitud demasiado grande" }, 413);
    }
    body = {};
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
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
    await fetchConTimeout(
      "https://api.mercadopago.com/v1/payments/" +
      encodeURIComponent(dataId),
      {
        headers: {
          Authorization:
            "Bearer " +
            env.MP_ACCESS_TOKEN
        }
      },
      TIMEOUT_MP_PAYMENT_MS,
      { servicio: "Mercado Pago", operacion: "consultar_payment" }
    );

  if (!respuestaPago.ok) {
    const detalle =
      await respuestaPago.text();

    console.error(
      "Error consultando pago:",
      { servicio: "Mercado Pago", status: respuestaPago.status, paymentId: dataId }
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
      {
        servicio: "Mercado Pago",
        motivo: "order_not_found",
        externalReference,
        paymentId: String(payment.id)
      }
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
        servicio: "Mercado Pago",
        motivo: "amount_mismatch",
        externalReference,
        paymentId: String(payment.id),
        montoEsperado: montoOrden,
        montoRecibido: montoPago
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
        servicio: "Mercado Pago",
        motivo: "currency_mismatch",
        externalReference,
        paymentId: String(payment.id)
      }
    );

    return responderJson({
      received: true,
      ignored: "currency_mismatch"
    });
  }

  const requiereEvaluarReverso =
    payment.status === "refunded" ||
    payment.status === "charged_back" ||
    (payment.status === "approved" && (
      payment.status_detail !== "accredited" ||
      (payment.transaction_amount_refunded !== undefined &&
        importeReversoEnCentavos(payment.transaction_amount_refunded) !== 0)
    ));

  if (requiereEvaluarReverso) {
    const decision = evaluarReverso(orden, payment);
    if (decision.respuesta) return decision.respuesta;
    const resultadoReverso = await actualizarReversoFirestore(
      env, externalReference, orden.updateTime, decision.campos
    );
    if (resultadoReverso === "precondition_failed") {
      const ordenReleida = await obtenerOrdenFirestore(env, externalReference);
      if (!ordenReleida) throw new Error("La orden desapareció al releer reverso");
      const reevaluacion = evaluarReverso(ordenReleida, payment, true);
      if (reevaluacion.respuesta) return reevaluacion.respuesta;
      throw new Error("El reverso requiere un reintento externo");
    }
    console.log("Reverso actualizado:", {
      externalReference,
      paymentId: String(payment.id),
      estado: payment.status,
      detalle: payment.status_detail
    });
    return responderJson({ received: true });
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
          servicio: "Mercado Pago",
          motivo: "payment_id_conflict",
          externalReference,
          paymentId
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
          servicio: "Mercado Pago",
          motivo: "amount_mismatch",
          externalReference,
          paymentId,
          montoEsperado: montoOrdenReleida,
          montoRecibido: montoPago
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
        { servicio: "Worker", status: 500 }
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