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
let carrito = [];

try {
    const carritoGuardado = JSON.parse(localStorage.getItem("carrito"));
    if (Array.isArray(carritoGuardado)) {
        carrito = carritoGuardado;
    }
} catch (e) {
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
        li.style.display = "flex";
        li.style.justifyContent = "space-between";
        li.style.alignItems = "center";
        li.style.marginBottom = "8px";

        li.innerHTML = `
            <span><strong>${item.nombre}</strong> (x${cantidad}) - $${subtotal.toLocaleString("es-AR")}</span>
            <button class="btn-eliminar" data-index="${index}" style="background:#d9534f; color:white; border:none; border-radius:3px; padding:2px 6px; cursor:pointer;">X</button>
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

function agregarAlCarrito(nombre, precio, img) {
    const itemExistente = carrito.find((prod) => prod.nombre === nombre);

    if (itemExistente) {
        itemExistente.cantidad = (itemExistente.cantidad || 1) + 1;
    } else {
        carrito.push({
            nombre: nombre,
            precio: precio,
            img: img || "",
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

// Evento Vaciar Carrito
if (btnVaciar) {
    btnVaciar.addEventListener("click", function () {
        carrito = [];
        guardarCarritoEnLocalStorage();
        actualizarCarritoUI();
        if (mensajePago) mensajePago.textContent = "";
         mostrarToast("🧹 Carrito vacío"); 
    });
}

// Toggle desplegar carrito visualmente
if (botonCarrito && seccionCarrito) {
    botonCarrito.addEventListener("click", function () {
        seccionCarrito.classList.toggle("mostrar");
    });
}

// Escuchar clics en botones "Agregar al carrito" de los productos
document.querySelectorAll(".producto button").forEach((boton) => {
    boton.addEventListener("click", function () {
        const contenedorProducto = this.closest(".producto");
        const nombre = contenedorProducto.querySelector("h2").textContent;
        const precioTexto = contenedorProducto.querySelector(".precio").textContent;
        const img = contenedorProducto.querySelector("img")?.src || "";

        agregarAlCarrito(nombre, precioTexto, img);
    });
});

// ==========================================
// 4. BÚSQUEDA
// ==========================================
const inputBuscador = document.querySelector("#input-buscador");
const productos = document.querySelectorAll(".producto");
const catalogo = document.querySelector("#catalogo");

function aplicarBusqueda() {
    const textoBusqueda = inputBuscador
        ? inputBuscador.value.toLowerCase().trim()
        : "";

    productos.forEach(function(prod) {
        const nombre = prod.querySelector("h2").textContent.toLowerCase();
        const coincideBusqueda = nombre.includes(textoBusqueda);

        if (coincideBusqueda) {
            prod.style.display = "flex";
        } else {
            prod.style.display = "none";
        }
    });
}

if (inputBuscador) {
    inputBuscador.addEventListener("input", aplicarBusqueda);
}

// ==========================================
// 5. CHECKOUT CON MERCADO PAGO
// ==========================================
if (btnPagar) {
    btnPagar.addEventListener("click", async function () {

        // Evitar checkout con carrito vacío
        if (!Array.isArray(carrito) || carrito.length === 0) {
            if (mensajePago) {
                mensajePago.textContent = "⚠️ Tu carrito está vacío.";
                mensajePago.style.color = "#d9534f";
            }
            return;
        }

        // Por ahora mantenemos el requisito de iniciar sesión
        const usuarioLogueado = window.auth && window.auth.currentUser;

        if (!usuarioLogueado) {
            if (mensajePago) {
                mensajePago.textContent =
                    "⚠️ Debes iniciar sesión o registrarte para continuar.";
                mensajePago.style.color = "#e8a838";
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

        btnPagar.disabled = true;
        btnPagar.textContent = "Cargando Mercado Pago...";

        if (mensajePago) {
            mensajePago.textContent = "";
        }

        try {
            const response = await fetch(
                "https://calm-tanuki-3fe837.netlify.app/.netlify/functions/createPreference",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
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
                mensajePago.textContent =
                    "❌ No pudimos iniciar el pago. Intentá nuevamente.";
                mensajePago.style.color = "#d9534f";
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
        modalHistorial.classList.remove("oculto");
        contenedorHistorial.innerHTML = "<p>Cargando tus compras...</p>";

        const usuarioLogueado = window.auth && window.auth.currentUser;
        if (!usuarioLogueado) return;

        const { collection, query, where, getDocs } = window.firestoreTools;
        const consulta = query(
            collection(window.db, "compras"),
            where("usuarioUid", "==", usuarioLogueado.uid)
        );
        const resultado = await getDocs(consulta);

        if (resultado.empty) {
            contenedorHistorial.innerHTML = "<p>Todavía no hiciste ninguna compra.</p>";
            return;
        }

        contenedorHistorial.innerHTML = "";
        resultado.forEach(function(doc) {
            const compra = doc.data();

            let itemsTexto = "";
            compra.items.forEach(function(item) {
                itemsTexto += "<li>" + item.nombre + " x" + item.cantidad + "</li>";
            });

            const divCompra = document.createElement("div");
            divCompra.className = "compra-item";
            divCompra.innerHTML = "<ul>" + itemsTexto + "</ul><p class='compra-total'>Total: $" + Number(compra.total).toLocaleString("es-AR") + "</p>";

            contenedorHistorial.appendChild(divCompra);
        });
    });
}

if (btnCerrarModal) {
    btnCerrarModal.addEventListener("click", function() {
        modalHistorial.classList.add("oculto");
    });
}

const catLinks = document.querySelectorAll(".cat-link");

catLinks.forEach(function(link) {
    link.addEventListener("click", function() {
        catLinks.forEach(function(l) { l.classList.remove("activo"); });
        link.classList.add("activo");

        const genero = link.getAttribute("data-genero");

        productos.forEach(function(prod) {
            if (genero === "todos" || prod.getAttribute("data-genero") === genero) {
                prod.style.display = "flex";
            } else {
                prod.style.display = "none";
            }
        });
    });
});

const subLinks = document.querySelectorAll(".sub-link");

subLinks.forEach(function(link) {
    link.addEventListener("click", function(e) {
        e.preventDefault();

        catLinks.forEach(function(l) {
            l.classList.remove("activo");
        });

        const genero = link.getAttribute("data-genero");
        const tipo = link.getAttribute("data-tipo");

        productos.forEach(function(prod) {
            const coincideGenero =
                genero === "todos" ||
                prod.getAttribute("data-genero") === genero;

            const coincideTipo =
                tipo === "todos" ||
                prod.getAttribute("data-tipo") === tipo;

            if (coincideGenero && coincideTipo) {
                prod.style.display = "flex";
            } else {
                prod.style.display = "none";
            }
        });

        navCategorias.classList.remove("mostrar-movil");

        document.querySelectorAll(".cat-item").forEach(function(item) {
            item.classList.remove("abierto");
        });

        if (catalogo) {
            catalogo.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }
    });
});

const botonUsuario = document.querySelector("#boton-usuario");
const seccionAuth = document.querySelector("#seccion-auth");
const btnCerrarAuth = document.querySelector("#btn-cerrar-auth");

btnCerrarAuth?.addEventListener("click", function() {
    seccionAuth.classList.remove("mostrar");
});

seccionAuth?.addEventListener("click", function(e) {
    if (e.target === seccionAuth) {
        seccionAuth.classList.remove("mostrar");
    }
});


botonUsuario?.addEventListener("click", function() {
    seccionAuth.classList.toggle("mostrar");
});

const header = document.querySelector(".hero");

window.addEventListener("scroll", function() {
    if (window.scrollY > 40) {
        header.classList.add("scrolled");
    } else {
        header.classList.remove("scrolled");
    }
});

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

        document.querySelectorAll(".cat-item").forEach(function(item) {
            item.classList.remove("abierto");
        });
    }
});

document.querySelectorAll(".cat-item").forEach(function(item) {
    const link = item.querySelector(".cat-link");
    link?.addEventListener("click", function() {
        const yaEstabaAbierto = item.classList.contains("abierto");
        document.querySelectorAll(".cat-item").forEach(function(i) {
            i.classList.remove("abierto");
        });
        if (!yaEstabaAbierto) {
            item.classList.add("abierto");
        }
    });
});
