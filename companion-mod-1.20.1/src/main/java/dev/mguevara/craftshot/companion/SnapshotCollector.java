package dev.mguevara.craftshot.companion;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import net.fabricmc.loader.api.ModContainer;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.SharedConstants;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.LightLayer;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.level.block.state.properties.Property;
import net.minecraft.world.phys.Vec3;

/** Reads the game state on the client thread, at the moment of the screenshot. */
public final class SnapshotCollector {
	/** Farther than this a mob is a few pixels: not worth reporting as "in the picture". */
	private static final double MAX_ENTITY_DISTANCE = 96;
	/** The despawn sphere: what counts for lag and mob caps around the player. */
	private static final double NEARBY_RADIUS = 128;

	private SnapshotCollector() {}

	/** Returns null when there is no world (title screen, loading…). */
	public static CaptureSnapshot collect(Minecraft mc) {
		LocalPlayer player = mc.player;
		ClientLevel level = mc.level;
		if (player == null || level == null) return null;

		BlockPos pos = player.blockPosition();
		String dimension = level.dimension().location().toString();
		String biome = level.getBiome(pos).unwrapKey().map(k -> k.location().toString()).orElse("unknown");

		long clock = level.getDayTime();
		String weather = level.isThundering() ? "thunder" : level.isRaining() ? "rain" : "clear";
		ServerData server = mc.getCurrentServer();
		String worldType = mc.hasSingleplayerServer() ? "singleplayer" : mc.isConnectedToRealms() ? "realms" : "multiplayer";
		String worldName = mc.getSingleplayerServer() != null
			? mc.getSingleplayerServer().getWorldData().getLevelName()
			: server != null ? server.name : "";
		Long seed = mc.getSingleplayerServer() != null ? mc.getSingleplayerServer().overworld().getSeed() : null;

		CaptureSnapshot.Player p = new CaptureSnapshot.Player(
			new CaptureSnapshot.Vec(player.getX(), player.getY(), player.getZ()),
			new CaptureSnapshot.BlockVec(pos.getX(), pos.getY(), pos.getZ()),
			new CaptureSnapshot.BlockVec(pos.getX() >> 4, pos.getY() >> 4, pos.getZ() >> 4),
			player.getDirection().getSerializedName(),
			wrapDegrees(player.getYRot()),
			player.getXRot(),
			mc.gameMode != null ? mc.gameMode.getPlayerMode().getName() : "unknown"
		);

		CaptureSnapshot.Light light = new CaptureSnapshot.Light(
			level.getLightEngine().getLayerListener(LightLayer.SKY).getLightValue(pos),
			level.getLightEngine().getLayerListener(LightLayer.BLOCK).getLightValue(pos)
		);

		CaptureSnapshot.TargetBlock targetBlock = null;
		CaptureSnapshot.TargetEntity targetEntity = null;
		HitResult hit = mc.hitResult;
		if (hit instanceof BlockHitResult bh && hit.getType() == HitResult.Type.BLOCK) {
			BlockPos bp = bh.getBlockPos();
			var blockState = level.getBlockState(bp);
			Map<String, String> state = new TreeMap<>();
			blockState.getValues().forEach((property, value) -> state.put(property.getName(), valueName(property, value)));
			targetBlock = new CaptureSnapshot.TargetBlock(
				BuiltInRegistries.BLOCK.getKey(blockState.getBlock()).toString(),
				new CaptureSnapshot.BlockVec(bp.getX(), bp.getY(), bp.getZ()),
				state
			);
		} else if (hit instanceof EntityHitResult eh) {
			targetEntity = new CaptureSnapshot.TargetEntity(
				EntityType.getKey(eh.getEntity().getType()).toString(),
				eh.getEntity().distanceTo(player),
				eh.getEntity().getId()
			);
		}

		return new CaptureSnapshot(
			Instant.now().toString(),
			SharedConstants.getCurrentVersion().getName(),
			FabricLoader.getInstance().getModContainer(CraftshotCompanion.MOD_ID)
				.map(c -> c.getMetadata().getVersion().getFriendlyString()).orElse("?"),
			new CaptureSnapshot.World(worldType, worldName, seed, dimension, clock / 24000L, clock % 24000L, weather),
			p,
			biome,
			light,
			targetBlock,
			targetEntity,
			visibleEntities(mc, level, player),
			game(mc, level),
			mods(),
			nearbyEntities(level, player)
		);
	}

	private static CaptureSnapshot.Game game(Minecraft mc, ClientLevel level) {
		return new CaptureSnapshot.Game(
			level.getDifficulty().getSerializedName(),
			level.getLevelData().isHardcore(),
			mc.options.renderDistance().get(),
			mc.options.simulationDistance().get(),
			mc.player != null ? mc.player.getServerBrand() : null,
			20f,
			"normal"
		);
	}

