/**
 * Puente entre la maqueta de Soñá y Doná y el backend real.
 *
 * Este archivo es LO ÚNICO que sabe cómo hablar con el servidor y con
 * Supabase Auth. El resto del código de index.html (que ya existía) llama
 * a las funciones de acá (window.SyD.*) en vez de tocar directamente la
 * base de datos falsa que tenía antes.
 *
 * Si el día de mañana cambia la URL del backend (por ejemplo al pasar a
 * un dominio propio), el único cambio necesario es la constante API_BASE
 * de acá abajo.
 */
(function () {
  "use strict";

  // ── Configuración ────────────────────────────────────────────────────
  var SUPABASE_URL = "https://howwxnrhzhnwaxsyjstx.supabase.co";
  var SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhvd3d4bnJoemhud2F4c3lqc3R4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3OTczMzksImV4cCI6MjEwNDM3MzMzOX0.zkRb4UNDhF7TAxPgOsc_AKghz7eCu-YeY0j0FhEzDbA";

  // El backend publicado en Render. Es el único punto donde el front sabe
  // dónde vive la API: si algún día se muda de servidor, se cambia acá y en
  // ningún otro lado.
  //
  // Para trabajar contra el backend de tu propia máquina, cambiá esta línea
  // por "http://localhost:4000/api" (y acordate de volverla atrás antes de
  // subir, o el sitio publicado va a quedar apuntando a tu computadora).
  var API_BASE = "https://syd-backend-o8hi.onrender.com/api";

  if (!window.supabase) {
    console.error(
      "[SyD] No se encontró la librería de Supabase. Revisá que el <script> de supabase-js esté antes que backend.js."
    );
    return;
  }

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ── Llamadas a nuestra API ───────────────────────────────────────────
  // Adjunta automáticamente el token de sesión de Supabase (si hay una
  // activa) en cada pedido, así el backend sabe quién sos.
  async function apiFetch(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});

    var sesionActual = (await sb.auth.getSession()).data.session;
    if (sesionActual) headers["Authorization"] = "Bearer " + sesionActual.access_token;

    var res = await fetch(API_BASE + path, Object.assign({}, opts, { headers: headers }));

    if (!res.ok) {
      var cuerpo = {};
      try {
        cuerpo = await res.json();
      } catch (e) {
        /* respuesta sin cuerpo JSON */
      }
      var error = new Error(cuerpo.error || "Error " + res.status + " al hablar con el servidor.");
      error.status = res.status;
      error.detalles = cuerpo.detalles;
      throw error;
    }

    if (res.status === 204) return null;
    return res.json();
  }

  function get(path) {
    return apiFetch(path, { method: "GET" });
  }
  function post(path, data) {
    return apiFetch(path, { method: "POST", body: JSON.stringify(data || {}) });
  }
  function put(path, data) {
    return apiFetch(path, { method: "PUT", body: JSON.stringify(data || {}) });
  }
  function del(path) {
    return apiFetch(path, { method: "DELETE" });
  }

  // ── Auth ──────────────────────────────────────────────────────────────
  var auth = {
    async registrarse(email, password) {
      var r = await sb.auth.signUp({ email: email, password: password });
      if (r.error) throw new Error(traducirErrorAuth(r.error));
      return r.data;
    },
    async iniciarSesion(email, password) {
      var r = await sb.auth.signInWithPassword({ email: email, password: password });
      if (r.error) throw new Error(traducirErrorAuth(r.error));
      return r.data;
    },
    async iniciarSesionConGoogle() {
      var r = await sb.auth.signInWithOAuth({
        provider: "google",
        // OJO: nunca usar window.location.href acá. Si la URL ya tenía un
        // "#" (por ejemplo, de un intento anterior que dejó
        // #access_token=... pegado), Supabase concatena SU hash al final
        // y queda un "##" — supabase-js no lo puede parsear y la sesión
        // se pierde en silencio. Por eso se arma la URL limpia a mano.
        options: { redirectTo: window.location.origin + window.location.pathname },
      });
      if (r.error) throw new Error(traducirErrorAuth(r.error));
      // Google redirige la página entera, acá no hay más que hacer.
    },
    async cerrarSesion() {
      await sb.auth.signOut();
    },
    /**
     * Manda el mail con el enlace para elegir una contraseña nueva.
     *
     * La dirección de vuelta se arma igual que en el ingreso con Google: sin
     * el "#" que pudiera traer la URL actual, porque Supabase agrega el suyo
     * al final y dos "#" seguidos rompen la lectura del enlace.
     */
    async recuperarClave(email) {
      var r = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname,
      });
      if (r.error) throw new Error(traducirErrorAuth(r.error));
    },
    /** Guarda la contraseña nueva. Sólo funciona con la sesión que abre el
     *  enlace del mail, o con alguien ya logueado. */
    async cambiarClave(nueva) {
      var r = await sb.auth.updateUser({ password: nueva });
      if (r.error) throw new Error(traducirErrorAuth(r.error));
    },
    async sesionActual() {
      var r = await sb.auth.getSession();
      return r.data.session;
    },
    // Se llama una sola vez al cargar la página: reacciona a que el usuario
    // ya tenga sesión guardada, o a que Google lo acabe de redirigir de vuelta.
    // El nombre del evento importa: cuando la persona llega desde el enlace
    // de "recuperar contraseña", Supabase avisa con PASSWORD_RECOVERY y hay
    // que pedirle la clave nueva en vez de entrarla como si nada.
    onCambioDeSesion(callback) {
      sb.auth.onAuthStateChange(function (evento, session) {
        callback(session, evento);
      });
    },
  };

  function traducirErrorAuth(error) {
    var msg = error.message || "";
    if (/already registered/i.test(msg)) return "Ese mail ya tiene una cuenta creada.";
    if (/invalid login credentials/i.test(msg)) return "Mail o contraseña incorrectos.";
    if (/password should be at least/i.test(msg)) return "La contraseña necesita al menos 6 caracteres.";
    if (/email not confirmed/i.test(msg)) return "Todavía no confirmaste tu mail.";
    if (/same.*password|should be different/i.test(msg)) return "Esa es la contraseña que ya tenías. Elegí una distinta.";
    if (/for security purposes|rate limit|too many/i.test(msg)) return "Esperá un minuto antes de volver a pedirlo.";
    return msg || "Ocurrió un error. Probá de nuevo.";
  }

  // ── Perfil de usuario (nombre, apellido, teléfono, edad, género) ───────
  var usuarios = {
    obtenerPerfil: function () {
      return get("/usuarios/yo");
    },
    guardarPerfil: function (datos) {
      return put("/usuarios/yo", datos);
    },
  };

  // ── Sueños ───────────────────────────────────────────────────────────
  var suenos = {
    listarPublicos: function () {
      return get("/suenos");
    },
    obtener: function (id) {
      return get("/suenos/" + id);
    },
    publicar: function (datos) {
      return post("/suenos", datos);
    },
    // Los sueños de quien está mirando, con su estado y —si le toca pagar el
    // fee— los datos para transferir.
    mios: function () {
      return get("/suenos/mios");
    },
    // Informar que ya se transfirió el fee. `archivo` es el comprobante como
    // data URL (lo que devuelve un <input type="file"> leído con FileReader).
    informarPago: function (id, datos) {
      return post("/suenos/" + id + "/fee/comprobante", datos);
    },

    // ── admin ──────────────────────────────────────────────────────────
    // Todo lo que el admin tiene pendiente, en sus tres momentos:
    // esperando revisión, esperando el pago, y con el comprobante subido.
    listarEnProceso: function () {
      return get("/suenos/admin/en-proceso");
    },
    // Paso 1: aceptar el contenido. No pide fechas — el sueño queda
    // esperando que la persona pague el fee.
    aprobar: function (id) {
      return post("/suenos/admin/" + id + "/aprobar");
    },
    // Paso 2: verificado el comprobante, sale a subasta. Acá sí van las
    // fechas y el precio base.
    //
    // OJO con el nombre: no puede llamarse "publicar" a secas. Arriba ya hay
    // un publicar() —el que usa la persona para publicar su sueño— y el
    // segundo pisaba al primero sin avisar: publicar un sueño terminaba
    // llamando a la ruta de administración y respondía "no tenés permisos".
    publicarASubasta: function (id, datos) {
      return post("/suenos/admin/" + id + "/publicar", datos);
    },
    rechazar: function (id, motivo) {
      return post("/suenos/admin/" + id + "/rechazar", { motivo: motivo });
    },
  };

  // ── Subastas ─────────────────────────────────────────────────────────
  var subastas = {
    listar: function () {
      return get("/subastas");
    },
    obtener: function (id) {
      return get("/subastas/" + id);
    },
    crear: function (datos) {
      return post("/subastas", datos);
    },
    ofertar: function (id, monto) {
      return post("/subastas/" + id + "/ofertas", { monto: monto });
    },
    // Programadas pero todavía sin abrir: se ven, pero no se puede ofertar.
    proximas: function () {
      return get("/subastas/proximas");
    },
    // Admin: las que ya cerraron, con quién ganó y cómo contactarlo. El
    // cliente definió que al cerrar una subasta el administrador llama
    // directo al ganador, así que lo que hace falta es ver a quién llamar.
    finalizadas: function () {
      return get("/subastas/admin/finalizadas");
    },
    // Se suscribe a las ofertas nuevas en tiempo real. Con `subastaId` escucha
    // una sola subasta; sin él, todas — que es lo que necesita la pantalla del
    // listado, donde hay varias a la vez. Devuelve una función para cortar la
    // suscripción cuando se cierra la pantalla: si no, quedan conexiones
    // abiertas cada vez que se entra y se sale.
    escucharOfertas: function (subastaId, callback) {
      var filtro = { event: "INSERT", schema: "public", table: "ofertas" };
      if (subastaId) filtro.filter = "subastaId=eq." + subastaId;
      var canal = sb
        .channel("ofertas-" + (subastaId || "todas"))
        .on("postgres_changes", filtro, function (payload) {
          callback(payload.new);
        })
        .subscribe();
      return function cancelar() {
        sb.removeChannel(canal);
      };
    },
  };

  // ── Fundaciones ──────────────────────────────────────────────────────
  var fundaciones = {
    // `rama` es "donacion" o "subasta": el alta de fundaciones está dividida
    // en dos y cada sección del front pide la suya. Sin rama trae todas las
    // activas.
    listar: function (rama) {
      return get("/fundaciones" + (rama ? "?rama=" + encodeURIComponent(rama) : ""));
    },
    // Admin: incluye también las suspendidas (la de arriba solo trae activas).
    listarTodas: function () {
      return get("/fundaciones/admin/todas");
    },
    obtener: function (id) {
      return get("/fundaciones/" + id);
    },
    crear: function (datos) {
      return post("/fundaciones", datos);
    },
    editar: function (id, datos) {
      return put("/fundaciones/" + id, datos);
    },
    reactivar: function (id) {
      return put("/fundaciones/" + id, { activa: true });
    },
    suspender: function (id) {
      return del("/fundaciones/" + id);
    },
    // Borrado definitivo. El backend lo rechaza si la fundación ya tiene
    // sueños, subastas o eventos: en ese caso hay que suspenderla.
    borrar: function (id) {
      return del("/fundaciones/" + id + "/definitivo");
    },
  };

  // ── Eventos ──────────────────────────────────────────────────────────
  var eventos = {
    listar: function () {
      return get("/eventos");
    },
    crear: function (datos) {
      return post("/eventos", datos);
    },
    confirmarAsistencia: function (id) {
      return post("/eventos/" + id + "/confirmar");
    },
    // Quiénes se anotaron a un evento. Sólo para el panel: lleva mail y
    // teléfono de cada persona.
    asistentes: function (id) {
      return get("/eventos/" + id + "/asistentes");
    },
    reconfirmarAsistencia: function (id) {
      return post("/eventos/" + id + "/reconfirmar");
    },
  };

  // ── Donaciones ───────────────────────────────────────────────────────
  var donaciones = {
    listar: function (suenoId) {
      return get("/suenos/" + suenoId + "/donaciones");
    },
    registrar: function (suenoId, datos) {
      return post("/suenos/" + suenoId + "/donaciones", datos);
    },
  };

  // ── Admin: cifras y auditoría ────────────────────────────────────────
  var admin = {
    cifras: function () {
      return get("/admin/cifras");
    },
    auditoria: function () {
      return get("/admin/auditoria");
    },
    usuarios: function () {
      return get("/admin/usuarios");
    },
  };

  // ── Fee de subasta ───────────────────────────────────────────────────
  var fee = {
    iniciarCheckout: function (subastaId) {
      return post("/fee/subastas/" + subastaId + "/checkout");
    },
  };

  // ── Solicitudes de fundaciones que quieren sumarse ──────────────────
  // Pública (no hace falta sesión para pedir sumarse). El admin las ve y
  // decide si contactarlas y darlas de alta a mano en Fundaciones.
  var solicitudesFundacion = {
    crear: function (datos) {
      return post("/solicitudes-fundacion", datos);
    },
    listar: function () {
      return get("/solicitudes-fundacion");
    },
    marcarAtendida: function (id, atendida) {
      return put("/solicitudes-fundacion/" + id, { atendida: atendida });
    },
  };

  window.SyD = {
    supabase: sb,
    auth: auth,
    usuarios: usuarios,
    suenos: suenos,
    subastas: subastas,
    fundaciones: fundaciones,
    eventos: eventos,
    donaciones: donaciones,
    admin: admin,
    fee: fee,
    solicitudesFundacion: solicitudesFundacion,
  };
})();
