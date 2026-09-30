package dev.mguevara.craftshot.companion;

import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import net.fabricmc.loader.api.FabricLoader;

/**
 * "config/craftshot_companion.json": when to save the build around the targeted block
 * ("sneak": Shift+F2 opens a preview, "always": every F2, "never"), the side of the box in
 * blocks, and where the targeted block sits in it: "corner" (bottom corner nearest to the
 * player, on their right; the box grows away, to the left and up) or "center".
 * Read once at startup; a missing or broken file falls back to the defaults.
 */
public record CompanionConfig(String build, int buildSize, String buildBase) {
	public static final CompanionConfig DEFAULTS = new CompanionConfig("sneak", 33, "corner");
	public static final int MIN_SIZE = 3;
	/** 97 blocks per side at most: bigger areas would stall the server on F2. */
	public static final int MAX_SIZE = 97;

	private static CompanionConfig current = DEFAULTS;

	public static CompanionConfig get() {
		return current;
	}

	public static void load() {
		Path file = FabricLoader.getInstance().getConfigDir().resolve(CraftshotCompanion.MOD_ID + ".json");
		try {
			if (Files.exists(file)) {
				JsonObject o = JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8)).getAsJsonObject();
				String build = o.has("build") ? o.get("build").getAsString() : DEFAULTS.build();
				if (!build.equals("sneak") && !build.equals("always") && !build.equals("never")) build = DEFAULTS.build();
				// "buildRadius" (r) came before "buildSize" (2r+1).
				int size = o.has("buildSize") ? o.get("buildSize").getAsInt()
					: o.has("buildRadius") ? 2 * o.get("buildRadius").getAsInt() + 1 : DEFAULTS.buildSize();
				String base = o.has("buildBase") ? o.get("buildBase").getAsString() : DEFAULTS.buildBase();
				if (!base.equals("center")) base = DEFAULTS.buildBase();
				current = new CompanionConfig(build, Math.max(MIN_SIZE, Math.min(MAX_SIZE, size)), base);
			} else {
				JsonObject o = new JsonObject();
				o.addProperty("build", DEFAULTS.build());
				o.addProperty("buildSize", DEFAULTS.buildSize());
				o.addProperty("buildBase", DEFAULTS.buildBase());
				Files.createDirectories(file.getParent());
				Files.writeString(file, new GsonBuilder().setPrettyPrinting().create().toJson(o), StandardCharsets.UTF_8);
			}
		} catch (IOException | RuntimeException e) {
			CraftshotCompanion.LOG.warn("Could not read {}, using defaults", file, e);
			current = DEFAULTS;
		}
	}


	/** The box for a target, as configured. */
	public BuildRegion region(net.minecraft.world.level.Level level, net.minecraft.core.BlockPos target, int size,
			net.minecraft.core.Direction facing) {
		return buildBase.equals("center") ? BuildRegion.centred(level, target, size) : BuildRegion.corner(level, target, size, facing);
	}
}
