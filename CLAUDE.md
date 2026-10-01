# Craftshot — contexto para agentes

App de escritorio (Electron + React + TypeScript) que gestiona las capturas de Minecraft (`~/.minecraft/screenshots`)
con estética del Minecraft Launcher. Lee el F3 de cada captura por OCR, muestra coordenadas/bioma/mobs/estructuras,
visor, carpetas, respaldo en Google Drive y avisos de capturas nuevas. **UI y textos en español.** Código y comentarios en inglés.

**Tarea en curso: el mod Fabric "Craftshot Companion" para Minecraft 26.3** (ver sección al final).

## Comandos
```bash
npm run dev            # desarrollo
npm run build          # typecheck + build + scripts/check-preload.mjs (falla si un preload usa chunks)
npm run typecheck && npx eslint . && npx vitest run    # verificación estándar (154 tests)
npm run dist:linux     # AppImage (el .env con MAIN_VITE_GOOGLE_CLIENT_ID/SECRET se incrusta)
npm run ocr -- <png…>  # OCR del F3 desde terminal
npm run eval:local -- <png…>   # evalúa el modelo local (CLIP); MODEL_CACHE=dir
npm run build:labels   # regenera src/core/localvision/labels.json tras cambiar prompts
```
Commits: autor "Moises Guevara <mguevaraj27@gmail.com>", terminar con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Arquitectura
```
src/core/      lógica pura (sin Electron): font/ (glifos del .jar), ocr/ (OCR del F3), f3/parseF3.ts,
               vision/sceneHeuristics.ts (colores), localvision/ (CLIP), backup/plan.ts, analyze.ts
src/shared/    types.ts, ipc.ts (contrato IPC tipado), popupIpc.ts, f3Tips.ts, catalog/{biomes,mobs,structures}.ts
src/main/      index.ts, services/ (Library, Metadata, Settings, SecretStore, WorkerPool, Thumbnail, Analysis,
               LocalVision, Backup, CaptureWatcher), vision/ (proveedores IA), google/ (OAuth+Drive),
               notifier/CapturePopup.ts, BackgroundController.ts, autostart/, workers/, protocol.ts (craftshot://)
src/preload/   index.ts (API principal) y popup.ts (API mínima del popup) — NO pueden compartir módulos runtime
src/renderer/  React + Zustand. features/{gallery,viewer,details,coords,settings,library}, components/, lib/, store/
tests/         vitest (+ fixtures PNG reales)
```
Seguridad: contextIsolation, sandbox, CSP, rutas del renderer validadas con `LibraryService.resolveId`, claves solo en main (safeStorage).

## Modelo de análisis (clave para integrar el mod)
`ScreenshotAnalysis` guarda **fuentes separadas** y `resolveAnalysis()` (src/core/analyze.ts) calcula los valores mostrados:
- Fuentes: `f3` (OCR), `heuristic` (colores), `local` (CLIP), `vision` (IA avanzada), `manualBiome`.
- Prioridad: **manual > f3 > vision > local > heuristic**. `InfoSource = 'f3'|'vision'|'local'|'heuristic'|'manual'`.
- Resueltos: `dimension`, `biome`, `mobs` (MobInfo con `source`), `structures` (StructureInfo, ids del catálogo).
- `carryOver()` conserva vision/local/manual al reanalizar. **Subir `ANALYSIS_SCHEMA`** al cambiar el pipeline.
- Caché en `~/.config/Craftshot/library.json` por ruta absoluta + fingerprint `${size}-${mtime}` (LibraryService.fingerprintOf).
- Etiquetas de origen en la UI: `src/renderer/src/lib/sources.ts` (SOURCE_INFO, LEVELS). Onboarding: components/Onboarding.tsx.
- El análisis offline corre en `src/main/workers/analysis.worker.ts` (decodifica PNG con pngjs y llama `analyzeImage`).

