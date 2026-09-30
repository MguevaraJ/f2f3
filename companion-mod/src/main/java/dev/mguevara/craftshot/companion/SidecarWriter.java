package dev.mguevara.craftshot.companion;

import com.google.gson.GsonBuilder;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import net.minecraft.client.Minecraft;
import net.minecraft.client.server.IntegratedServer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Util;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.levelgen.structure.Structure;

/**
 * Pairs the snapshot taken on F2 with the file name Minecraft picks for the image a few
 * frames later, and writes "name.craftshot.json" next to it (off the render thread).
 */
public final class SidecarWriter {
	public static final String SUFFIX = ".craftshot.json";

	/** Snapshot waiting for Screenshot.getFile() to choose the file name. */
	private static volatile Pending pending;

	private record Pending(CaptureSnapshot snapshot, CompletableFuture<CaptureSnapshot.Structures> structures) {}

	private SidecarWriter() {}

	/** Called when a screenshot starts (client thread). */
	public static void begin(File targetOrNull) {
		Minecraft mc = Minecraft.getInstance();
		CaptureSnapshot snapshot;
		try {
			snapshot = SnapshotCollector.collect(mc);
		} catch (RuntimeException e) {
			CraftshotCompanion.LOG.warn("Could not read game state for the screenshot", e);
			return;
		}
		if (snapshot == null) return;
		Pending p = new Pending(snapshot, structuresAsync(mc, snapshot));
		if (targetOrNull != null) write(targetOrNull, p);
		else pending = p;
	}

	/** Called with the file Minecraft chose for the image. */
	public static void fileChosen(File image) {
		Pending p = pending;
		pending = null;
		if (p != null) write(image, p);
	}

	private static void write(File image, Pending p) {
		String name = image.getName();
		int dot = name.lastIndexOf('.');
		File sidecar = new File(image.getParentFile(), (dot > 0 ? name.substring(0, dot) : name) + SUFFIX);
		Util.ioPool().execute(() -> {
			CaptureSnapshot.Structures structures = null;
			try {
				structures = p.structures().get(2, TimeUnit.SECONDS);
			} catch (Exception ignored) {
				// Multiplayer, or the server was busy: leave structures as "unknown".
			}
			String json = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create()
				.toJson(p.snapshot().toJson(structures));
			try {
				File tmp = new File(sidecar.getParentFile(), sidecar.getName() + ".tmp");
				Files.writeString(tmp.toPath(), json, StandardCharsets.UTF_8);
				Files.move(tmp.toPath(), sidecar.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
			} catch (IOException e) {
				CraftshotCompanion.LOG.warn("Could not write {}", sidecar, e);
			}
		});
	}

	/**
	 * Structures only exist on the server. In singleplayer we ask the integrated server
	 * (on its own thread) which structures contain the player and the targeted block.
	 */
	private static CompletableFuture<CaptureSnapshot.Structures> structuresAsync(Minecraft mc, CaptureSnapshot s) {
		IntegratedServer server = mc.getSingleplayerServer();
		if (server == null || mc.level == null || mc.player == null) return CompletableFuture.completedFuture(null);
		ResourceKey<Level> dim = mc.level.dimension();
		BlockPos at = mc.player.blockPosition();
		BlockPos target = s.targetBlock() != null
			? BlockPos.containing(s.targetBlock().pos().x(), s.targetBlock().pos().y(), s.targetBlock().pos().z())
			: null;
		return server.submit(() -> {
			ServerLevel level = server.getLevel(dim);
			if (level == null) return null;
			return new CaptureSnapshot.Structures(structuresAt(level, at), target != null ? structuresAt(level, target) : List.of());
		});
	}

	private static List<String> structuresAt(ServerLevel level, BlockPos pos) {
		var registry = level.registryAccess().lookupOrThrow(Registries.STRUCTURE);
		return level.structureManager().getAllStructuresAt(pos).keySet().stream()
			.filter(st -> level.structureManager().getStructureAt(pos, st).isValid())
			.map((Structure st) -> String.valueOf(registry.getKey(st)))
			.sorted()
			.toList();
	}
}
