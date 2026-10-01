# F2+F3 (antes Craftshot) — contexto para agentes

App de escritorio (Electron + React + TypeScript) que gestiona las capturas de Minecraft con estética del Minecraft
Launcher, más un mod Fabric para Minecraft 26.3 (**F2+F3 Companion**, en el repo aparte `../f2f3-companion`) que guarda los datos exactos
del juego junto a cada captura y lleva la app dentro del juego. **UI y textos en español. Código y comentarios en inglés.**

**Estado (2026-09-30):** app y mod estables; la hoja de ruta "Minecraft técnico" (6 fases) está completa. Árbol de
trabajo limpio, 167 tests. Repo: github.com/MguevaraJ/f2f3 (`master`); el mod va en su propio repo
(`../f2f3-companion`, github.com/MguevaraJ/f2f3-companion). Pendientes y decisiones abiertas al final.

## Nombre
La app se llama **F2+F3** y el mod **F2+F3 Companion** (ya existía otra "Craftshot"). Solo cambió lo visible: títulos,
textos, `app.setName('F2+F3')`, nombre del mod y de su pantalla. En electron-builder `productName: F2F3` ("+" no vale
en nombres de archivo → `dist/F2F3-1.0.0.AppImage`) y `linux.desktop.entry.Name: F2+F3`.
**Se conservan a propósito** los identificadores internos (cambiarlos rompe datos existentes):
carpeta de datos `~/.config/Craftshot` (fijada con `app.setPath('userData', …)` salvo que se pase `--user-data-dir`),
`appId dev.mguevara.craftshot`, protocolo `craftshot://`, sufijos `.craftshot.json` / `.craftshot.nbt`, formato
`craftshot-companion`, id del mod `craftshot_companion`, jar `craftshot-companion-*.jar`, espacio `craftshot:` de las
plantillas, `craftshot/app-index.json`, carpeta "Craftshot" de Google Drive, variables `CRAFTSHOT_*`, paquete Java
`dev.mguevara.craftshot.companion`, nombre del repo y de `package.json`.

## Comandos
```bash
npm run dev            # desarrollo
npm run build          # typecheck + build + scripts/check-preload.mjs (falla si un preload usa chunks)
npm run typecheck && npx eslint . && npx vitest run    # verificación estándar (167 tests)
npx prettier --write <archivos>                        # el repo va formateado con prettier
npm run build:mod      # compila los tres mods de ../f2f3-companion y copia los jar a resources/ (juego de prueba CERRADO)
npm run dist:linux     # AppImage (el .env con MAIN_VITE_GOOGLE_CLIENT_ID/SECRET se incrusta)
npm run ocr -- <png…>  # OCR del F3 desde terminal
npm run eval:local -- <png…>   # evalúa el modelo local (CLIP); MODEL_CACHE=dir
npm run build:labels   # regenera src/core/localvision/labels.json tras cambiar prompts
```
Commits: autor "Moises Guevara <mguevaraj27@gmail.com>", terminar con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Arquitectura
```
src/core/      lógica pura (sin Electron): font/ (glifos del .jar), ocr/, f3/parseF3.ts, vision/sceneHeuristics.ts,
               localvision/ (CLIP), backup/plan.ts, companion/ (parseCompanion.ts, structure.ts), nbt/readNbt.ts, analyze.ts
src/shared/    types.ts, ipc.ts (contrato IPC tipado), popupIpc.ts, f3Tips.ts, worlds.ts, slime.ts, planner.ts,
               placement.ts, gameIndex.ts, catalog/{biomes,mobs,structures,villagers}.ts
src/main/      index.ts, services/ (Library, MetadataStore, Settings, SecretStore, WorkerPool, Thumbnail, Analysis,
               LocalVision, Backup, CaptureWatcher, GameIndexExporter, MinecraftLocator), minecraft/ (gameDirs.ts,
               worlds.ts), vision/ (proveedores IA), google/ (OAuth+Drive), notifier/CapturePopup.ts,
               BackgroundController.ts, autostart/, workers/, ipc/registerIpc.ts, protocol.ts (craftshot://)
src/preload/   index.ts (API principal) y popup.ts (API mínima del popup) — NO pueden compartir módulos runtime
src/renderer/  React + Zustand. features/{gallery,viewer,details,coords,map,settings,library}, components/
               (Onboarding, GameFolderPicker, Sidebar…), lib/, store/, styles/
tests/         vitest (+ fixtures reales: PNG del F3, sidecars y .nbt en tests/fixtures/companion/)
```
El renderer **no puede importar `@core`**: la lógica compartida va en `src/shared`.
Seguridad: contextIsolation, sandbox, CSP, rutas del renderer validadas con `LibraryService.resolveId`, claves solo en main (safeStorage).
React: el lint prohíbe `setState` dentro de efectos → reiniciar estado durante el render con una clave. `content-visibility: auto` recorta lo pintado fuera (outline).