## Carpeta del juego (2026-09-30)
Todo cuelga de la **carpeta del juego** = padre de `settings.screenshotsDir` (saves/, mods/, schematics/, `craftshot/app-index.json`).
No asumir `~/.minecraft`: en launchers de instancias (SKLauncher `~/.sklauncher/instances/<id>` con `instances.json`
{name, directory, minecraftVersion, gameType, lastPlayed}; Prism, MultiMC, Modrinth, CurseForge, ATLauncher, GDLauncher)
cada instancia es una carpeta de juego y `versions/`/`assets/` están más arriba.
- `src/main/minecraft/gameDirs.ts` (tests `tests/gameDirs.test.ts`): `detectInstalls(env)` → `MinecraftSource[]`
  (launcher, name, gameDir, version, loader, lastUsed, hasMod), más reciente primero; `launcherRootOf(gameDir)` (sube
  hasta 4 niveles buscando `versions/`, lo usa la fuente del OCR); `screenshotsDirFor(elegida)` (acepta carpeta de
  juego, de capturas o cualquiera). `MinecraftLocator` es una fachada sobre esto (`gameDirOf`, `launcherRootOf`).
- Onboarding: paso obligatorio "Tu Minecraft" (`components/GameFolderPicker.tsx`, también en Ajustes).
  `settings.gameDirConfirmed`: a los usuarios anteriores se les pregunta una vez solo ese paso. Primera ejecución:
  `screenshotsDir` por defecto = la carpeta jugada más recientemente.
- "Guardar el mod" propone `mods/` de la instancia (no en el `.minecraft` oficial, compartido entre versiones).
- **Varias carpetas de juego a la vez**: `settings.screenshotsDirs` (lista; `screenshotsDir` = la primera, se
  sincroniza en `sanitize`; migración en `SettingsService`). `LibraryService(roots: {path, label}[])`: con una raíz
  los ids son relativos como siempre; con varias llevan delante el "mount" (etiqueta saneada, p. ej.
  `SKLauncher - Fabric 26.3/2026….png`), cada raíz es una carpeta de primer nivel del árbol y `entry.source` = mount.
  `resolveId`/`toId`/`rootOf(id)`; en el nivel superior no se puede crear/pegar/importar ni renombrar/borrar una raíz.
  `snapshot.roots` {path, label, mount, exists}. Por raíz: `app-index.json` (ids relativos a su `screenshots`),
  mundos y `schematics` (`rootOf(id)`; `companion.listSaves(id)`). Respaldo: `backupPath`/`idOfBackupPath` — la
  primera raíz conserva rutas sin prefijo para no volver a subir nada al añadir una segunda. `worldOf` salta el
  mount al deducir el mundo por carpeta. El selector (`GameFolderPicker`) es de casillas; siempre queda una marcada.
- En scripts de prueba poner `onboardingDone` **y** `gameDirConfirmed` en settings.json.

## Gotchas
- El usuario usa **i3** (tiling). Para capturar la ventana: `i3-msg '[title="^Craftshot$"] floating enable, resize set W H'`;
  captura de pantalla con `import -window root -crop …`; clics con `xdotool`. Probar con `--user-data-dir=<tmp>` para no tocar sus datos.
- Modo debug: `CRAFTSHOT_CAPTURE=out.png CRAFTSHOT_SIZE=1440x900 [CRAFTSHOT_SCRIPT=js] npx electron .`
- Minecraft del usuario: 26.3 vanilla (GUI scale 2; el F3 de 1.21.9+ oculta el bioma por defecto) y 1.20.1 Forge.
- Preferencia del usuario: **ahorrar tokens** — pocas capturas de pantalla (recortadas), salidas filtradas, lecturas parciales, mensajes breves.

---

## Tarea: mod Fabric "Craftshot Companion" (Minecraft 26.3)

