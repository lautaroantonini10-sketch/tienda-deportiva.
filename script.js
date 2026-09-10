const toastContainer = document.querySelector("#toast-container");

function mostrarToast(mensaje, tipo) {
    const toast = document.createElement("div");
    toast.className = "toast";
    if (tipo) {
        toast.classList.add(tipo);
    }
    toast.textContent = mensaje;
    toastContainer.appendChild(toast);

    setTimeout(function() {
        toast.classList.add("mostrar");
    }, 10);

    setTimeout(function() {
        toast.classList.remove("mostrar");
        setTimeout(function() {
            toast.remove();
        }, 300);
    }, 2500);
}
// ==========================================
// 1. ESTADO Y CARGA INICIAL DEL CARRITO
// ==========================================
const MAX_CANTIDAD_PRODUCTO = 10;
let carrito = [];

try {
    const carritoGuardado = JSON.parse(localStorage.getItem("carrito"));
    if (Array.isArray(carritoGuardado)) {
        carrito = carritoGuardado;
    }
} catch {
    carrito = [];
}

// Función auxiliar para convertir "$45.000" o "45000" a número entero real
function parsePrecio(precio) {
    if (typeof precio === "number") return precio;
    if (typeof precio === "string") {
        const soloNumeros = precio.replace(/[^0-9]/g, "");
        return Number(soloNumeros) || 0;
    }
    return 0;
}

function guardarCarritoEnLocalStorage() {
    localStorage.setItem("carrito", JSON.stringify(carrito));
}

// ==========================================
// 2. REFERENCIAS AL DOM
// ==========================================
const contadorCarrito = document.querySelector("#contador-carrito");
const listaCarrito = document.querySelector("#lista-carrito");
const totalCarrito = document.querySelector("#total-carrito");
const mensajeVacio = document.querySelector("#mensaje-vacio");
const btnVaciar = document.querySelector("#vaciar-carrito");
const btnPagar = document.querySelector("#btn-pagar");
const mensajePago = document.querySelector("#mensaje-pago");
const botonCarrito = document.querySelector("#boton-carrito");
const seccionCarrito = document.querySelector("#seccion-carrito");

// ==========================================
// 3. ACTUALIZAR INTERFAZ DEL CARRITO
// ==========================================
function actualizarCarritoUI() {
    if (!listaCarrito) return;

    listaCarrito.innerHTML = "";

    if (!Array.isArray(carrito) || carrito.length === 0) {
        if (mensajeVacio) mensajeVacio.style.display = "block";
        if (contadorCarrito) contadorCarrito.textContent = "0";
        if (totalCarrito) totalCarrito.textContent = "0";
        return;
    }

    if (mensajeVacio) mensajeVacio.style.display = "none";

    let total = 0;
    let cantidadTotalProductos = 0;

    carrito.forEach((item, index) => {
        const cantidad = item.cantidad || 1;
        const precioUnitario = parsePrecio(item.precio);
        const subtotal = precioUnitario * cantidad;

        total += subtotal;
        cantidadTotalProductos += cantidad;

       const li = document.createElement("li");

li.innerHTML = `
    <span>
        <strong>${item.nombre}</strong>
        (x${cantidad}) - $${subtotal.toLocaleString("es-AR")}
    </span>

    <button
        class="btn-eliminar"
        data-index="${index}"
        aria-label="Eliminar ${item.nombre} del carrito"
    >
        X
    </button>
`;
        listaCarrito.appendChild(li);
    });

    if (contadorCarrito) contadorCarrito.textContent = cantidadTotalProductos;
    if (totalCarrito) totalCarrito.textContent = total.toLocaleString("es-AR");

    // Eventos para eliminar ítems individuales
    document.querySelectorAll(".btn-eliminar").forEach((btn) => {
        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            const idx = Number(this.getAttribute("data-index"));
            eliminarDelCarrito(idx);
        });
    });
}