## Modelo de análisis
`ScreenshotAnalysis` guarda **fuentes separadas** y `resolveAnalysis()` (src/core/analyze.ts) calcula lo que se muestra:
- Fuentes: `mod` (sidecar), `f3` (OCR), `vision` (IA), `local` (CLIP), `heuristic` (colores), `manualBiome`.
- Prioridad: **manual > mod > f3 > vision > local > heuristic**. Con mod, los mobs son solo los del mod; estructuras del mod + las de la IA.
- Resueltos: `location` (mod > F3; la UI usa `location`, no `f3.block`), `dimension`, `biome`, `mobs`, `structures`, `build`.
- `carryOver()` conserva vision/local/manual al reanalizar. **Subir `ANALYSIS_SCHEMA`** (ahora 9) al cambiar el pipeline.
- Caché en `~/.config/Craftshot/library.json` por ruta absoluta + fingerprint `${size}-${mtime}[-m<mtime del sidecar>]`.
- Etiquetas de origen: `src/renderer/src/lib/sources.ts` (SOURCE_INFO, LEVELS, MOD_LEVEL).
- El análisis corre en `src/main/workers/analysis.worker.ts` (pngjs + `analyzeImage`; lee sidecar y `.nbt`).
- Zod con secciones tolerantes: una sección mal formada del sidecar se descarta sola (`.catch`).

## Carpetas de juego
Todo cuelga de la **carpeta del juego** = padre de la carpeta de capturas (`saves/`, `mods/`, `schematics/`,
`craftshot/app-index.json`). **No asumir `~/.minecraft`.**
- Launcher oficial: `.minecraft` es a la vez raíz del launcher (`versions/`, `assets/`) y carpeta de juego.
- Launchers de instancias (SKLauncher `~/.sklauncher/instances/<id>` con `instances.json` {name, directory,
  minecraftVersion, gameType, lastPlayed}; Prism, MultiMC, Modrinth, CurseForge, ATLauncher, GDLauncher): cada
  instancia es una carpeta de juego y `versions/` está más arriba. Solo SKLauncher está probado con una instalación real.
- `src/main/minecraft/gameDirs.ts` (tests `tests/gameDirs.test.ts`): `detectInstalls(env)` → `MinecraftSource[]`
  (label, path = su `screenshots`, gameDir, launcher, name, version, loader, lastUsed, hasMod, count), más reciente
  primero; `launcherRootOf(gameDir)` (sube hasta 4 niveles buscando `versions/`; lo usa la fuente del OCR);
  `screenshotsDirFor(elegida)` (acepta carpeta de juego, de capturas o cualquiera). `MinecraftLocator` es la fachada.