**Objetivo:** al pulsar F2, el mod escribe junto a la captura `NOMBRE.craftshot.json` con datos exactos del juego.
La app lo lee como fuente **"Mod · Exacto"** (prioridad más alta junto a manual). Funciona sin F3 abierto.

### Estado
`companion-mod/` ya tiene: `gradlew` + wrapper (jar verificado con sha256 oficial, Gradle 9.7.1), `gradle.properties`,
`settings.gradle`, `build.gradle` (plugin `net.fabricmc.fabric-loom` 1.18-SNAPSHOT, Java release 25),
`src/main/resources/fabric.mod.json` (id `craftshot_companion`, environment client, entrypoint
`dev.mguevara.craftshot.companion.CraftshotCompanion`, mixins `craftshot_companion.mixins.json`), mixin config, icono, LICENSE.
**Mod terminado y probado en juego** (2026-09-29): `./gradlew build` → `build/libs/craftshot-companion-1.0.0+26.3.jar`.
Prueba: `./gradlew runClient --args="--quickPlaySingleplayer CraftshotTest"` (mundo en `run/saves/`, con allowCommands).
Verificado: coords/bioma/luz/target, mobs visibles (excluye los de detrás), estructuras (village_plains), Nether, ráfagas de F2
(cola FIFO de snapshots). JDK 26 y 21 instalados (compila con release 25).
xdotool: la ventana se busca con `xdotool search --class Minecraft` (por nombre falla); comprobar `getactivewindow` antes de teclear.
Versiones: minecraft 26.3, loader 0.19.5, fabric-api 0.161.0+26.3 (no es dependencia obligatoria en fabric.mod.json).

### 26.3 está sin ofuscar (nombres oficiales de Mojang, sin mappings). APIs verificadas con javap en `~/.minecraft/versions/26.3/26.3.jar`:
- `net.minecraft.client.Screenshot`: `grab(File gameDir, String name, RenderTarget, int downscale, Consumer<Component>)`
  (hilo cliente) → `takeScreenshot` → lambda: `dir=new File(gameDir,"screenshots")`, `file = name==null ? getFile(dir) : new File(dir,name)`,
  escritura en `Util.ioPool()`. `private static File getFile(File)` elige `YYYY-MM-DD_HH.MM.SS.png`. `SCREENSHOT_DIR` público.
- Plan de mixin: `@Inject HEAD` en ese `grab` → tomar snapshot (si `name != null`, el archivo ya se conoce);
  `@Inject RETURN` en `getFile` → emparejar con el snapshot pendiente y escribir el JSON en `Util.ioPool()` (tmp + move atómico).
- `Minecraft`: campos `player`, `level`, `hitResult`, `gameRenderer`, `options`, `gameMode`, `gameDirectory`;
  `getCurrentServer()` (ServerData: `name`, `ip`, `isRealm()`?), `hasSingleplayerServer()`, `getSingleplayerServer()`, `getWindow()`.
- `Camera` (`gameRenderer.mainCamera()`): `position()`, `forwardVector()` (Vector3fc), `xRot()`, `yRot()` (upVector: verificar).
- Identificadores: clase `net.minecraft.resources.Identifier` (no ResourceLocation). `EntityType.getKey(type)` → Identifier;
  `BuiltInRegistries.BLOCK/ENTITY_TYPE`; `ResourceKey.identifier()` (verificar nombre).
- `Level`: `dimension()`, `getOverworldClockTime()` (relojes de mundo de 26.x; no hay getDayTime), `isRaining()`, `isThundering()`,
  `getBiome(BlockPos)` → Holder (`unwrapKey()`), `getLightEngine()` (luz: `getLayerListener(LightLayer.X).getLightValue(pos)`, verificar).
