package dev.mguevara.craftshot.companion;

import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.server.IntegratedServer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Vec3i;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gizmos.GizmoStyle;
import net.minecraft.gizmos.Gizmos;
import net.minecraft.nbt.NbtAccounter;
import net.minecraft.nbt.NbtIo;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Util;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructurePlaceSettings;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplate;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;

/**
 * Puts a saved build back, framed like when it was saved: its box follows the aim with
 * the aimed block at the near right corner, and turns with the player. Enter places it,
 * sneak + wheel raises or lowers it, Esc cancels. What was there is kept so the last
 * placement can be undone. Singleplayer only (it runs on the integrated server).
 */
public final class BuildPlacer {
	private static final double PICK_RANGE = 96;
	private static final int MAX_LIFT = 64;
	private static final GizmoStyle FILL = GizmoStyle.fill(0x18FF9F43);
	private static final GizmoStyle EDGES = GizmoStyle.stroke(0xFFFF9F43, 2.5f);
	private static final GizmoStyle TARGET = GizmoStyle.stroke(0xFFFFD24A, 2.0f);
	private static final Direction[] ORDER = { Direction.NORTH, Direction.EAST, Direction.SOUTH, Direction.WEST };
	private static final Rotation[] ROTATIONS = { Rotation.NONE, Rotation.CLOCKWISE_90, Rotation.CLOCKWISE_180, Rotation.COUNTERCLOCKWISE_90 };

	private record Undo(ResourceKey<Level> dimension, BlockPos min, StructureTemplate before) {}

	private static boolean active;
	private static StructureTemplate template;
	private static String name;
	/** Where the player looked when saving it. */
	private static Direction then;
	private static int lift;
	private static BlockPos target;
	/** Lowest corner of the box, and the position /place would take for that rotation. */
	private static BlockPos min;
	private static BlockPos anchor;
	private static Rotation rotation = Rotation.NONE;
	private static Vec3i size = Vec3i.ZERO;
	private static Undo undo;

	private BuildPlacer() {}

	public static void start(Minecraft mc, CaptureIndex.Capture capture) {
		if (capture.build() == null || !mc.hasSingleplayerServer()) return;
		BuildPreview.cancel();
		active = false;
		Util.ioPool().execute(() -> {
			StructureTemplate loaded;
			try {
				loaded = new StructureTemplate();
				loaded.load(BuiltInRegistries.BLOCK, NbtIo.readCompressed(capture.build().file(), NbtAccounter.unlimitedHeap()));
			} catch (Exception e) {
				CraftshotCompanion.LOG.warn("Could not read {}", capture.build().file(), e);
				mc.execute(() -> message(mc, "No se pudo leer el build de esa captura"));
				return;
			}
			mc.execute(() -> {
				template = loaded;
				name = capture.name();
				then = capture.facing() == null ? null : Direction.byName(capture.facing());
				lift = 0;
				target = null;
				min = null;
				active = true;
			});
		});
	}

	public static void cancel() {
		active = false;
		template = null;
	}

	public static boolean canUndo(Minecraft mc) {
		return undo != null && mc.level != null && mc.hasSingleplayerServer() && undo.dimension() == mc.level.dimension();
	}

	/** Esc cancels; true consumes the key. */
	public static boolean onEscape(Minecraft mc) {
		if (!active || mc.gui.screen() != null) return false;
		cancel();
		message(mc, "Colocación cancelada");
		return true;
	}

	/** Enter places the build where the box is; true consumes the key. */
	public static boolean onConfirm(Minecraft mc) {
		if (!active || mc.gui.screen() != null) return false;
		IntegratedServer server = mc.getSingleplayerServer();
		if (min == null || server == null || mc.level == null) {
			message(mc, "Apunta al bloque donde irá la esquina del build");
			return true;
		}
		StructureTemplate placing = template;
		BlockPos at = anchor, corner = min;
		Vec3i box = size;
		Rotation turn = rotation;
		ResourceKey<Level> dimension = mc.level.dimension();
		cancel();
		server.execute(() -> {
			ServerLevel level = server.getLevel(dimension);
			if (level == null) return;
			StructureTemplate before = new StructureTemplate();
			before.fillFromWorld(level, corner, box, false, List.of());
			placing.placeInWorld(level, at, at, new StructurePlaceSettings().setRotation(turn), level.getRandom(), 2);
			mc.execute(() -> {
				undo = new Undo(dimension, corner, before);
				message(mc, "Build colocado · se puede deshacer desde la galería");
			});
		});
		return true;
	}