- **Varias a la vez**: `settings.screenshotsDirs` (lista; `screenshotsDir` = la primera, sincronizada en `sanitize`;
  migración en `SettingsService`). `LibraryService(roots: {path, label}[])`: con una raíz los ids son rutas relativas;
  con varias llevan delante el "mount" (etiqueta saneada, p. ej. `SKLauncher - Fabric 26.3/2026….png`), cada raíz es una
  carpeta de primer nivel del árbol y `entry.source` = mount. `resolveId` / `toId` / `rootOf(id)`; `snapshot.roots`
  {path, label, mount, exists}. En el nivel superior no se puede crear/pegar/importar, ni renombrar/borrar una raíz.
  Por raíz: su `app-index.json`, sus mundos y su `schematics` (`rootOf(id)`; IPC `companion.listSaves(id)`).
  Respaldo: `backupPath` / `idOfBackupPath` — la primera raíz conserva rutas sin prefijo para no volver a subir nada al
  añadir una segunda (no probado contra Drive real). `worldOf` salta el mount al deducir el mundo por carpeta.
- UI: `components/GameFolderPicker.tsx` (casillas; siempre queda una marcada), en el onboarding y en Ajustes ›
  "Carpetas de juego". `settings.gameDirConfirmed`: a quien ya había pasado el onboarding se le pregunta una vez.
  Primera ejecución: por defecto, la carpeta jugada más recientemente.
- "Guardar el mod (.jar)" abre el diálogo en `mods/` de la carpeta de juego (la primera marcada que ya tenga `mods/`,
  si no la primera; la crea si falta). Nunca se instala solo: confirma el usuario.

## Onboarding (`components/Onboarding.tsx`)
5 pasos, breve a propósito (una línea por cosa): **Inicio** (lo básico) → **Tu Minecraft** (carpetas, obligatorio; no
se puede terminar ni saltar sin confirmar) → **Los datos** (niveles F3/local/IA, descarga del modelo local en línea,
nota del bioma en F3) → **El mod** (qué añade + "Guardar el mod") → **Avanzado** (`ADVANCED`: mapa, planificadores,
datos técnicos, builds). Se reabre desde Ajustes › "Ver la introducción de nuevo".

## Funciones de la app (hoja de ruta "Minecraft técnico", completa)
1. **Parser F3 técnico** (26.3): `server` (MSPT/TPS, /tick, brand), `spawnCounts` (mob caps, orden de MobCategory: MO C
   AM AX UWC WC WA MI; en 1.20.1 por posición), `day`, `speed`, `heightmaps`, `targetedBlock.state`/`tags`. UI: sección
   "Técnico" + `lib/technical.ts`. Fixture `tests/fixtures/f3-26.3-technical-scale2.png`. Perfil del F3 del cliente de
   prueba: `../f2f3-companion/fabric-26.3/run/debug-profile.json`.
2. **Mapa** (`features/map/`: `view.ts` puro, `drawMap.ts` canvas con `Shape` genérico, `MapView.tsx`): por mundo y
   dimensión, Nether⇄Overworld (×8), chunks/regiones, chunks slime (`shared/slime.ts`, BigInt, validado contra
   `WorldgenRandom.seedSlimeChunk`, sal 987234911), medir. Mundos (`shared/worlds.ts`): `meta.world` manual > nombre del
   mod > carpeta. Semillas: `settings.worldSeeds` > semilla del mod. Waypoints Xaero (`dim%0/-1/1/mw$default_1.txt`,
   JourneyMap los importa): IPC `library.exportWaypoints` → .zip.
3. **Datos del mod ampliados** (campos opcionales en schema 1): `game`, `mods`, `nearby`, y en un jugador `spawn`,
   `gamerules`, `target.block` {state, signal, container}, `target.entity.villager` {profession, level, trades…}.
   UI: `features/details/TechnicalPanels.tsx`, `parts.tsx`, catálogo `shared/catalog/villagers.ts`. Ojo: leer
   `getOffers()` genera los tratos de un aldeano que aún no los tenía.
