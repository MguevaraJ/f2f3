package dev.mguevara.craftshot.companion;

import com.mojang.blaze3d.platform.NativeImage;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.Util;

/**
 * Textures for the gallery, made on demand: the image is read and shrunk off the client
 * thread and uploaded on it. Only the most recently used are kept. Client thread only.
 */
public final class Thumbnails {
	public record Thumb(ResourceLocation id, int width, int height) {}

	private static final int WIDTH = 480;
	private static final int MAX_KEPT = 96;
	private static final int MAX_LOADING = 3;

	private static final Map<Path, Thumb> ready = new LinkedHashMap<>(64, 0.75f, true);
	private static final Set<Path> loading = new HashSet<>();
	private static final Set<Path> failed = new HashSet<>();
	private static int generation;
	private static int serial;

	private Thumbnails() {}

	/** The texture for an image, or null while it loads (ask again next frame). */
	public static Thumb get(Path image) {
		Thumb thumb = ready.get(image);
		if (thumb != null || failed.contains(image) || loading.contains(image) || loading.size() >= MAX_LOADING) return thumb;
		loading.add(image);
		int started = generation;
		Util.ioPool().execute(() -> {
			NativeImage small = null;
			try (InputStream in = Files.newInputStream(image); NativeImage full = NativeImage.read(in)) {
				int w = Math.min(WIDTH, full.getWidth());
				int h = Math.max(1, full.getHeight() * w / full.getWidth());
				small = new NativeImage(w, h, false);
				full.resizeSubRectTo(0, 0, full.getWidth(), full.getHeight(), small);
			} catch (Exception e) {
				CraftshotCompanion.LOG.debug("No thumbnail for {}", image, e);
			}
			NativeImage pixels = small;
			Minecraft.getInstance().execute(() -> finish(image, pixels, started));
		});
		return null;
	}

	private static void finish(Path image, NativeImage pixels, int started) {
		if (started != generation) {
			if (pixels != null) pixels.close();
			return;
		}
		loading.remove(image);
		if (pixels == null) {
			failed.add(image);
			return;
		}
		ResourceLocation id = new ResourceLocation(CraftshotCompanion.MOD_ID, "thumb/" + serial++);
		Minecraft.getInstance().getTextureManager().register(id, new DynamicTexture(pixels));
		ready.put(image, new Thumb(id, pixels.getWidth(), pixels.getHeight()));
		Iterator<Thumb> oldest = ready.values().iterator();
		while (ready.size() > MAX_KEPT && oldest.hasNext()) {
			Minecraft.getInstance().getTextureManager().release(oldest.next().id());
			oldest.remove();
		}
	}

	/** Frees every texture (the gallery closed). */
	public static void clear() {
		generation++;
		for (Thumb thumb : ready.values()) Minecraft.getInstance().getTextureManager().release(thumb.id());
		ready.clear();
		loading.clear();
		failed.clear();
	}
}