- `ClientLevel.entitiesForRendering()`; `level.clip(new ClipContext(from,to,ClipContext.Block.VISUAL,ClipContext.Fluid.NONE,entity))`.
- Entity: `getBoundingBox()`, `getEyePosition()`, `blockPosition()`, `getYRot()`, `getXRot()`, `getDirection()`, `isInvisible()`, `distanceTo()`.
- Servidor integrado (solo un jugador): `server.getLevel(dimKey)`, `ServerLevel.getSeed()`, `ServerLevel.structureManager().getAllStructuresAt(BlockPos)`,
  `registryAccess().lookupOrThrow(Registries.STRUCTURE).getKey(structure)`, `server.getWorldData().getLevelName()`, `server.submit(...)`.
  Consultar estructuras **en el hilo del servidor** (submit) con timeout; en multijugador no hay estructuras ni semilla.
- `options.fov().get()`; `MultiPlayerGameMode.getPlayerMode()`.

### Contrato JSON (schema 1) — mantenerlo estable, es la API entre mod y app
```json
{ "format": "craftshot-companion", "schema": 1,
  "mod": { "name": "Craftshot Companion", "version": "1.0.0+26.3", "loader": "fabric", "minecraft": "26.3" },
  "capturedAt": "2026-09-29T15:32:10.123Z",
  "world": { "type": "singleplayer|multiplayer|realms", "name": "…", "seed": "123", "dimension": "minecraft:overworld",
             "day": 12, "timeOfDay": 6000, "weather": "clear|rain|thunder" },
  "player": { "position": {"x":0,"y":0,"z":0}, "block": {…}, "chunk": {…},
              "facing": {"direction":"north","yaw":-151.8,"pitch":6.4}, "gameMode": "survival" },
  "biome": "minecraft:plains", "light": {"sky":15,"block":0},
  "target": { "block": {"id":"minecraft:stone","pos":{…}}, "entity": {"id":"minecraft:zombie","distance":3.2} },
  "entities": [ {"id":"minecraft:cow","count":3,"nearest":12.5} ],
  "structures": { "inside": ["minecraft:village_plains"], "target": [] } }
```
`seed` solo en un jugador y **como string** (64 bits no caben en un number de JS); `block`/`chunk`/`target.block.pos` son enteros; `structures` ausente = desconocido (multijugador). `entities` = seres vivos visibles:
dentro del campo de visión de la cámara (FOV vertical de opciones + aspecto de ventana) y con línea de visión (clip a ojos o centro),
≤96 bloques, excluye jugador propio, ArmorStand e invisibles; agrupados por tipo.

### Integración en la app (hecha, 2026-09-29; probada en vivo juego+app)
- `src/core/companion/parseCompanion.ts`: parser zod (`parseCompanion`), `companionPathFor`, `catalogStructureId`
  (village_* → village…), `companionLocation` (chunk relativo, región, towards). Tests: `tests/companion.test.ts`
  (+ fixture real `tests/fixtures/companion/`).
- `ScreenshotAnalysis.mod` (fuente) y `location` (resuelto: mod > F3; la UI usa `location` para coordenadas,
  no `f3.block`). `InfoSource` incluye `'mod'`. Prioridad: manual > mod > f3 > vision > local > heuristic;
  con mod, los mobs son solo los del mod; estructuras del mod + las de la IA. `ANALYSIS_SCHEMA` = 6.
- Worker lee el sidecar; fingerprint incluye `companionMtimeMs` (`-m<mtime>`); LibraryService arrastra el sidecar
  al renombrar/mover/copiar/importar/eliminar. CaptureWatcher espera el sidecar (si ya vio el mod) y reintenta si llega tarde.
- UI: etiqueta "Mod", badge MOD en la galería, sección "Partida" (mundo, día/hora, clima, modo, semilla),
  tarjeta en Ajustes › Análisis con "Guardar el mod (.jar)" (IPC `companion.saveMod`, jar en `resources/`),
  entrada en el onboarding. Nunca se instala solo en `~/.minecraft/mods` (compartida entre perfiles).
- Tras cambiar el mod: `npm run build:mod` (compila y copia el jar a `resources/craftshot-companion.jar`).