function agregarAlCarrito(nombre, precio) {
    const itemExistente = carrito.find((prod) => prod.nombre === nombre);

    if (itemExistente) {
        const cantidadActual = Number(itemExistente.cantidad);

        if (!Number.isInteger(cantidadActual) || cantidadActual < 1) {
            mostrarToast("Revisá la cantidad de «" + nombre + "»: debe ser un entero entre 1 y 10.");
            return;
        }

        if (cantidadActual >= MAX_CANTIDAD_PRODUCTO) {
            mostrarToast("Máximo 10 unidades por producto");
            return;
        }

        itemExistente.cantidad = cantidadActual + 1;
    } else {
        carrito.push({
            nombre: nombre,
            precio: precio,
            cantidad: 1
        });
    }

    guardarCarritoEnLocalStorage();
    actualizarCarritoUI();
    mostrarToast("✅ Agregaste " + nombre + " al carrito", "exito");
}

function eliminarDelCarrito(index) {
    if (carrito[index]) {
         const nombreProducto = carrito[index].nombre;
        if (carrito[index].cantidad > 1) {
            carrito[index].cantidad -= 1;
        } else {
            carrito.splice(index, 1);
        }

          mostrarToast("🗑️ Eliminaste " + nombreProducto + " del carrito", "eliminado");
    }
    guardarCarritoEnLocalStorage();
    actualizarCarritoUI();

}

function limpiarMensajePago() {
    if (mensajePago) {
        mensajePago.textContent = "";
        mensajePago.classList.remove("error", "aviso");
    }
}

// Evento Vaciar Carrito
if (btnVaciar) {
    btnVaciar.addEventListener("click", function () {
        carrito = [];

        guardarCarritoEnLocalStorage();
        actualizarCarritoUI();

        limpiarMensajePago();

        mostrarToast("🧹 Carrito vacío");
    });
}

// Toggle desplegar carrito visualmente
if (botonCarrito && seccionCarrito) {
    botonCarrito.addEventListener("click", function () {
        seccionCarrito.classList.toggle("mostrar");
    });
}

function obtenerDatosProducto(producto) {
    return {
        nombre: producto.querySelector("h2").textContent,
        precioTexto: producto.querySelector(".precio").textContent
    };
}

// Escuchar clics en botones "Agregar al carrito" de los productos
document.querySelectorAll(".producto button").forEach((boton) => {
    boton.addEventListener("click", function () {
        const contenedorProducto = this.closest(".producto");
        const { nombre, precioTexto } = obtenerDatosProducto(contenedorProducto);

        agregarAlCarrito(nombre, precioTexto);
    });
});

// ==========================================
// 4. BÚSQUEDA
// ==========================================
const inputBuscador = document.querySelector("#input-buscador");
const productos = document.querySelectorAll(".producto");
const catalogo = document.querySelector("#catalogo");

const indiceBusqueda = Array.from(productos).map(function(prod) {
    const palabras = prod
        .querySelector("h2")
        .textContent
        .toLowerCase()
        .trim()
        .split(/\s+/);

    return {
        elemento: prod,
        palabras: palabras
    };
});

let filtroGenero = "todos";
let filtroTipo = "todos";

if (inputBuscador) {
    inputBuscador.value = "";
}

const estadoBusqueda = document.querySelector("#estado-busqueda");

// ==========================================
// CARRUSEL DE DESTACADOS
// ==========================================

const destacadosCarrusel = document.querySelector("#destacados-carrusel");
const destacadosTrack = document.querySelector("#destacados-track");
const btnDestacadosAnterior = document.querySelector("#destacados-anterior");
const btnDestacadosSiguiente = document.querySelector("#destacados-siguiente");

let modoDestacados = true;

const productosDestacados = Array.from(productos).filter(function(prod) {
    return prod.dataset.destacado === "true";
});

if (destacadosTrack) {
    productosDestacados.forEach(function(prod) {
        const copia = prod.cloneNode(true);

        const boton = copia.querySelector("button");

        boton?.addEventListener("click", function() {
            const { nombre, precioTexto } = obtenerDatosProducto(copia);

            agregarAlCarrito(nombre, precioTexto);
        });

        destacadosTrack.appendChild(copia);
    });
}

function actualizarCarruselDestacados(textoBusqueda = "") {
    if (!destacadosCarrusel) return;

    const mostrarCarrusel =
        modoDestacados &&
        textoBusqueda === "";

    destacadosCarrusel.hidden = !mostrarCarrusel;
}

