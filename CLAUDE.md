# Craftshot — contexto para agentes

App de escritorio (Electron + React + TypeScript) que gestiona las capturas de Minecraft (`~/.minecraft/screenshots`)
con estética del Minecraft Launcher. Lee el F3 de cada captura por OCR, muestra coordenadas/bioma/mobs/estructuras,
visor, carpetas, respaldo en Google Drive y avisos de capturas nuevas. **UI y textos en español.** Código y comentarios en inglés.

**Tarea en curso: el mod Fabric "Craftshot Companion" para Minecraft 26.3** (ver sección al final).

## Comandos
```bash
npm run dev            # desarrollo
npm run build          # typecheck + build + scripts/check-preload.mjs (falla si un preload usa chunks)
npm run typecheck && npx eslint . && npx vitest run    # verificación estándar (86 tests)
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

### Integración en la app (pendiente, después del mod)
1. `src/core/companion/parseCompanion.ts` (puro, validar con zod, tests) → fuente nueva `mod` en `ScreenshotAnalysis` e `InfoSource`.
2. Worker: leer `<base>.craftshot.json` junto al PNG y pasarlo a `analyzeImage`. Si no hay F3, sintetizar datos de posición
   (coordenadas, chunk, región, orientación, dimensión, bioma, target) para que la UI de coordenadas/tabla/popup funcione.
3. Fingerprint debe incluir el mtime del sidecar (el JSON puede escribirse después del PNG) → reanálisis automático.
4. `resolveAnalysis`: prioridad `manual > mod > f3 > vision > local > heuristic`; mobs del mod son exactos (con conteo);
   estructuras del mod: mapear variantes a ids del catálogo (village_* → village, ocean_ruin_* → ocean_ruin, ruined_portal_* → ruined_portal,
   shipwreck_beached → shipwreck, mineshaft_mesa → mineshaft, nether_fossil → fossil; añadir buried_treasure si hace falta).
5. LibraryService: renombrar/mover/copiar/eliminar debe llevar el sidecar junto con la imagen; la galería ignora los .json.
6. UI: `SOURCE_INFO.mod` (etiqueta "Mod", "Exacto"), tarjeta en Ajustes › Análisis y paso en el onboarding explicando el mod
   (opcional, solo Fabric 26.3). Ojo: `~/.minecraft/mods` es compartida entre perfiles del launcher; un jar que depende de
   `minecraft ~26.3` hace fallar perfiles Fabric de otras versiones → no instalar automáticamente ahí; dar instrucciones.
7. Probar de punta a punta: instalar Fabric loader 0.19.5 para 26.3 (perfil con carpeta de juego propia), jar en `mods/`, F2 en el juego,
   verificar el JSON y que la app muestre "Mod · Exacto".
