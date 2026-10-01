package dev.mguevara.craftshot.companion;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import dev.mguevara.craftshot.companion.compat.GuiGraphicsExtractor;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.core.BlockPos;
import dev.mguevara.craftshot.companion.compat.GizmoStyle;
import dev.mguevara.craftshot.companion.compat.Gizmos;
import dev.mguevara.craftshot.companion.compat.TextGizmo;
import net.minecraft.network.chat.Component;
import net.minecraft.Util;
import net.minecraft.world.level.levelgen.WorldgenRandom;
import net.minecraft.world.phys.Vec3;

/**
 * Draws in the world what the F2+F3 app's map planned ("craftshot/plans.json", one entry
 * per world): the AFK spot with its 24 and 128 block spheres, the simulation squares and
 * the farms, and the portal link with the squares the game searches. Also the slime chunks
 * around the player. The plans key shows or hides the plans; with Shift, the slime chunks.
 * Client thread only, except reading the file.
 */
public final class Plans {
	record Farm(int x, Integer y, int z, String label, String level) {}

	record Afk(String dimension, BlockPos spot, boolean mobs, int simulation, List<Farm> farms) {}

	record Portals(String aDim, BlockPos a, BlockPos b) {}

	record World(Long seed, Afk afk, Portals portals) {}

	private static final String OVERWORLD = "minecraft:overworld";
	private static final String NETHER = "minecraft:the_nether";
	private static final int NO_SPAWN_RADIUS = 24;
	private static final int DESPAWN_RADIUS = 128;
	private static final long SLIME_SALT = 987234911L;
	/** Chunks around the player checked for slimes. */
	private static final int SLIME_RANGE = 4;
	private static final int RELOAD_TICKS = 40;
	private static final float HUD_SCALE = 0.7f;

	private static final int WHITE = 0xFFFFFFFF;
	private static final int FAR = 0xFFFFB347;
	private static final int NEAR = 0xFFFF5C5C;
	private static final int SIMULATION = 0xE678AAFF;
	private static final int BLOCKS_ONLY = 0x8078AAFF;
	private static final int PORTAL_A = 0xFFC9A6FF;
	private static final int PORTAL_B = 0xFFFFB347;
	private static final int SLIME = 0xFF6EE08A;
	private static final GizmoStyle SLIME_FILL = GizmoStyle.fill(0x226EE08A);

	private static Map<String, World> worlds = Map.of();
	/** Last modified time of the file that was read; -1 when there was none. */
	private static long stamp = -2;
	private static boolean reading;
	private static int ticks;
	private static boolean showPlans = true;
	private static boolean showSlime;

	private static long slimeKey = Long.MIN_VALUE;
	private static Long slimeSeed;
	private static List<int[]> slimeChunks = List.of();

	private Plans() {}

	// ── file ──

	/** Reads the file again when it changed, off the client thread. */
	private static void refresh(Minecraft mc) {
		if (reading) return;
		reading = true;
		Path file = mc.gameDirectory.toPath().resolve("craftshot").resolve("plans.json");
		long known = stamp;
		Util.ioPool().execute(() -> {
			long now = -1;
			Map<String, World> read = null;
			try {
				if (Files.isRegularFile(file)) now = Files.getLastModifiedTime(file).toMillis();
				if (now != known) read = now < 0 ? Map.of() : parse(Files.readString(file, StandardCharsets.UTF_8));
			} catch (IOException | RuntimeException e) {
				CraftshotCompanion.LOG.warn("Could not read {}", file, e);
				read = Map.of();
			}
			long at = now;
			Map<String, World> next = read;
			mc.execute(() -> {
				if (next != null) {
					worlds = next;
					stamp = at;
				}
				reading = false;
			});
		});
	}

	private static Map<String, World> parse(String json) {
		Map<String, World> out = new HashMap<>();
		JsonObject all = obj(JsonParser.parseString(json).getAsJsonObject(), "worlds");
		if (all == null) return out;
		for (Map.Entry<String, JsonElement> e : all.entrySet()) {
			if (!e.getValue().isJsonObject()) continue;
			JsonObject w = e.getValue().getAsJsonObject();
			Long seed = null;
			try {
				if (w.has("seed")) seed = Long.parseLong(w.get("seed").getAsString().trim());
			} catch (RuntimeException ignored) {
				// No slime chunks from this entry.
			}
			out.put(e.getKey(), new World(seed, afk(obj(w, "afk")), portals(obj(w, "portals"))));
		}
		return out;
	}