// ==========================================
// MOVIMIENTO DEL CARRUSEL DE DESTACADOS
// ==========================================

let autoplayDestacados = null;

function desplazarDestacados(direccion) {
    if (!destacadosTrack) return;

    const tarjeta = destacadosTrack.querySelector(".producto");
    if (!tarjeta) return;

    const estilosTrack = getComputedStyle(destacadosTrack);
    const gap = parseFloat(estilosTrack.gap) || 0;

    const distancia =
        tarjeta.getBoundingClientRect().width + gap;

    const maxScroll =
        destacadosTrack.scrollWidth -
        destacadosTrack.clientWidth;

    // Si llega al final, vuelve suavemente al principio
    if (
        direccion > 0 &&
        destacadosTrack.scrollLeft >= maxScroll - 5
    ) {
        destacadosTrack.scrollTo({
            left: 0,
            behavior: "smooth"
        });

        return;
    }

    // Si está al principio y tocamos la flecha izquierda,
    // va al final
    if (
        direccion < 0 &&
        destacadosTrack.scrollLeft <= 5
    ) {
        destacadosTrack.scrollTo({
            left: maxScroll,
            behavior: "smooth"
        });

        return;
    }

    destacadosTrack.scrollBy({
        left: direccion * distancia,
        behavior: "smooth"
    });
}

function detenerAutoplayDestacados() {
    if (autoplayDestacados) {
        clearInterval(autoplayDestacados);
        autoplayDestacados = null;
    }
}

function iniciarAutoplayDestacados() {
    detenerAutoplayDestacados();

    autoplayDestacados = setInterval(function() {

        if (
            !destacadosCarrusel ||
            destacadosCarrusel.hidden
        ) {
            return;
        }

        desplazarDestacados(1);

    }, 2800);
}


// FLECHA IZQUIERDA
btnDestacadosAnterior?.addEventListener("click", function() {
    desplazarDestacados(-1);

    iniciarAutoplayDestacados();
});


// FLECHA DERECHA
btnDestacadosSiguiente?.addEventListener("click", function() {
    desplazarDestacados(1);

    iniciarAutoplayDestacados();
});


// Pausar mientras el usuario mira/interactúa con la cinta
destacadosTrack?.addEventListener("mouseenter", function() {
    detenerAutoplayDestacados();
});

destacadosTrack?.addEventListener("mouseleave", function() {
    iniciarAutoplayDestacados();
});


// Pausar al tocar/deslizar en celular
destacadosTrack?.addEventListener(
    "touchstart",
    function() {
        detenerAutoplayDestacados();
    },
    { passive: true }
);

destacadosTrack?.addEventListener(
    "touchend",
    function() {
        iniciarAutoplayDestacados();
    },
    { passive: true }
);


// Iniciar movimiento automático
iniciarAutoplayDestacados();

    function aplicarFiltros() {
    const textoBusqueda = inputBuscador
        ? inputBuscador.value.toLowerCase().trim()
        : "";
    const terminosBusqueda = textoBusqueda.split(/\s+/);

        actualizarCarruselDestacados(textoBusqueda);

    let cantidadResultados = 0;

    indiceBusqueda.forEach(function(item) {
    const prod = item.elemento;

    const coincideBusqueda =
        textoBusqueda === "" ||
        terminosBusqueda.every(function(termino) {
            return item.palabras.some(function(palabra) {
                return palabra.startsWith(termino);
            });
        });

    const coincideGenero =
        filtroGenero === "todos" ||
        prod.dataset.genero === filtroGenero;

    const coincideTipo =
        filtroTipo === "todos" ||
        prod.dataset.tipo === filtroTipo;

    const esDestacado =
    prod.dataset.destacado === "true";

let mostrar;

if (modoDestacados && textoBusqueda === "") {
    mostrar = !esDestacado;
} else {
    mostrar =
        coincideBusqueda &&
        coincideGenero &&
        coincideTipo;
}

    if (mostrar) {
        prod.style.display = "flex";
        cantidadResultados++;
    } else {
        prod.style.display = "none";
    }
});

    if (textoBusqueda !== "") {
        document.body.classList.add("modo-busqueda");

        if (estadoBusqueda) {
    estadoBusqueda.innerHTML = "";

    const tituloEstado = document.createElement("strong");
    const detalleEstado = document.createElement("span");

    if (cantidadResultados === 0) {
        tituloEstado.textContent = "No encontramos productos";
        detalleEstado.textContent = "Probá con otra búsqueda.";
    } else {
        tituloEstado.textContent =
            `Resultados para "${textoBusqueda}"`;

        detalleEstado.textContent =
            cantidadResultados +
            (cantidadResultados === 1
                ? " producto"
                : " productos");
    }

    estadoBusqueda.appendChild(tituloEstado);
    estadoBusqueda.appendChild(detalleEstado);
}
    } else {
        document.body.classList.remove("modo-busqueda");

        if (estadoBusqueda) {
            estadoBusqueda.innerHTML = "";
        }
    }
}

