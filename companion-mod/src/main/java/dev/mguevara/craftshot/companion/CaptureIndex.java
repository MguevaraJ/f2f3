package dev.mguevara.craftshot.companion;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Stream;
import net.minecraft.core.BlockPos;
import net.minecraft.locale.Language;
import net.minecraft.util.Util;

/**
 * The screenshots the in-game gallery shows: every image of the screenshots folder with
 * what is known about it. The F2+F3 app's export ("craftshot/app-index.json": notes,
 * tags, and its analysis already worded) wins; without it the mod's own sidecar is used.
 */
public final class CaptureIndex {
	public record Section(String title, List<String[]> rows) {}

	/** A saved structure next to the image; `facing` is where the player looked when saving it. */
	public record Build(Path file, String size, int blocks) {}

	public record Capture(Path image, String name, long time, String world, String dimension, BlockPos pos,
			String facing, boolean favorite, String note, List<String> tags, List<Section> sections, Build build) {}

	private static final int MAX_DEPTH = 4;

	private CaptureIndex() {}

	/** Scans off the client thread, newest first. */
	public static CompletableFuture<List<Capture>> load(Path gameDir) {
		return CompletableFuture.supplyAsync(() -> scan(gameDir), Util.ioPool());
	}

	private static List<Capture> scan(Path gameDir) {
		Path dir = gameDir.resolve("screenshots");
		JsonObject shots = obj(read(gameDir.resolve("craftshot").resolve("app-index.json")), "shots");
		List<Capture> out = new ArrayList<>();
		if (!Files.isDirectory(dir)) return out;
		try (Stream<Path> files = Files.walk(dir, MAX_DEPTH)) {
			files.filter(p -> p.getFileName().toString().toLowerCase().endsWith(".png")).forEach(image -> {
				try {
					String id = dir.relativize(image).toString().replace('\\', '/');
					out.add(capture(image, obj(shots, id)));
				} catch (RuntimeException | IOException e) {
					CraftshotCompanion.LOG.debug("Skipping {}", image, e);
				}
			});
		} catch (IOException e) {
			CraftshotCompanion.LOG.warn("Could not list {}", dir, e);
		}
		out.sort(Comparator.comparingLong(Capture::time).reversed());
		return out;
	}

	private static Capture capture(Path image, JsonObject app) throws IOException {
		String file = image.getFileName().toString();
		String base = file.substring(0, file.length() - 4);
		JsonObject side = read(image.resolveSibling(base + ".craftshot.json"));
		JsonObject world = obj(side, "world");
		JsonObject player = obj(side, "player");

		String worldName = str(app, "world", str(world, "name", ""));
		String dimension = str(app, "dimension", str(world, "dimension", null));
		BlockPos pos = pos(app != null && app.has("block") ? obj(app, "block") : obj(player, "block"));
		String facing = str(obj(player, "facing"), "direction", null);

		Build build = null;
		JsonObject b = obj(side, "build");
		Path nbt = image.resolveSibling(base + ".craftshot.nbt");
		if (b != null && Files.isRegularFile(nbt)) {
			JsonObject s = obj(b, "size");
			build = new Build(nbt, num(s, "x") + "×" + num(s, "y") + "×" + num(s, "z"), num(b, "blocks"));
		}

		List<String> tags = new ArrayList<>();
		if (app != null && app.has("tags") && app.get("tags").isJsonArray()) {
			for (JsonElement t : app.getAsJsonArray("tags")) tags.add(t.getAsString());
		}
		List<Section> sections = app != null && app.has("sections") ? appSections(app) : ownSections(side, build);
		return new Capture(image, base, Files.getLastModifiedTime(image).toMillis(), worldName, dimension, pos, facing,
			app != null && app.has("favorite") && app.get("favorite").getAsBoolean(), str(app, "note", ""), tags, sections, build);
	}

	private static List<Section> appSections(JsonObject app) {
		List<Section> out = new ArrayList<>();
		for (JsonElement e : app.getAsJsonArray("sections")) {
			JsonObject s = e.getAsJsonObject();
			List<String[]> rows = new ArrayList<>();
			for (JsonElement r : s.getAsJsonArray("rows")) {
				rows.add(new String[] { r.getAsJsonArray().get(0).getAsString(), r.getAsJsonArray().get(1).getAsString() });
			}
			out.add(new Section(s.get("title").getAsString(), rows));
		}
		return out;
	}