---

## Hoja de ruta "Minecraft técnico" (acordada 2026-09-29, implementar en orden)
1. **Hecho** — Parser F3 técnico (26.3): `server` (MSPT/TPS, estado /tick, brand), `spawnCounts` (mob caps, orden de
   MobCategory: MO C AM AX UWC WC WA MI; en 1.20.1 letras ambiguas → por posición), `day`, `speed`, `heightmaps`
   (CH/SH), `targetedBlock.state`/`tags`. UI: sección "Técnico" (DetailsPanel) + `lib/technical.ts` (caps escalados
   por chunks/289, TPS, `/setblock`). Fixture real: `tests/fixtures/f3-26.3-technical-scale2.png`.
   Formatos sacados del bytecode (`DebugEntry*`). Perfil del F3 del cliente de prueba: `companion-mod/run/debug-profile.json`
   (`{"custom": {"minecraft:tps": "inOverlay", …}}`).
2. **Hecho** — Pestaña "Mapa" (`features/map/`: `view.ts` matemática pura, `drawMap.ts` canvas, `MapView.tsx`):
   por mundo y dimensión, capa Nether⇄Overworld (×8), cuadrícula de chunks/regiones, chunks slime, medir, encuadrar.
   Mundos (`src/shared/worlds.ts`): `meta.world` manual > nombre del mod > carpeta superior; asignable en detalles y en
   el menú contextual ("Asignar mundo…"). Semillas: `settings.worldSeeds` (manual) > semilla del mod.
   Chunks slime (`src/shared/slime.ts`, BigInt): validado bit a bit contra `WorldgenRandom.seedSlimeChunk` del jar
   (sal 987234911, en `Slime`). Detalles: fila "Chunk slime" (el más cercano).
   Waypoints: formato Xaero verificado en xaerominimap-fabric 26.5.3 (`WaypointIO`); `dim%0/-1/1/mw$default_1.txt`;
   JourneyMap 6.0.9 los importa ("Importar Puntos de Ruta Externos"). IPC `library.exportWaypoints` → .zip + LEEME.
3. **Hecho** — Mod ampliado (campos opcionales en schema 1; la app descarta solo la sección mal formada con `.catch`):
   `game` {difficulty, hardcore, renderDistance, simulationDistance, serverBrand, tick {rate, state, mspt}},
   `mods` (instalados, sin builtin ni anidados), `nearby` (entidades cargadas ≤128 bloques por tipo), y en un jugador
   (`ServerCollector`, hilo del servidor): `spawn` {chunks, counts por MobCategory}, `gamerules` {id: {value, default}},
   `target.block` {state, signal {received, comparatorOutput, containerSignal}, container {size, items[slot,id,count]}},
   `target.entity.villager` {profession, type, level, xp, home, jobSite, meetingPoint, golemDetectedRecently,
   trades[{buy[], sell, uses, maxUses}]}; los ítems llevan `enchantments` {id: nivel}. Nota: leer `getOffers()` genera los
   tratos de un aldeano que aún no los tenía (igual que abrir su menú). UI: `features/details/TechnicalPanels.tsx`
   (Técnico ampliado, Aldeano, reglas, mods), primitivas en `parts.tsx`, catálogo `shared/catalog/villagers.ts`.
   Búsqueda: profesión, encantamientos de los tratos y contenido de contenedores. Fixtures: `tests/fixtures/companion/`.
   Pendiente sugerido: nombres de ítems en español leyendo `es_es.json` de `~/.minecraft/assets` (índice de la versión).