4. **Planificadores** (botones "AFK" y "Portales" del Mapa): `shared/planner.ts` (tests), `features/map/planners.ts`,
   `PlannerPanels.tsx`. Mecánicas verificadas en el bytecode: mobs aparecen a 24–128 bloques (esfera 3D), un chunk
   genera mobs si su centro está a <128 bloques horizontales, entidades en el cuadrado de chunks ≤ simulación y
   redstone un chunk más; portales: cuadrado ±16 (Nether) / ±128 (Overworld), toda la altura, el más cercano en 3D y
   luego el más bajo.
5. **Builds**: el mod guarda `NOMBRE.craftshot.nbt` (estructura vanilla) y `build` {file, origin, size, blocks,
   entities, template} en el JSON. App: `core/nbt/readNbt.ts`, `core/companion/structure.ts` (`summarizeStructure`;
   paleta `Name ?? id`), `buildPathFor`/`sidecarPathsFor` (el .nbt sigue a la imagen al mover/renombrar/borrar),
   `features/details/BuildSection.tsx` (materiales en stacks, "Guardar .nbt…", "Pegarlo donde estaba"),
   `shared/placement.ts` (`placeCommand`: `/place template <id> ~dx ~dy ~dz [rotación]`; clockwise_90 = (x,z)→(−z,x)),
   `main/minecraft/worlds.ts` (`listSaves`, `installTemplate` en `saves/<mundo>/generated/<ns>/structure/`).
6. **La app dentro del juego**: `shared/gameIndex.ts` (`buildGameIndex`, puro, test) + `GameIndexExporter` escriben
   `<carpeta del juego>/craftshot/app-index.json` (solo si esa carpeta tiene `saves/` u `options.txt`), 1,5 s después
   de `library changed`, `analysis updated` o `setMeta`. Formato: `shots[id relativo a screenshots] {world, dimension,
   block, favorite, note, tags, sections[{title, rows[[etiqueta, valor]]}]}` — las filas van ya redactadas en español
   y el mod solo las pinta.

7. **Planes en el juego**: los paneles AFK y Portales tienen "Mostrar en el juego" / "Quitar" → IPC
   `companion.sendPlan(world, patch)` → `main/minecraft/plans.ts` escribe `<carpeta del juego>/craftshot/plans.json` en
   todas las carpetas de juego. Formato y limpieza en `shared/gamePlans.ts` (`mergeGamePlans`, test): `worlds[nombre]
   {seed?, afk? {dimension, spot, kind, simulation, farms[{x, y|null, z, label, level, text}]}, portals? {aDim, a, b}}`;
   en el parche, clave ausente = se conserva, null = se quita. Los planes de la app siguen sin persistir (se envían a mano).

Otros arreglos de UI de esta etapa: clic normal solo abre el visor y la casilla selecciona; resumen de selección
múltiple (`lib/selectionSummary.ts`, `SelectionSummary.tsx`); flechas y transición suave del visor (`ViewerFrame` sin
clave por captura).

## Mod "F2+F3 Companion" (repo aparte: `../f2f3-companion`)
El código del mod (Fabric 26.3, 1.21.1 y 1.20.1) vive en su propio repositorio, con su `CLAUDE.md` (clases, mixins,
APIs por versión, cómo probarlo). Aquí solo quedan los jars compilados (`resources/craftshot-companion*.jar`), el
contrato JSON y los fixtures reales (`tests/fixtures/companion/`). `npm run build:mod` (`scripts/build-mod.mjs`)
compila los tres proyectos de `../f2f3-companion` (o `F2F3_COMPANION_DIR`) y copia los jars.
App: `shared/modVersions.ts` (`MOD_VERSIONS`), `components/SaveModButton.tsx` (selector de versión + botón, en
Ajustes y onboarding), `companion.saveMod(version)`. `installTemplate` usa `structures` (plural) en mundos anteriores
a 1.21 según el `DataVersion` del `level.dat`. Teclas del mod: F6 galería, H guía, J planes (Mayús+J chunks slime),
M lista de materiales, Mayús+F2 build.