	/** Mods the player installed (not the built-in ones nor the libraries nested in other jars). */
	private static List<CaptureSnapshot.ModInfo> mods() {
		List<CaptureSnapshot.ModInfo> out = new ArrayList<>();
		for (ModContainer m : FabricLoader.getInstance().getAllMods()) {
			var meta = m.getMetadata();
			if ("builtin".equals(meta.getType()) || m.getContainingMod().isPresent()) continue;
			out.add(new CaptureSnapshot.ModInfo(meta.getId(), meta.getName(), meta.getVersion().getFriendlyString()));
		}
		out.sort((a, b) -> a.id().compareTo(b.id()));
		return out;
	}

	/** Every loaded entity near the player by type (items and XP orbs included: they cause lag). */
	private static List<CaptureSnapshot.EntityGroup> nearbyEntities(ClientLevel level, LocalPlayer self) {
		Map<String, Integer> counts = new LinkedHashMap<>();
		for (Entity e : level.entitiesForRendering()) {
			if (e == self || e.distanceTo(self) > NEARBY_RADIUS) continue;
			counts.merge(EntityType.getKey(e.getType()).toString(), 1, Integer::sum);
		}
		return counts.entrySet().stream()
			.sorted((a, b) -> b.getValue() - a.getValue())
			.map(en -> new CaptureSnapshot.EntityGroup(en.getKey(), en.getValue(), 0))
			.toList();
	}

	@SuppressWarnings("unchecked")
	private static <T extends Comparable<T>> String valueName(Property<T> property, Comparable<?> value) {
		return property.getName((T) value);
	}

	/**
	 * Living entities actually in the picture: inside the camera's field of view and
	 * with an unobstructed line of sight (eyes or centre). Grouped by type.
	 */
	private static List<CaptureSnapshot.EntityGroup> visibleEntities(Minecraft mc, ClientLevel level, LocalPlayer self) {
		Camera camera = mc.gameRenderer.getMainCamera();
		Vec3 eye = camera.getPosition();
		Vec3 forward = new Vec3(camera.getLookVector());
		Vec3 up = new Vec3(camera.getUpVector());
		Vec3 right = forward.cross(up).normalize();

		double vFov = Math.toRadians(mc.options.fov().get());
		double aspect = (double) mc.getWindow().getWidth() / Math.max(1, mc.getWindow().getHeight());
		double tanV = Math.tan(vFov / 2);
		double tanH = tanV * aspect;

		Map<String, double[]> groups = new LinkedHashMap<>(); // id → [count, nearest]
		for (Entity e : level.entitiesForRendering()) {
			if (e == self || !(e instanceof LivingEntity) || e instanceof ArmorStand || e.isInvisible()) continue;
			Vec3 center = e.getBoundingBox().getCenter();
			double dist = center.distanceTo(eye);
			if (dist > MAX_ENTITY_DISTANCE) continue;
			// Project onto the camera axes; allow a margin of half the entity size.
			Vec3 d = center.subtract(eye);
			double z = d.dot(forward);
			if (z <= 0.1) continue;
			double margin = e.getBbWidth() / 2 + e.getBbHeight() / 2;
			if (Math.abs(d.dot(right)) > z * tanH + margin || Math.abs(d.dot(up)) > z * tanV + margin) continue;
			if (!hasLineOfSight(level, self, eye, e.getEyePosition()) && !hasLineOfSight(level, self, eye, center)) continue;
			String id = EntityType.getKey(e.getType()).toString();
			double[] g = groups.computeIfAbsent(id, k -> new double[] {0, Double.MAX_VALUE});
			g[0]++;
			g[1] = Math.min(g[1], dist);
		}
		List<CaptureSnapshot.EntityGroup> out = new ArrayList<>();
		groups.forEach((id, g) -> out.add(new CaptureSnapshot.EntityGroup(id, (int) g[0], g[1])));
		out.sort((a, b) -> Double.compare(a.nearest(), b.nearest()));
		return out;
	}

	private static boolean hasLineOfSight(ClientLevel level, Entity self, Vec3 from, Vec3 to) {
		BlockHitResult r = level.clip(new ClipContext(from, to, ClipContext.Block.VISUAL, ClipContext.Fluid.NONE, self));
		return r.getType() == HitResult.Type.MISS;
	}

	private static float wrapDegrees(float deg) {
		float d = deg % 360f;
		if (d >= 180f) d -= 360f;
		if (d < -180f) d += 360f;
		return d;
	}
}
