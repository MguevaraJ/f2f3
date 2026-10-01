# F2+F3

Gestor de capturas de Minecraft con la estética del Minecraft Launcher. Lee automáticamente
la pantalla **F3** de cada captura y la muestra organizada (coordenadas, chunk, región, orientación,
dimensión, bioma, entidad apuntada, sistema…), con botones para copiar cada dato, un visor de imágenes
completo y gestión de archivos.

El mod opcional de Fabric que guarda los datos exactos del juego junto a cada captura está en
[f2f3-companion](https://github.com/MguevaraJ/f2f3-companion).

La interfaz está en español e inglés (botón ES | EN en la cabecera). The interface is available in Spanish and
English (ES | EN switch in the header).

## Funciones

- **Galería** de `.minecraft/screenshots` agrupada por día, con miniaturas en caché y vigilancia de la
  carpeta (las capturas nuevas aparecen solas).
- **Lectura del F3 sin internet**: OCR píxel a píxel con la fuente bitmap real de Minecraft, extraída
  del `.jar` del juego instalado. Detecta la escala GUI, admite texto de color y overlays de mods.
  Precisión 100 % en capturas vanilla (ver tests).
- **Datos organizados** y botones de copiar: bloque, XYZ exacto, comando `/tp` (con `execute in` de la
  dimensión), equivalente Nether ⇄ Overworld (÷8 / ×8), chunk, archivo de región, bioma, texto completo.
- **Tres niveles de información**, siempre etiquetados en la interfaz (y explicados en el onboarding):
  1. **F3 · Exacto** — leído del overlay. Si tu versión oculta el bioma (1.21.9+), la app lo detecta y
     explica cómo activarlo (F3+F6).
  2. **Modelo local · Estimado** — CLIP en tu equipo (descarga única ~170 MB, opcional): bioma básico y
     mob en la mira. Conservador: solo responde con confianza alta (calibrado con `npm run eval:local`).
     Sin él se usa una aproximación por colores (etiqueta *Colores*).
  3. **IA avanzada · Opcional** — Claude, Gemini, OpenAI (o compatible: OpenRouter, LM Studio…) u
     **Ollama** local y gratis: bioma preciso, todos los mobs, **estructuras** (aldeas, templos,
     fortalezas…), clima y hora.
  El bioma también se puede fijar a mano. Prioridad: manual > F3 > IA > local > colores.
- **Visor**: zoom con rueda anclado al cursor (5 %–3200 %), arrastrar, ajustar/1:1, rotar, voltear,
  píxeles nítidos al ampliar, cuentagotas (coordenada + color del píxel), pantalla completa,
  tira de miniaturas y panel de información.
- **Archivos**: carpetas, copiar/cortar/pegar, arrastrar a carpetas, renombrar, eliminar (a la papelera),
  importar arrastrando desde el sistema, copiar imagen al portapapeles.
- **Exportar selección**: las capturas seleccionadas a un **ZIP** (conserva subcarpetas; eliges dónde
  guardarlo), o sus datos a CSV/JSON.
- **Buscar, filtrar y ordenar** por fecha, nombre, tamaño, X/Y/Z, distancia, bioma, dimensión, mobs,
  favoritas y origen del dato. La búsqueda admite predicados de coordenadas: `x>1000 y<0`.
- **Pestaña Coordenadas**: tabla tipo waypoints con distancia a un punto de referencia, exportable a
  **Excel (.xlsx)** o **CSV** tal como se ve (filtro, orden, conversión Nether ⇄ Overworld, distancia),
  con columnas extra: XYZ exacto, chunk, región, orientación, mobs, nota y comando `/tp`.

- **Copia de seguridad en Google Drive**: conecta tu cuenta y F2+F3 sube tus capturas a
  *Mi unidad › F2+F3 › minecraft* con tus mismas carpetas, más `f2f3-datos.json` (notas,
  favoritas, datos del F3). Es incremental (compara MD5), verifica cada subida, detecta renombres y
  movimientos (mueve el archivo en Drive en vez de volver a subirlo), nunca borra nada de Drive, puede
  respaldar automáticamente cada captura nueva y **restaurar** las que falten en tu equipo.

- **Aviso de captura nueva**: al pulsar F2 en Minecraft aparece un aviso en la esquina inferior
  derecha de la pantalla (siempre encima y sin quitarle el foco al juego) con la miniatura y las
  coordenadas del F3, y botones para copiar `X Y Z`, el `/tp` o abrir la captura. Mientras está
  visible, **Ctrl+Shift+C** copia las coordenadas sin salir del juego. Opcionalmente, las coordenadas
  se copian solas.

- **Segundo plano**: al cerrar la ventana, F2+F3 pregunta si cerrarse o seguir en segundo plano
  (con avisos de capturas y respaldos activos). En Windows/macOS queda un icono en la bandeja; en Linux,
  sin bandeja por defecto: se vuelve a abrir ejecutando F2+F3 otra vez (instancia única). La
  elección se puede recordar y cambiar en Ajustes.
- **Iniciar con el sistema** (desactivado por defecto): arranca en segundo plano al iniciar sesión.
  Windows/macOS usan los elementos de inicio del sistema; Linux, `~/.config/autostart/f2f3.desktop`
  (GNOME, KDE, XFCE… y i3/sway con `dex -a`).

## Uso

```bash
npm install
npm run dev          # desarrollo con recarga
npm run build        # typecheck + build de producción
npm start            # ejecuta el build
npm run dist:linux   # AppImage (también `npm run dist` según la plataforma)
npm test             # tests (el OCR usa el .jar de ~/.minecraft; se omiten si no hay)
npm run ocr -- ~/.minecraft/screenshots/*.png   # OCR desde la terminal
npm run eval:local -- ~/.minecraft/screenshots/*.png   # evalúa el modelo local
npm run build:labels   # regenera las etiquetas del modelo local (tras cambiar prompts)
```

Para la visión IA: Ajustes → *Visión con IA* → pega tu API key de Anthropic (se guarda cifrada con el
llavero del sistema vía `safeStorage`) o define `ANTHROPIC_API_KEY`. Cada captura analizada es una
petición a la API con coste; los lotes de más de 3 piden confirmación.

### Google Drive: registro de la app (una sola vez, lo hace quien publica F2+F3)

Los usuarios solo ven **"Continuar con Google"**. Para que ese botón funcione, la app debe estar
registrada ante Google una vez, igual que cualquier app con "Iniciar sesión con Google":

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials): crea un proyecto y
   activa la **Google Drive API**.