### Contrato JSON del sidecar (schema 1) — mantenerlo estable, es la API entre mod y app
```json
{ "format": "craftshot-companion", "schema": 1,
  "mod": { "name": "F2+F3 Companion", "version": "1.0.0+26.3", "loader": "fabric", "minecraft": "26.3" },
  "capturedAt": "2026-09-29T15:32:10.123Z",
  "world": { "type": "singleplayer|multiplayer|realms", "name": "…", "seed": "123", "dimension": "minecraft:overworld",
             "day": 12, "timeOfDay": 6000, "weather": "clear|rain|thunder" },
  "player": { "position": {"x":0,"y":0,"z":0}, "block": {…}, "chunk": {…},
              "facing": {"direction":"north","yaw":-151.8,"pitch":6.4}, "gameMode": "survival" },
  "biome": "minecraft:plains", "light": {"sky":15,"block":0},
  "target": { "block": {"id":"minecraft:stone","pos":{…}}, "entity": {"id":"minecraft:zombie","distance":3.2} },
  "entities": [ {"id":"minecraft:cow","count":3,"nearest":12.5} ],
  "structures": { "inside": ["minecraft:village_plains"], "target": [] },
  "build": { "file": "….craftshot.nbt", "origin": {…}, "size": {…}, "blocks": 173, "entities": 0, "template": "craftshot:casa" } }
```
`seed` solo en un jugador y **como string**; `structures` ausente = desconocido (multijugador). `entities` = seres vivos
visibles (dentro del campo de visión y con línea de visión, ≤96 bloques). Más los campos opcionales de la fase 3.


## Pruebas y entorno
- El usuario usa **i3** (tiling): las ventanas cambian de tamaño al abrirse otras; medir con `xdotool getwindowgeometry`
  antes de hacer clic. Captura: `import -window <id>`. Comprobar `xdotool getactivewindow getwindowname` antes de teclear.
- App: modo debug `CRAFTSHOT_CAPTURE=out.png CRAFTSHOT_SIZE=1440x900 [CRAFTSHOT_SCRIPT=js] npx electron . --user-data-dir=<tmp>`
  (tras `npm run build`). En el `settings.json` de prueba poner `onboardingDone` **y** `gameDirConfirmed`.
  **No tocar la instancia de la app que tenga abierta el usuario.**
- Minecraft del usuario: 26.3 (GUI scale 2; el F3 de 1.21.9+ oculta el bioma por defecto) y 1.20.1 Forge; juega con el
  launcher oficial (`~/.minecraft`) y con SKLauncher (`~/.sklauncher`).
- Preferencia del usuario: **ahorrar tokens** — pocas capturas de pantalla (recortadas), salidas filtradas, mensajes breves.
- Nunca instalar el jar por cuenta propia en una carpeta `mods` del usuario.

## Pendientes y decisiones abiertas
- Ports 1.21.1 y 1.20.1 sin probar: multijugador, guía, deshacer, villagers/cofres apuntados, gráficos "Fabulosos",
  el selector de versión de "Guardar el mod" en pantalla y `installTemplate` en un mundo 1.20.1. Forge: no hay port.
- Nombres de ítems y bloques en español en la app (leer `es_es.json` de los assets de la versión); hoy salen en inglés
  (`prettifyId`).
- Renombrar lo interno que aún dice "craftshot" y que el usuario ve (jar, espacio `craftshot:` del `/place`, carpeta
  de Drive): ofrecido, sin decidir; los dos últimos necesitan migración.
- Abrir chat/inventario cancela la selección y la colocación de builds aunque estén fijadas.
- Sin probar en real: respaldo en Drive con varias carpetas, guía entre dimensiones, galería del mod en multijugador,
  `.deb`, y el diálogo nativo de "Guardar el mod".
- `dist/Craftshot-1.0.0.AppImage` es un resto del nombre anterior.
- Ideas: cajas de estructuras, cubiomes-WASM (confirmar soporte 26.x), guardar los planes del mapa en la app, repetir una captura desde el mismo punto.