4. **Hecho** — Planificadores en el Mapa (botones "AFK" y "Portales"): lógica pura en `src/shared/planner.ts`
   (tests `tests/planner.test.ts`), figuras en `features/map/planners.ts` (`Shape` genérico en `drawMap`), paneles en
   `PlannerPanels.tsx`. Mecánicas verificadas en el bytecode de 26.3: mobs aparecen a 24–128 bloques (esfera 3D,
   `NaturalSpawner` 576.0), un chunk genera mobs si su centro está a <128 bloques horizontales (`ChunkMap` 16384.0),
   entidades en el cuadrado de chunks ≤ simulación (Chebyshev) y bloques/redstone un chunk más; portales: cuadrado
   ±16 en el Nether / ±128 en el Overworld (`PortalForcer`, toda la altura), el más cercano en 3D y luego el más bajo.
   AFK: modo "Granjas de mobs" (centro de la esfera mínima, elevado si una granja queda a <24) o "Solo carga" (chunk
   central); simulación por defecto = la de la captura más reciente con mod, si no 12. Portales: A/B con comprobación
   de ida y vuelta; las capturas que apuntan a `minecraft:nether_portal` cuentan como portales existentes.
5. **Hecho** — Snapshot del build (solo un jugador): **agachado + F2** apuntando a un bloque, el mod guarda
   `NOMBRE.craftshot.nbt` (estructura vanilla: 2r+1 de ancho, desde el nivel del bloque apuntado hacia arriba (2r+1 de
   alto) y recortada a la caja de bloques no-aire; conserva el aire interior y las entidades) antes del JSON, y añade `build` {file, origin, size, blocks, entities}. Config
   `config/craftshot_companion.json`: `build` "sneak"|"always"|"never", `buildRadius` (16, máx. 48), `buildBase` "target" (por defecto, hacia arriba) | "center" — `CompanionConfig`.
   `StructureTemplate.fillFromWorld` en el hilo del servidor. En 26.x la paleta usa `id` (antes `Name`) y la carpeta de
   plantillas del mundo es `generated/<ns>/structure/` (singular); probado con `/place template` ("Loaded template").
   Litematica carga .nbt vanilla (no se genera .litematic). App: `src/core/nbt/readNbt.ts` (lector NBT),
   `src/core/companion/structure.ts` (`summarizeStructure`: materiales, entidades), `analysis.build` (ANALYSIS_SCHEMA 9),
   `buildPathFor`/`sidecarPathsFor` (el .nbt se busca por nombre y sigue a la imagen al mover/renombrar/borrar),
   IPC `companion.exportBuild` (diálogo en `.minecraft/schematics` si existe), `features/details/BuildSection.tsx`
   (área, materiales en stacks, copiar lista), búsqueda por bloques del build. Fixtures `tests/fixtures/companion/build-26.3.*`.
   **Esquina** (por defecto, `buildBase: "corner"`): el bloque apuntado es la esquina inferior más cercana al jugador,
   a su derecha; la caja (`buildSize` lado, 33 por defecto, 3–97; `buildRadius` antiguo = 2r+1) crece hacia donde
   mira (`player.getDirection()`) y a su izquierda (`getCounterClockWise`) **exactamente `buildSize` bloques** (sin
   recortar: así crece de forma uniforme de uno en uno; por defecto 16 y la sesión recuerda el último tamaño); solo
   la altura se ajusta al bloque más alto de dentro (hasta 97).
   `"center"` la centra. La vista previa apunta con un rayo propio de 96 bloques (`player.pick`), no con el alcance de la mano.
   **Vista previa** (`BuildPreview`, `BuildRegion`): Mayús+F2 no captura; muestra la caja con gizmos de 26.x
   (`Gizmos.cuboid` desde `Minecraft.tick()` TAIL, dentro de `collectPerTickGizmos`; aristas `setAlwaysOnTop`), sigue
   la mira y se recalcula al cambiar de bloque/tamaño o cada 10 ticks. Rueda agachado = lado ±1 (3–97, mixin
   `MouseHandler.onScroll`); F2 guarda esa caja exacta (la captura se retrasa 2 ticks para que no salga la caja y se
   vacía la barra de acción); **Enter fija/suelta** la caja (`locked`: conserva esquina y dirección, aristas azules,
   `KeyEvent.isConfirmation()`; si los chunks se descargan se mantiene la última región); Esc cancela sin abrir el menú de pausa (mixin `KeyboardHandler.keyPress` HEAD,
   `KeyEvent.isEscape()`, acción 1 = pulsación); abrir cualquier pantalla también cancela. Mixins: `Screenshot.grab(Minecraft,boolean)` HEAD
   cancelable (la tecla, solo en pulsación), `Minecraft.tick`, `MouseHandler.onScroll`. `build: "always"` guarda sin
   vista previa en cada F2 (caja calculada en el servidor). `Minecraft.screen` ahora es `mc.gui.screen()`.
   `pkill -f '[j]ava.*Knot'` en un comando aparte: si la línea contiene "java…Knot" se mata la propia shell.
   **Pegarlo donde estaba**: `src/shared/placement.ts` (`templateId` → `minecraft:craftshot/<imagen>`, `placeCommand`:
   `/place template <id> ~dx ~dy ~dz [rotación]` con dx = origen − bloque del jugador, girado por cuartos entre la
   dirección de la captura y la actual; clockwise_90 = (x,z)→(−z,x), probado en juego). `src/main/minecraft/worlds.ts`:
   `listSaves` (lee `Data.LevelName` de level.dat; saves = padre de screenshotsDir) e `installTemplate`
   (`saves/<mundo>/generated/minecraft/structure/craftshot/<img>.nbt`). IPC `companion.listSaves`/`installBuild`.
   UI: bloque "Pegarlo donde estaba" en `BuildSection` (mundo, "Añadir al mundo", dirección, comando).
   **Dos pasos** (`BuildPreview.step`): 1 = base (rueda agachado → `size`; la caja se dibuja de 1 bloque de alto), F2 → 2 = altura (fija la caja; rueda →
   `height`, parte de la altura automática; `BuildRegion.corner(..., height)` con 0 = automática), F2 → nombre.
   Esc en el paso 2 vuelve al 1 (altura automática y el fijado que tenía); "Volver" en el nombre regresa al paso 2.
   **Texto de la vista previa**: ya no usa la barra de acción (una sola línea, se cortaba); `BuildPreview.drawHud`
   desde el mixin `Hud.extractRenderState` TAIL dibuja estado + controles con `font.split` (ajuste al ancho) sobre un
   fondo oscuro. En 26.3 el HUD es `net.minecraft.client.gui.Hud` (no `Gui`) y `Options.hideGui` ya no existe.
   **Guardado en el mundo** (automático al guardar con la vista previa): `ServerCollector.build` usa
   `server.getStructureTemplateManager().getOrCreate(craftshot:build_N)` + `save(id)` (como el bloque de estructura:
   escribe `generated/craftshot/structure/build_N.nbt` y actualiza la caché, así `/place` lo encuentra sin reabrir el
   mundo). N = máximo existente + 1. JSON `build.template`; el chat muestra "Build guardado en el mundo como …" con
   "[Copiar comando]" (`ClickEvent.CopyToClipboard`). **Nombre**: F2 en la vista previa abre `BuildNameScreen`
   (EditBox; Enter = `KeyEvent.isConfirmation()`, no `key()`; Esc vuelve a la vista previa; sin desenfoque para que
   se vea la caja; `isPauseScreen` false). `slug()` → `[a-z0-9_.-]` sin acentos; vacío → build_N; si existe, _2, _3…
   La pantalla y `setScreen` están en `mc.gui` en 26.3. La app usa ese nombre; "Añadir a otro mundo" instala con el mismo id.
   Ojo: `run/saves/CraftshotTest` ya no carga (falta world_gen_settings) y el juego abre "New World (1)".
   No recompilar el mod (`build:mod`) con `runClient` abierto: el cliente se cerró al hacerlo.
