# Soñá y Doná — Sitio web

El sitio público de Soñá y Doná: sueños, subastas solidarias, fundaciones,
eventos y el panel de administración.

Publicado con GitHub Pages sobre el dominio **sonaydona.com** (ver `CNAME`).
Cada push a `main` queda en línea en menos de un minuto.

La API que consume vive en un repositorio aparte:
[`sonaydona/sonaydona-sistema`](https://github.com/sonaydona/sonaydona-sistema).

## Cómo está armado

No hay framework, ni build, ni dependencias que instalar. Son cuatro archivos:

| Archivo | Qué es |
|---|---|
| `index.html` | El sitio entero: estilos, marcado y lógica de pantallas |
| `backend.js` | El puente con la API y con Supabase Auth. **Lo único que sabe hablar con el servidor** |
| `servir-sin-cache.py` | Servidor local para desarrollo, que impide que el navegador cachee |
| `CNAME` | El dominio, para GitHub Pages |

### Por qué un solo archivo

`index.html` es la maqueta original con la que arrancó el proyecto, hecha sin
framework. El trabajo de backend se hizo **cableándola** contra la API real en
vez de reescribirla: así el cliente nunca perdió la pantalla que ya había
aprobado, y el riesgo de romper algo quedó acotado a las funciones que se
tocaban. Partirla en componentes era un proyecto en sí mismo, fuera del alcance
acordado.

### El mapa de `index.html`

Son 15.804 líneas, en bloques bien separados:

| Líneas | Qué hay |
|---|---|
| 1–14 | `<head>`, metas y fuentes |
| 15–4957 | **CSS** de todo el sitio (0,87 MB — incluye imágenes de fondo incrustadas) |
| 4958–4960 | Carga del cliente de Supabase (CDN) y de `backend.js` |
| 4961–5805 | **Marcado** de todas las pantallas (0,09 MB) |
| 5806–15640 | **Lógica de la aplicación** (2,78 MB — incluye las fotos de las fundaciones incrustadas) |
| 15644–15800 | La intro de bienvenida, aislada aparte |

### Cómo habla con el servidor

Todo pasa por `backend.js`, que expone un único objeto global:

```js
window.SyD = {
  supabase, auth, usuarios, suenos, subastas,
  fundaciones, eventos, donaciones, admin, fee,
  solicitudesFundacion
}
```

El resto del código llama a `SyD.subastas.ofertar(...)` y no sabe nada de
HTTP, tokens ni direcciones. **Si el backend se muda de servidor, el único
cambio es la constante `API_BASE` al principio de `backend.js`.**

La clave de Supabase que figura en `backend.js` es la **anon key**, que es
pública por diseño: va en el navegador en cualquier proyecto de Supabase y no
da acceso a nada por sí sola. Los datos los protegen las políticas de la base
y el backend, que es el único que tiene la clave de servicio.

## Trabajar en local

```bash
python3 servir-sin-cache.py        # http://localhost:8080
```

Es un `http.server` de Python con los encabezados de caché desactivados. El
servidor estándar de Python no los manda, y Chrome guarda una copia "por las
dudas": se perdió bastante tiempo mirando versiones viejas de la página antes
de resolverlo así.

Para trabajar contra un backend local, cambiar `API_BASE` en `backend.js` a
`http://localhost:4000/api` — **y volverla atrás antes de subir**, o el sitio
publicado queda apuntando a una computadora que no existe para nadie más.