	private static Afk afk(JsonObject o) {
		BlockPos spot = pos(obj(o, "spot"));
		if (spot == null) return null;
		List<Farm> farms = new ArrayList<>();
		if (o.has("farms") && o.get("farms").isJsonArray()) {
			for (JsonElement e : o.getAsJsonArray("farms")) {
				if (!e.isJsonObject()) continue;
				JsonObject f = e.getAsJsonObject();
				Integer y = f.has("y") && f.get("y").isJsonPrimitive() ? num(f, "y") : null;
				farms.add(new Farm(num(f, "x"), y, num(f, "z"), str(f, "label", ""), str(f, "level", "bad")));
			}
		}
		return new Afk(str(o, "dimension", OVERWORLD), spot, !str(o, "kind", "mobs").equals("load"),
			Math.max(2, Math.min(32, num(o, "simulation"))), farms);
	}

	private static Portals portals(JsonObject o) {
		BlockPos a = pos(obj(o, "a"));
		String aDim = str(o, "aDim", "");
		if (a == null || !(aDim.equals(OVERWORLD) || aDim.equals(NETHER))) return null;
		return new Portals(aDim, a, pos(obj(o, "b")));
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

	// ── state ──

	/** The name the app knows this world by: the save's name, or the server's in the list. */
	private static String worldName(Minecraft mc) {
		ServerData server = mc.getCurrentServer();
		return mc.getSingleplayerServer() != null ? mc.getSingleplayerServer().getWorldData().getLevelName()
			: server != null ? server.name : "";
	}

	private static World current(Minecraft mc) {
		return worlds.get(worldName(mc));
	}

	/** The world's seed: the game's own in singleplayer, else the one the app sent. */
	private static Long seed(Minecraft mc) {
		if (mc.getSingleplayerServer() != null) return mc.getSingleplayerServer().overworld().getSeed();
		World w = current(mc);
		return w == null ? null : w.seed();
	}

	private static String dimension(Minecraft mc) {
		return mc.level.dimension().location().toString();
	}

	/** The plans key: shows or hides the plans, or the slime chunks while sneaking. */
	public static boolean onKey(Minecraft mc) {
		if (mc.player == null || mc.level == null) return false;
		refresh(mc);
		String message;
		if (mc.player.isShiftKeyDown()) {
			if (seed(mc) == null) message = "Sin semilla: escríbela en el mapa de la app y envía un plan";
			else if (!dimension(mc).equals(OVERWORLD)) message = "Los chunks slime solo están en el Overworld";
			else message = (showSlime = !showSlime) ? "Chunks slime visibles" : "Chunks slime ocultos";
		} else {
			World w = current(mc);
			if (w == null || (w.afk() == null && w.portals() == null)) {
				message = "No hay planes de la app para «" + worldName(mc) + "»";
			} else message = (showPlans = !showPlans) ? "Planes visibles" : "Planes ocultos";
		}
		mc.player.displayClientMessage(Component.literal(message), true);
		return true;
	}

	// ── world ──

	/** End of each client tick: inside the per-tick gizmo collection. */
	public static void tick(Minecraft mc) {
		if (mc.player == null || mc.level == null) return;
		if (ticks++ % RELOAD_TICKS == 0) refresh(mc);
		String dim = dimension(mc);
		// Flat shapes sit at the player's feet, just over the floor.
		double y = mc.player.getY() + 0.05;
		World w = current(mc);
		if (showPlans && w != null) {
			if (w.afk() != null && w.afk().dimension().equals(dim)) drawAfk(mc, w.afk(), y);
			if (w.portals() != null) drawPortals(w.portals(), dim, y);
		}
		if (showSlime && dim.equals(OVERWORLD)) drawSlime(mc, y);
	}

	private static void drawAfk(Minecraft mc, Afk afk, double y) {
		BlockPos spot = afk.spot();
		Vec3 centre = new Vec3(spot.getX() + 0.5, spot.getY(), spot.getZ() + 0.5);
		Gizmos.cuboid(spot, GizmoStyle.stroke(WHITE, 2.5f)).setAlwaysOnTop();
		label("AFK", centre.add(0, 1.6, 0), WHITE);

		int cx = spot.getX() >> 4, cz = spot.getZ() >> 4;
		chunkSquare(cx, cz, afk.simulation(), y, SIMULATION, 2.5f);
		chunkSquare(cx, cz, afk.simulation() + 1, y, BLOCKS_ONLY, 1.5f);
		if (afk.mobs()) {
			sphere(centre, DESPAWN_RADIUS, y, FAR);
			sphere(centre, NO_SPAWN_RADIUS, y, NEAR);
		}
		for (int i = 0; i < afk.farms().size(); i++) {
			Farm f = afk.farms().get(i);
			int color = switch (f.level()) {
				case "ok" -> 0xFF6EE08A;
				case "warn" -> 0xFFFFD24A;
				default -> NEAR;
			};
			BlockPos at = new BlockPos(f.x(), f.y() != null ? f.y() : mc.player.getBlockY(), f.z());
			Gizmos.cuboid(at, GizmoStyle.stroke(color, 2.5f)).setAlwaysOnTop();
			label(i + 1 + (f.label().isEmpty() ? "" : " · " + shorten(f.label())), Vec3.atCenterOf(at).add(0, 1.1, 0), color);
		}
	}

	private static void drawPortals(Portals p, String dim, double y) {
		String bDim = other(p.aDim());
		BlockPos exit = exit(p.a(), p.aDim());
		if (dim.equals(p.aDim())) {
			portal(p.a(), "A", PORTAL_A);
			// Where coming back through B starts looking.
			if (p.b() != null) searchSquare(exit(p.b(), bDim), radius(dim), y, PORTAL_B);
		} else if (dim.equals(bDim)) {
			searchSquare(exit, radius(dim), y, PORTAL_A);
			if (p.b() != null) portal(p.b(), "B", PORTAL_B);
			else {
				Gizmos.point(Vec3.atCenterOf(exit), PORTAL_A, 9f).setAlwaysOnTop();
				label("Destino ideal de A", Vec3.atCenterOf(exit).add(0, 1.1, 0), PORTAL_A);
			}
		}
	}

	private static void drawSlime(Minecraft mc, double y) {
		Long seed = seed(mc);
		if (seed == null) return;
		int pcx = mc.player.getBlockX() >> 4, pcz = mc.player.getBlockZ() >> 4;
		long key = ((long) pcx << 32) ^ (pcz & 0xFFFFFFFFL);
		if (key != slimeKey || !seed.equals(slimeSeed)) {
			slimeKey = key;
			slimeSeed = seed;
			List<int[]> found = new ArrayList<>();
			for (int x = pcx - SLIME_RANGE; x <= pcx + SLIME_RANGE; x++) {
				for (int z = pcz - SLIME_RANGE; z <= pcz + SLIME_RANGE; z++) {
					if (isSlimeChunk(seed, x, z)) found.add(new int[] { x, z });
				}
			}
			slimeChunks = found;
		}
		GizmoStyle edges = GizmoStyle.stroke(SLIME, 2f);
		for (int[] c : slimeChunks) {
			double x0 = c[0] * 16, z0 = c[1] * 16, x1 = x0 + 16, z1 = z0 + 16;
			Vec3 a = new Vec3(x0, y, z0), b = new Vec3(x1, y, z0), d = new Vec3(x1, y, z1), e = new Vec3(x0, y, z1);
			Gizmos.rect(a, b, d, e, SLIME_FILL);
			Gizmos.rect(a, b, d, e, edges).setAlwaysOnTop();
		}
	}

	private static boolean isSlimeChunk(long seed, int x, int z) {
		return WorldgenRandom.seedSlimeChunk(x, z, seed, SLIME_SALT).nextInt(10) == 0;
	}

	private static String other(String dim) {
		return dim.equals(OVERWORLD) ? NETHER : OVERWORLD;
	}

	/** Where a trip through a portal in `from` starts looking: ÷8 into the Nether, ×8 out of it. */
	private static BlockPos exit(BlockPos p, String from) {
		return from.equals(OVERWORLD) ? new BlockPos(Math.floorDiv(p.getX(), 8), p.getY(), Math.floorDiv(p.getZ(), 8))
			: new BlockPos(p.getX() * 8, p.getY(), p.getZ() * 8);
	}

	/** Half side of the square searched for a portal in that dimension. */
	private static int radius(String dim) {
		return dim.equals(NETHER) ? 16 : 128;
	}

	private static void portal(BlockPos at, String name, int color) {
		Gizmos.cuboid(at, GizmoStyle.stroke(color, 2.5f)).setAlwaysOnTop();
		label("Portal " + name, Vec3.atCenterOf(at).add(0, 1.1, 0), color);
	}

	private static void searchSquare(BlockPos centre, int r, double y, int color) {
		square(centre.getX() - r, centre.getZ() - r, centre.getX() + r + 1, centre.getZ() + r + 1, y, color, 2.5f);
	}

	private static void chunkSquare(int cx, int cz, int r, double y, int color, float width) {
		square((cx - r) * 16, (cz - r) * 16, (cx + r + 1) * 16, (cz + r + 1) * 16, y, color, width);
	}

	private static void square(double x0, double z0, double x1, double z1, double y, int color, float width) {
		Vec3 a = new Vec3(x0, y, z0), b = new Vec3(x1, y, z0), c = new Vec3(x1, y, z1), d = new Vec3(x0, y, z1);
		Gizmos.line(a, b, color, width).setAlwaysOnTop();
		Gizmos.line(b, c, color, width).setAlwaysOnTop();
		Gizmos.line(c, d, color, width).setAlwaysOnTop();
		Gizmos.line(d, a, color, width).setAlwaysOnTop();
	}

	/** Three great circles, and the cut of the sphere at the player's feet (thicker). */
	private static void sphere(Vec3 c, double r, double y, int color) {
		for (int plane = 0; plane < 3; plane++) ring(c, r, plane, color, 1.5f);
		double dy = y - c.y;
		if (Math.abs(dy) < r) ring(new Vec3(c.x, y, c.z), Math.sqrt(r * r - dy * dy), 0, color, 3f);
	}

	/** A circle in the horizontal plane (0) or in one of the two vertical ones. */
	private static void ring(Vec3 c, double r, int plane, int color, float width) {
		int n = Math.max(24, Math.min(96, (int) (r * 0.75)));
		Vec3 prev = null;
		for (int i = 0; i <= n; i++) {
			double angle = 2 * Math.PI * i / n;
			double u = Math.cos(angle) * r, v = Math.sin(angle) * r;
			Vec3 p = plane == 0 ? c.add(u, 0, v) : plane == 1 ? c.add(u, v, 0) : c.add(0, v, u);
			if (prev != null) Gizmos.line(prev, p, color, width).setAlwaysOnTop();
			prev = p;
		}
	}

	private static void label(String text, Vec3 at, int color) {
		Gizmos.billboardText(text, at, TextGizmo.Style.forColorAndCentered(color)).setAlwaysOnTop();
	}

	private static String shorten(String s) {
		return s.length() > 24 ? s.substring(0, 23) + "…" : s;
	}

	// ── HUD ──

	/** Where the player stands against the plan, at the left edge of the HUD. */
	public static void drawHud(GuiGraphicsExtractor g) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null || mc.level == null || mc.screen != null) return;
		List<String> lines = new ArrayList<>();
		List<Integer> colors = new ArrayList<>();
		String dim = dimension(mc);
		World w = current(mc);
		if (showPlans && w != null && w.afk() != null && w.afk().dimension().equals(dim)) {
			BlockPos spot = w.afk().spot();
			double d = Math.sqrt(mc.player.distanceToSqr(spot.getX() + 0.5, spot.getY(), spot.getZ() + 0.5));
			lines.add(d < 1.5 ? "En el punto AFK" : "Punto AFK a " + Math.round(d) + " bloques");
			colors.add(d < 1.5 ? 0xFF6EE08A : WHITE);
		}
		Long seed = seed(mc);
		if (showSlime && seed != null && dim.equals(OVERWORLD)) {
			boolean here = isSlimeChunk(seed, mc.player.getBlockX() >> 4, mc.player.getBlockZ() >> 4);
			lines.add(here ? "Chunk slime" : "Sin slimes en este chunk");
			colors.add(here ? SLIME : 0xFFAAAAAA);
		}
		if (lines.isEmpty()) return;
		Font font = mc.font;
		g.pose().pushMatrix();
		g.pose().scale(HUD_SCALE, HUD_SCALE);
		int y = Math.round(g.guiHeight() / 2 / HUD_SCALE) - lines.size() * 6;
		for (int i = 0; i < lines.size(); i++) {
			int width = font.width(lines.get(i));
			g.fill(3, y - 2, 9 + width, y + font.lineHeight + 1, 0x90000000);
			g.text(font, lines.get(i), 6, y, colors.get(i));
			y += font.lineHeight + 3;
		}
		g.pose().popMatrix();
	}
}
