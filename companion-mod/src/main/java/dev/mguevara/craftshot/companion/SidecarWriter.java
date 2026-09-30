package dev.mguevara.craftshot.companion;

import com.google.gson.GsonBuilder;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.Queue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.TimeUnit;
import net.minecraft.client.Minecraft;
import net.minecraft.client.server.IntegratedServer;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.NbtIo;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Util;
import net.minecraft.world.level.Level;

/**
 * Pairs the snapshot taken on F2 with the file name Minecraft picks for the image a few
 * frames later, and writes "name.craftshot.json" next to it (off the render thread).
 */
public final class SidecarWriter {
	public static final String SUFFIX = ".craftshot.json";
	public static final String BUILD_SUFFIX = ".craftshot.nbt";

	/** Snapshots waiting for Screenshot.getFile() to choose the file name (readbacks finish in order). */
	private static final Queue<Pending> PENDING = new ConcurrentLinkedQueue<>();

	/** A readback takes a few frames; older entries belong to a screenshot that failed. */
	private static final long MAX_PENDING_NANOS = TimeUnit.SECONDS.toNanos(5);

	private record Pending(CaptureSnapshot snapshot, CompletableFuture<ServerCollector.Result> server, long createdAt) {}

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
		Pending p = new Pending(snapshot, serverAsync(mc, snapshot), System.nanoTime());
		if (targetOrNull != null) write(targetOrNull, p);
		else PENDING.add(p);
	}

	/** Called with the file Minecraft chose for the image. */
	public static void fileChosen(File image) {
		Pending p;
		do p = PENDING.poll();
		while (p != null && System.nanoTime() - p.createdAt() > MAX_PENDING_NANOS);
		if (p != null) write(image, p);
	}

	private static void write(File image, Pending p) {
		String name = image.getName();
		int dot = name.lastIndexOf('.');
		String base = dot > 0 ? name.substring(0, dot) : name;
		File sidecar = new File(image.getParentFile(), base + SUFFIX);
		File buildFile = new File(image.getParentFile(), base + BUILD_SUFFIX);
		Util.ioPool().execute(() -> {
			ServerCollector.Result server = null;
			try {
				server = p.server().get(2, TimeUnit.SECONDS);
			} catch (Exception e) {
				// The server was busy (or failed): leave the server-only data as "unknown".
				CraftshotCompanion.LOG.debug("Server data unavailable for the screenshot", e);
			}
			// The structure goes first: when the app sees the JSON, the .nbt is already there.
			String buildName = null;
			if (server != null && server.build() != null) {
				try {
					File tmp = new File(buildFile.getParentFile(), buildFile.getName() + ".tmp");
					NbtIo.writeCompressed(server.build().nbt(), tmp.toPath());
					Files.move(tmp.toPath(), buildFile.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
					buildName = buildFile.getName();
				} catch (IOException e) {
					CraftshotCompanion.LOG.warn("Could not write {}", buildFile, e);
				}
			}
			String json = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create()
				.toJson(p.snapshot().toJson(server, buildName));
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
	 * Structures, mob caps, game rules, container contents and villager trades only exist
	 * on the server. In singleplayer we ask the integrated server, on its own thread.
	 */
	private static CompletableFuture<ServerCollector.Result> serverAsync(Minecraft mc, CaptureSnapshot s) {
		IntegratedServer server = mc.getSingleplayerServer();
		if (server == null || mc.level == null || mc.player == null) return CompletableFuture.completedFuture(null);
		ResourceKey<Level> dim = mc.level.dimension();
		BlockPos at = mc.player.blockPosition();
		BlockPos target = s.targetBlock() != null
			? new BlockPos(s.targetBlock().pos().x(), s.targetBlock().pos().y(), s.targetBlock().pos().z())
			: null;
		Integer entityId = s.targetEntity() != null ? s.targetEntity().networkId() : null;
		int buildRadius = CompanionConfig.get().wantsBuild(mc.player.isShiftKeyDown()) ? CompanionConfig.get().buildRadius() : 0;
		boolean fromTarget = CompanionConfig.get().buildBase().equals("target");
		String author = mc.player.getGameProfile().name();
		return server.submit(() -> {
			ServerLevel level = server.getLevel(dim);
			return level == null ? null : ServerCollector.collect(server, level, at, target, entityId, buildRadius, fromTarget, author);
		});
	}
}