2. *Pantalla de consentimiento*: tipo **Externo**, nombre "F2+F3", logo y correo de soporte;
   agrega el permiso `…/auth/drive.file`. Mientras esté en modo *Prueba* solo pueden entrar los
   usuarios de prueba que agregues (y la sesión caduca a los 7 días); para uso público pulsa
   **Publicar app**.
3. Crea un **ID de cliente de OAuth** de tipo **App de escritorio**.
4. Copia `.env.example` a `.env` con el ID y el secreto, y compila (`npm run dist`). En apps de
   escritorio Google no considera confidencial ese secreto; va dentro del instalable.

La app solo pide `drive.file` (ve únicamente los archivos que ella crea). El inicio de sesión usa el
navegador del sistema con redirección a `127.0.0.1` y PKCE; el token se guarda cifrado con el llavero
del sistema y nunca llega al renderer.

## Arquitectura

```
src/
  core/        Lógica pura, sin Electron (testeable con Node)
    font/        Carga los glifos de la fuente de Minecraft desde el .jar / resource pack
    ocr/         OCR del overlay F3 (escala GUI, grilla de líneas, decodificación por glifos)
    f3/          Parser de líneas → F3Data estructurado
    vision/      Estimación de bioma/dimensión por colores
    localvision/ Clasificador local (CLIP): preprocesado, etiquetas precalculadas y reglas de decisión
    backup/      Planificador del respaldo (subir / actualizar / mover / omitir), puro y testeado
    analyze.ts   Pipeline local + fusión con resultados de visión (precedencia F3 > IA > estimado)
  shared/      Tipos, contrato IPC tipado y catálogos (biomas y mobs con nombres en español)
  main/        Proceso principal
    services/    Settings, Library (escaneo, watch, operaciones de archivo), Metadata (caché JSON
                 atómica), WorkerPool, Thumbnail, Analysis (colas OCR/IA), Vision (Claude),
                 Backup (Google Drive), SecretStore (credenciales cifradas)
    vision/      IA avanzada: prompt/esquema comunes y proveedores (Claude SDK, OpenAI, Gemini, Ollama)
    google/      OAuth (loopback + PKCE) y cliente REST de Drive con reintentos y backoff
    workers/     Worker thread: decodifica PNG, OCR y miniatura fuera del hilo principal
    protocol.ts  Esquema f2f3:// para imágenes y miniaturas (sin exponer file://)
    ipc/         Handlers con validación de argumentos
  preload/     Puente mínimo y tipado (contextBridge)
  renderer/    React + Zustand
    features/    gallery, viewer, details, coords, settings, library (acciones)
    components/  Shell del launcher (sidebar, cabecera, barra PLAY), overlays, McText
```

Seguridad: `contextIsolation`, `sandbox`, sin `nodeIntegration`, CSP estricta, navegación y ventanas
emergentes bloqueadas, permisos denegados, rutas del renderer validadas contra la carpeta raíz, la API
key nunca llega al renderer.

### Depuración visual

`F2F3_CAPTURE=/tmp/out.png [F2F3_SIZE=1440x900] [F2F3_SCRIPT="js"] npm start`
guarda una captura de la ventana y cierra la app.

## Firma de código

El instalador de Windows se compila en GitHub Actions a partir de este repositorio
([`.github/workflows/release.yml`](.github/workflows/release.yml)) y se firma a través de SignPath.

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by
[SignPath Foundation](https://signpath.org/).

- Autor, revisor y quien aprueba cada firma: [Moises Guevara](https://github.com/MguevaraJ).
- Solo se firman las versiones publicadas en la página de releases de este repositorio.

### Privacidad

Este programa no envía información a otros sistemas en red salvo que lo pida quien lo usa. Las únicas conexiones
son opcionales y las inicia el usuario: el respaldo en su propia cuenta de Google Drive, la descarga del modelo local
de reconocimiento y el análisis con el proveedor de IA que configure con su propia clave.

## Licencia

[MIT](LICENSE).
