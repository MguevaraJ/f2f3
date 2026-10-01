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
 * player, on their right; the box is that many blocks away and to the left, as tall as
 * what is inside) or "center" (a cube trimmed to its blocks). "galleryKey" opens the
 * in-game gallery, "guideKey" shows or hides the guide and "plansKey" the app's plans
 * (with Shift, the slime chunks) and "materialsKey" the pinned list of materials ("f6", "h", "j",
 * "m"…: the name after "key.keyboard.").
 * Read once at startup; a missing or broken file falls back to the defaults.
 */
public record CompanionConfig(String build, int buildSize, String buildBase, String galleryKey, String guideKey, String plansKey, String materialsKey) {
	public static final CompanionConfig DEFAULTS = new CompanionConfig("sneak", 16, "corner", "f6", "h", "j", "m");
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
				String key = o.has("galleryKey") ? o.get("galleryKey").getAsString() : DEFAULTS.galleryKey();
				String guide = o.has("guideKey") ? o.get("guideKey").getAsString() : DEFAULTS.guideKey();
				String plans = o.has("plansKey") ? o.get("plansKey").getAsString() : DEFAULTS.plansKey();
				current = new CompanionConfig(build, Math.max(MIN_SIZE, Math.min(MAX_SIZE, size)), base, key, guide, plans,
					o.has("materialsKey") ? o.get("materialsKey").getAsString() : DEFAULTS.materialsKey());
			} else {
				JsonObject o = new JsonObject();
				o.addProperty("build", DEFAULTS.build());
				o.addProperty("buildSize", DEFAULTS.buildSize());
				o.addProperty("buildBase", DEFAULTS.buildBase());
				o.addProperty("galleryKey", DEFAULTS.galleryKey());
				o.addProperty("guideKey", DEFAULTS.guideKey());
				o.addProperty("plansKey", DEFAULTS.plansKey());
				o.addProperty("materialsKey", DEFAULTS.materialsKey());
				Files.createDirectories(file.getParent());
				Files.writeString(file, new GsonBuilder().setPrettyPrinting().create().toJson(o), StandardCharsets.UTF_8);
			}
		} catch (IOException | RuntimeException e) {
			CraftshotCompanion.LOG.warn("Could not read {}, using defaults", file, e);
			current = DEFAULTS;
		}
	}
	/** GLFW code of the gallery key; F6 when the name is not a key. */
	public int galleryKeyCode() {
		return keyCode(galleryKey, DEFAULTS.galleryKey());
	}

	/** GLFW code of the key that shows or hides the guide; H when the name is not a key. */
	public int guideKeyCode() {
		return keyCode(guideKey, DEFAULTS.guideKey());
	}

	/** GLFW code of the key that shows or hides the plans; J when the name is not a key. */
	public int plansKeyCode() {
		return keyCode(plansKey, DEFAULTS.plansKey());
	}

	/** GLFW code of the key that shows or hides the materials list; M when the name is not a key. */
	public int materialsKeyCode() {
		return keyCode(materialsKey, DEFAULTS.materialsKey());
	}

	private static int keyCode(String name, String fallback) {
		try {
			return com.mojang.blaze3d.platform.InputConstants.getKey("key.keyboard." + name.toLowerCase()).getValue();
		} catch (RuntimeException e) {
			return com.mojang.blaze3d.platform.InputConstants.getKey("key.keyboard." + fallback).getValue();
		}
	}

	/** The box for a target, as configured. */
	public BuildRegion region(net.minecraft.world.level.Level level, net.minecraft.core.BlockPos target, int depth, int width,
			net.minecraft.core.Direction facing, int height) {
		return buildBase.equals("center") ? BuildRegion.centred(level, target, Math.max(depth, width))
			: BuildRegion.corner(level, target, depth, width, facing, height);
	}
}