	/** Without the app: the sidecar's main data, named in the game's language. */
	private static List<Section> ownSections(JsonObject side, Build build) {
		List<Section> out = new ArrayList<>();
		if (side == null) return out;
		JsonObject world = obj(side, "world");
		JsonObject player = obj(side, "player");
		JsonObject block = obj(player, "block");
		JsonObject light = obj(side, "light");

		List<String[]> where = new ArrayList<>();
		row(where, "Mundo", str(world, "name", null));
		row(where, "Dimensión", dimensionName(str(world, "dimension", null)));
		if (block != null) row(where, "Coordenadas", num(block, "x") + " " + num(block, "y") + " " + num(block, "z"));
		row(where, "Mirando al", facingName(str(obj(player, "facing"), "direction", null)));
		row(where, "Bioma", translated("biome", str(side, "biome", null)));
		if (light != null) row(where, "Luz", "cielo " + num(light, "sky") + " · bloque " + num(light, "block"));
		if (!where.isEmpty()) out.add(new Section("Ubicación", where));

		List<String[]> game = new ArrayList<>();
		if (world != null && world.has("day")) row(game, "Día", (num(world, "day") + 1) + " · " + clock(num(world, "timeOfDay")));
		row(game, "Clima", switch (str(world, "weather", "")) {
			case "clear" -> "Despejado";
			case "rain" -> "Lluvia";
			case "thunder" -> "Tormenta";
			default -> null;
		});
		row(game, "Modo", translatedKey("gameMode." + str(player, "gameMode", ""), str(player, "gameMode", null)));
		row(game, "Semilla", str(world, "seed", null));
		if (!game.isEmpty()) out.add(new Section("Partida", game));

		JsonObject target = obj(obj(side, "target"), "block");
		if (target != null) {
			List<String[]> aim = new ArrayList<>();
			row(aim, "Bloque", translated("block", str(target, "id", null)));
			JsonObject p = obj(target, "pos");
			if (p != null) row(aim, "Posición", num(p, "x") + " " + num(p, "y") + " " + num(p, "z"));
			out.add(new Section("Apuntando a", aim));
		}

		if (side.has("entities") && side.get("entities").isJsonArray() && !side.getAsJsonArray("entities").isEmpty()) {
			List<String[]> mobs = new ArrayList<>();
			for (JsonElement e : side.getAsJsonArray("entities")) {
				JsonObject m = e.getAsJsonObject();
				row(mobs, translated("entity", str(m, "id", "?")), "×" + num(m, "count"));
			}
			out.add(new Section("Mobs", mobs));
		}

		JsonObject structures = obj(side, "structures");
		if (structures != null && structures.has("inside") && !structures.getAsJsonArray("inside").isEmpty()) {
			List<String[]> rows = new ArrayList<>();
			for (JsonElement e : structures.getAsJsonArray("inside")) row(rows, pretty(e.getAsString()), "Mod");
			out.add(new Section("Estructuras", rows));
		}

		if (build != null) {
			List<String[]> rows = new ArrayList<>();
			row(rows, "Tamaño", build.size());
			row(rows, "Bloques", String.valueOf(build.blocks()));
			out.add(new Section("Build", rows));
		}
		return out;
	}

	private static void row(List<String[]> rows, String label, String value) {
		if (value != null && !value.isEmpty()) rows.add(new String[] { label, value });
	}

	public static String dimensionName(String id) {
		if (id == null) return null;
		return switch (id) {
			case "minecraft:overworld" -> "Overworld";
			case "minecraft:the_nether" -> "Nether";
			case "minecraft:the_end" -> "The End";
			default -> pretty(id);
		};
	}

	public static String facingName(String facing) {
		if (facing == null) return null;
		return switch (facing) {
			case "north" -> "Norte";
			case "south" -> "Sur";
			case "east" -> "Este";
			case "west" -> "Oeste";
			default -> facing;
		};
	}

	/** "minecraft:dark_forest" → the game's name for it ("biome.minecraft.dark_forest"), or "Dark Forest". */
	private static String translated(String kind, String id) {
		if (id == null) return null;
		String[] parts = id.contains(":") ? id.split(":", 2) : new String[] { "minecraft", id };
		return translatedKey(kind + "." + parts[0] + "." + parts[1].replace('/', '.'), pretty(id));
	}

	private static String translatedKey(String key, String fallback) {
		Language language = Language.getInstance();
		return language.has(key) ? language.getOrDefault(key) : fallback;
	}

	private static String pretty(String id) {
		String path = id.substring(id.indexOf(':') + 1);
		StringBuilder sb = new StringBuilder();
		for (String word : path.split("[_/]")) {
			if (word.isEmpty()) continue;
			if (sb.length() > 0) sb.append(' ');
			sb.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
		}
		return sb.toString();
	}

	/** Ticks of the day → "14:30" (0 ticks = 06:00). */
	private static String clock(int ticks) {
		int minutes = ((ticks + 6000) % 24000) * 60 / 1000;
		return String.format("%02d:%02d", minutes / 60, minutes % 60);
	}

	private static JsonObject read(Path file) {
		try {
			if (!Files.isRegularFile(file)) return null;
			return JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8)).getAsJsonObject();
		} catch (IOException | RuntimeException e) {
			return null;
		}
	}

	private static JsonObject obj(JsonObject o, String key) {
		return o != null && o.has(key) && o.get(key).isJsonObject() ? o.getAsJsonObject(key) : null;
	}

	private static String str(JsonObject o, String key, String fallback) {
		return o != null && o.has(key) && o.get(key).isJsonPrimitive() ? o.get(key).getAsString() : fallback;
	}

	private static int num(JsonObject o, String key) {
		return o != null && o.has(key) && o.get(key).isJsonPrimitive() ? (int) Math.floor(o.get(key).getAsDouble()) : 0;
	}

	private static BlockPos pos(JsonObject o) {
		return o == null ? null : new BlockPos(num(o, "x"), num(o, "y"), num(o, "z"));
	}
}