6. **Hecho** (2026-09-30) — **Craftshot dentro del juego** (tecla `galleryKey`, F6 por defecto; nombre tras
   `key.keyboard.` en `config/craftshot_companion.json`; se detecta en el mixin de `KeyboardHandler`, sin KeyMapping).
   - `GalleryScreen`: cuadrícula de capturas (filtro "Solo este mundo"/"Todos los mundos") + panel con los datos.
     `CaptureIndex` recorre `screenshots/` (4 niveles) en `Util.ioPool()`; por captura usa la exportación de la app
     si existe y, si no, el sidecar del mod (nombres con `Language.getInstance()`: `biome.*`, `block.*`, `entity.*`).
     `Thumbnails`: `NativeImage.read` + `resizeSubRectTo` (480 px) fuera del hilo cliente, `DynamicTexture` +
     `TextureManager.register/release`, LRU de 96, se liberan en `Screen.removed()`. Dibujo:
     `g.blit(RenderPipelines.GUI_TEXTURED, id, x, y, 0, 0, w, h, w, h)`, `g.outline(x, y, w, h, color)`,
     `mouseClicked(MouseButtonEvent, boolean)`, `mouseScrolled(x, y, dx, dy)`.
   - **App → mod**: `src/shared/gameIndex.ts` (`buildGameIndex`, puro, test `tests/gameIndex.test.ts`) y
     `GameIndexExporter` (main) escriben `<carpeta del juego>/craftshot/app-index.json` (solo si el padre de la
     carpeta de capturas tiene `saves/` u `options.txt`), con retardo de 1,5 s tras `library changed`,
     `analysis updated` y `setMeta`. Formato: `shots[id] {world, dimension, block, favorite, note, tags,
     sections[{title, rows[[etiqueta, valor]]}]}`: las filas van ya redactadas en español; el mod solo las pinta.
   - `Guide`: flecha en el HUD (`g.pose()` Matrix3x2fStack: translate + rotate; giro = yaw al destino − yaw del
     jugador), distancia y "sube/baja N", todo a escala 0,7. En el mundo solo un punto (`Gizmos.point`, a 48 bloques
     como mucho en esa dirección, porque los gizmos lejanos no se dibujan); a ≤24 bloques, además el bloque y una
     línea desde los pies del jugador. La tecla `guideKey` (H) oculta/muestra flecha y punto sin quitar la guía.
     Se borra al llegar (≤3 bloques en horizontal y ≤12 de altura) o al salir del mundo. Entre Overworld y Nether
     apunta a las coordenadas equivalentes (×8 / ÷8). La galería tiene "Copiar coordenadas"
     (`mc.keyboardHandler.setClipboard`).
   - `BuildPlacer` (solo un jugador): lee el `.craftshot.nbt` (`StructureTemplate.load(BuiltInRegistries.BLOCK, tag)`),
     caja naranja con el bloque apuntado en la esquina cercana derecha (igual que al guardar), girada por cuartos
     según hacia dónde mira el jugador ahora frente a la captura. Enter coloca en el hilo del servidor con
     `placeInWorld` (no usa `/place`, funciona sin trucos); rueda agachado sube/baja; Esc cancela. Ancla por
     rotación: 90° → min+(sz−1,0,0); 180° → min+(sx−1,0,sz−1); 270° → min+(0,0,sx−1) (probado en juego S/E/O).
     Antes guarda la zona con `fillFromWorld` para "Deshacer la última colocación" (botón de la galería; las
     entidades colocadas no se quitan).
   - Pruebas con xdotool: mover el ratón para pulsar botones gira la cámara al cerrar la pantalla; un Esc sin
     pantalla abierta abre el menú de pausa. En `New World` no hay trucos; `New World (1)` sí.
Ideas extra: aldeanos (profesión, trades, POI), cajas de estructuras, cubiomes-WASM (confirmar soporte 26.x).
