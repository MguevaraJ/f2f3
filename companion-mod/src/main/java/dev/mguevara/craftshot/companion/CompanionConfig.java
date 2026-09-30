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
 * ("sneak": only when sneaking while pressing F2, "always", "never"), how far, and whether
 * the box starts at the targeted block's level ("target") or is centred on it ("center").
 * Read once at startup; a missing or broken file falls back to the defaults.
 */
public record CompanionConfig(String build, int buildRadius, String buildBase) {
	public static final CompanionConfig DEFAULTS = new CompanionConfig("sneak", 16, "target");
	/** 97 blocks per side at most: bigger areas would stall the server on F2. */
	private static final int MAX_RADIUS = 48;

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
				int radius = o.has("buildRadius") ? o.get("buildRadius").getAsInt() : DEFAULTS.buildRadius();
				String base = o.has("buildBase") ? o.get("buildBase").getAsString() : DEFAULTS.buildBase();
				if (!base.equals("target") && !base.equals("center")) base = DEFAULTS.buildBase();
				current = new CompanionConfig(build, Math.max(1, Math.min(MAX_RADIUS, radius)), base);
			} else {
				JsonObject o = new JsonObject();
				o.addProperty("build", DEFAULTS.build());
				o.addProperty("buildRadius", DEFAULTS.buildRadius());
				o.addProperty("buildBase", DEFAULTS.buildBase());
				Files.createDirectories(file.getParent());
				Files.writeString(file, new GsonBuilder().setPrettyPrinting().create().toJson(o), StandardCharsets.UTF_8);
			}
		} catch (IOException | RuntimeException e) {
			CraftshotCompanion.LOG.warn("Could not read {}, using defaults", file, e);
			current = DEFAULTS;
		}
	}

	public boolean wantsBuild(boolean sneaking) {
		return build.equals("always") || (build.equals("sneak") && sneaking);
	}
}