	/** Restores what was there before the last placement. */
	public static void undo(Minecraft mc) {
		IntegratedServer server = mc.getSingleplayerServer();
		Undo last = undo;
		if (last == null || server == null) return;
		undo = null;
		server.execute(() -> {
			ServerLevel level = server.getLevel(last.dimension());
			if (level == null) return;
			last.before().placeInWorld(level, last.min(), last.min(), new StructurePlaceSettings(), level.getRandom(), 2);
			mc.execute(() -> message(mc, "Colocación deshecha"));
		});
	}

	/** Scrolling while sneaking raises or lowers the build; true consumes the scroll. */
	public static boolean onScroll(Minecraft mc, double amount) {
		if (!active || amount == 0 || mc.player == null || !mc.player.isShiftKeyDown()) return false;
		lift = Math.max(-MAX_LIFT, Math.min(MAX_LIFT, lift + (amount > 0 ? 1 : -1)));
		return true;
	}

	/** End of each client tick: inside the per-tick gizmo collection. */
	public static void tick(Minecraft mc) {
		if (mc.level == null) {
			// Left the world: nothing of it can be placed or undone any more.
			undo = null;
			cancel();
			return;
		}
		if (!active) return;
		if (mc.player == null || mc.gui.screen() != null) {
			cancel();
			return;
		}
		HitResult hit = mc.player.pick(PICK_RANGE, 1.0f, false);
		target = hit instanceof BlockHitResult b && hit.getType() == HitResult.Type.BLOCK ? b.getBlockPos() : null;
		if (target == null) {
			min = null;
			return;
		}
		Direction looking = mc.player.getDirection();
		// Turned as the player has since saving it, so it is framed the same way.
		int quarters = then == null ? 0 : (index(looking) - index(then) + 4) % 4;
		rotation = ROTATIONS[quarters];
		Vec3i s = template.getSize();
		size = quarters % 2 == 0 ? s : new Vec3i(s.getZ(), s.getY(), s.getX());
		Direction left = looking.getCounterClockWise();
		BlockPos far = target
			.relative(looking, (looking.getAxis() == Direction.Axis.X ? size.getX() : size.getZ()) - 1)
			.relative(left, (left.getAxis() == Direction.Axis.X ? size.getX() : size.getZ()) - 1);
		min = new BlockPos(Math.min(target.getX(), far.getX()), target.getY() + lift, Math.min(target.getZ(), far.getZ()));
		// The template's own corner after rotating around it (clockwise_90: (x, z) → (−z, x)).
		anchor = switch (quarters) {
			case 1 -> min.offset(s.getZ() - 1, 0, 0);
			case 2 -> min.offset(s.getX() - 1, 0, s.getZ() - 1);
			case 3 -> min.offset(0, 0, s.getX() - 1);
			default -> min;
		};
		AABB box = new AABB(min.getX(), min.getY(), min.getZ(), min.getX() + size.getX(), min.getY() + size.getY(), min.getZ() + size.getZ()).inflate(0.02);
		Gizmos.cuboid(box, FILL);
		Gizmos.cuboid(box, EDGES).setAlwaysOnTop();
		Gizmos.cuboid(target, TARGET).setAlwaysOnTop();
	}

	public static void drawHud(GuiGraphicsExtractor g) {
		Minecraft mc = Minecraft.getInstance();
		if (!active || mc.gui.screen() != null) return;
		String status = min == null ? "Colocar " + name + ": apunta al bloque de la esquina"
			: "Colocar " + name + " · " + size.getX() + "×" + size.getY() + "×" + size.getZ()
				+ " · hacia el " + CaptureIndex.facingName(mc.player.getDirection().getName()).toLowerCase();
		String height = lift == 0 ? "a ras" : (lift > 0 ? "+" : "") + lift;
		BuildPreview.drawLines(g, status, "Enter coloca · Rueda agachado: sube o baja (" + height + ") · gírate para rotarlo · Esc cancela");
	}

	private static int index(Direction d) {
		for (int i = 0; i < ORDER.length; i++) if (ORDER[i] == d) return i;
		return 0;
	}

	private static void message(Minecraft mc, String text) {
		if (mc.player != null) mc.player.sendOverlayMessage(Component.literal(text));
	}
}