let temporizadorBusqueda;

if (inputBuscador) {
    inputBuscador.addEventListener("input", function() {
        clearTimeout(temporizadorBusqueda);

        temporizadorBusqueda = setTimeout(function() {
            aplicarFiltros();
        }, 80);
    });
}

// ==========================================
// 5. CHECKOUT CON MERCADO PAGO
// ==========================================
if (btnPagar) {
    btnPagar.addEventListener("click", async function () {

        // Evitar checkout con carrito vacío
       if (!Array.isArray(carrito) || carrito.length === 0) {
    if (mensajePago) {
        mensajePago.classList.remove("aviso");
        mensajePago.classList.add("error");

        mensajePago.textContent = "⚠️ Tu carrito está vacío.";
    }

    return;
}

        // Por ahora mantenemos el requisito de iniciar sesión
        const usuarioLogueado = window.auth && window.auth.currentUser;

        if (!usuarioLogueado) {
    if (mensajePago) {
        mensajePago.classList.remove("error");
        mensajePago.classList.add("aviso");

        mensajePago.textContent =
            "⚠️ Debes iniciar sesión o registrarte para continuar.";
    }

    return;
}

        // El navegador solo manda identificación del producto y cantidad.
        // El precio verdadero lo decide el backend.
        const carritoParaEnviar = carrito.map(function(producto) {
            return {
                nombre: producto.nombre,
                cantidad: producto.cantidad || 1
            };
        });

        for (const producto of carritoParaEnviar) {
            const cantidad = Number(producto.cantidad);
            const cantidadInvalida = !Number.isInteger(cantidad) || cantidad < 1;

            if (cantidadInvalida || cantidad > MAX_CANTIDAD_PRODUCTO) {
                if (mensajePago) {
                    mensajePago.classList.remove("aviso");
                    mensajePago.classList.add("error");
                    mensajePago.textContent = cantidadInvalida
                        ? "Revisá la cantidad de «" + producto.nombre + "»: debe ser un entero entre 1 y 10."
                        : "Máximo 10 unidades por producto. Reducí la cantidad de «" + producto.nombre + "» para continuar.";
                }
                return;
            }
        }

        btnPagar.disabled = true;
        btnPagar.textContent = "Cargando Mercado Pago...";

        limpiarMensajePago();
        try {

            const idToken = await usuarioLogueado.getIdToken();
            const response = await fetch(
                "https://tienda-deportiva-api.lautaroantonini10.workers.dev/createPreference",
                {
                    method: "POST",
                    headers: {
                       "Content-Type": "application/json",
                       "Authorization": "Bearer " + idToken
                     },
                    body: JSON.stringify({
                        carrito: carritoParaEnviar
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error || "No se pudo generar el pago"
                );
            }

            if (!data.init_point) {
                throw new Error(
                    "Mercado Pago no devolvió una URL de checkout"
                );
            }

            // Redirigir al Checkout Pro
            window.location.href = data.init_point;

        } catch (error) {
            console.error("Error al iniciar Mercado Pago:", error);

            if (mensajePago) {
    mensajePago.classList.remove("aviso");
    mensajePago.classList.add("error");

    mensajePago.textContent =
        "❌ No pudimos iniciar el pago. Intentá nuevamente.";
}
            btnPagar.disabled = false;
            btnPagar.textContent = "Pagar con Mercado Pago";
        }
    });
}

// Inicializar la interfaz con los productos guardados en LocalStorage al cargar la página
actualizarCarritoUI();

const btnMisCompras = document.querySelector("#btn-mis-compras");
const modalHistorial = document.querySelector("#modal-historial");
const btnCerrarModal = document.querySelector("#btn-cerrar-modal");
const contenedorHistorial = document.querySelector("#contenedor-historial");

if (btnMisCompras) {
    btnMisCompras.addEventListener("click", async function() {
        document.querySelector("#seccion-auth")?.classList.remove("mostrar");

        modalHistorial.classList.remove("oculto");
        contenedorHistorial.innerHTML = "<p>Cargando tus compras...</p>";

        const usuarioLogueado = window.auth && window.auth.currentUser;

        if (!usuarioLogueado) {
            contenedorHistorial.innerHTML =
                "<p>Iniciá sesión para ver tus compras.</p>";
            return;
        }

        try {
            const { collection, query, where, getDocs } =
                window.firestoreTools;

            const consulta = query(
                collection(window.db, "compras"),
                where("usuarioUid", "==", usuarioLogueado.uid)
            );

            const resultado = await getDocs(consulta);

            const comprasAprobadas = resultado.docs
                .map(function(doc) {
                    return doc.data();
                })
                .filter(function(compra) {
                    return compra.estado === "approved";
                });

            if (comprasAprobadas.length === 0) {
                contenedorHistorial.innerHTML =
                    "<p>Todavía no tenés compras aprobadas.</p>";
                return;
            }

            contenedorHistorial.innerHTML = "";

            comprasAprobadas.forEach(function(compra) {
                let itemsTexto = "";

                compra.items.forEach(function(item) {
                    itemsTexto +=
                        "<li>" +
                        item.nombre +
                        " x" +
                        item.cantidad +
                        "</li>";
                });

                const divCompra = document.createElement("div");
                divCompra.className = "compra-item";

                divCompra.innerHTML =
                    "<ul>" +
                    itemsTexto +
                    "</ul>" +
                    "<p class='compra-total'>Total: $" +
                    Number(compra.total).toLocaleString("es-AR") +
                    "</p>";

                contenedorHistorial.appendChild(divCompra);
            });

        } catch (error) {
            console.error("Error al cargar compras:", error);

            contenedorHistorial.innerHTML =
                "<p>No pudimos cargar tus compras. Intentá nuevamente.</p>";
        }
    });
}

function cerrarHistorial() {
    modalHistorial?.classList.add("oculto");
}

btnCerrarModal?.addEventListener("click", cerrarHistorial);

modalHistorial?.addEventListener("click", function(e) {
    if (e.target === modalHistorial) {
        cerrarHistorial();
    }
});

const catLinks = document.querySelectorAll(".cat-link");

catLinks.forEach(function(link) {
    link.addEventListener("click", function() {

modoDestacados =
    link.dataset.destacados === "true";

        catLinks.forEach(function(l) {
            l.classList.remove("activo");
        });

        link.classList.add("activo");

        filtroGenero = link.dataset.genero || "todos";
        filtroTipo = "todos";

        aplicarFiltros();

        const destinoScroll =
    modoDestacados && destacadosCarrusel
        ? destacadosCarrusel
        : catalogo;

if (destinoScroll) {
    destinoScroll.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}
    });
});

function cerrarSubmenus() {
    document.querySelectorAll(".cat-item").forEach(function(item) {
        item.classList.remove("abierto");
    });
}

const subLinks = document.querySelectorAll(".sub-link");

subLinks.forEach(function(link) {
    link.addEventListener("click", function(e) {
        e.preventDefault();

        modoDestacados = false;

        catLinks.forEach(function(l) {
            l.classList.remove("activo");
        });

        const genero = link.getAttribute("data-genero");
        const tipo = link.getAttribute("data-tipo");

        filtroGenero = genero || "todos";
        filtroTipo = tipo || "todos";

        aplicarFiltros();

        navCategorias.classList.remove("mostrar-movil");

        cerrarSubmenus();

        if (catalogo) {
            catalogo.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }
    });
});

aplicarFiltros();

const botonUsuario = document.querySelector("#boton-usuario");
const seccionAuth = document.querySelector("#seccion-auth");
const btnCerrarAuth = document.querySelector("#btn-cerrar-auth");

function cerrarAuth() {
    seccionAuth?.classList.remove("mostrar");

    const passwordInputAuth = document.querySelector("#password-input");
    const mensajeAuth = document.querySelector("#mensaje-auth");

    if (passwordInputAuth) {
        passwordInputAuth.value = "";
    }

    if (mensajeAuth) {
        mensajeAuth.textContent = "";
    }
}

btnCerrarAuth?.addEventListener("click", cerrarAuth);

seccionAuth?.addEventListener("click", function(e) {
    if (e.target === seccionAuth) {
        cerrarAuth();
    }
});

document.addEventListener("keydown", function(e) {
    if (e.key !== "Escape") return;

    if (seccionAuth?.classList.contains("mostrar")) {
        cerrarAuth();
    }

    if (modalHistorial && !modalHistorial.classList.contains("oculto")) {
        cerrarHistorial();
    }
});

botonUsuario?.addEventListener("click", function() {
    seccionAuth.classList.toggle("mostrar");
});

const header = document.querySelector(".hero");
let scrollPendiente = false;

window.addEventListener("scroll", function() {
    if (scrollPendiente) return;

    scrollPendiente = true;

    requestAnimationFrame(function() {
        header.classList.toggle("scrolled", window.scrollY > 40);
        scrollPendiente = false;
    });
}, { passive: true });

const btnMenuMovil = document.querySelector("#btn-menu-movil");
const navCategorias = document.querySelector("#nav-categorias");


btnMenuMovil?.addEventListener("click", function() {
    navCategorias.classList.toggle("mostrar-movil");
    inputBuscador.classList.remove("mostrar-movil");
});

const btnBuscarMovil = document.querySelector("#btn-buscar-movil");

btnBuscarMovil?.addEventListener("click", function() {
    inputBuscador.classList.toggle("mostrar-movil");
    navCategorias.classList.remove("mostrar-movil");

    if (inputBuscador.classList.contains("mostrar-movil")) {
        inputBuscador.focus();
    }
});

document.addEventListener("click", function(e) {
    const buscadorAbierto = inputBuscador.classList.contains("mostrar-movil");

    if (
        buscadorAbierto &&
        !inputBuscador.contains(e.target) &&
        !btnBuscarMovil.contains(e.target)
    ) {
        inputBuscador.classList.remove("mostrar-movil");
    }
});

document.addEventListener("click", function(e) {
    const carritoAbierto = seccionCarrito.classList.contains("mostrar");

    if (
        carritoAbierto &&
        !seccionCarrito.contains(e.target) &&
        !botonCarrito.contains(e.target)
    ) {
        seccionCarrito.classList.remove("mostrar");
    }
});

document.addEventListener("click", function(e) {
    const menuAbierto = navCategorias.classList.contains("mostrar-movil");

    if (
        menuAbierto &&
        !navCategorias.contains(e.target) &&
        !btnMenuMovil.contains(e.target)
    ) {
        navCategorias.classList.remove("mostrar-movil");

        cerrarSubmenus();
    }
});

document.querySelectorAll(".cat-item").forEach(function(item) {
    const link = item.querySelector(".cat-link");
    link?.addEventListener("click", function() {
        const yaEstabaAbierto = item.classList.contains("abierto");
        cerrarSubmenus();
        if (!yaEstabaAbierto) {
            item.classList.add("abierto");
        }
    });
});

const elementosRevelar = document.querySelectorAll(
    ".revelar-izquierda, .revelar-derecha"
);

const observadorRevelar = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
        entry.target.classList.toggle(
            "visible",
            entry.isIntersecting
        );
    });
}, {
    threshold: 0.25
});

elementosRevelar.forEach(function(elemento) {
    observadorRevelar.observe(elemento);
});