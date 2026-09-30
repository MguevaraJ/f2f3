package dev.mguevara.craftshot.companion;

import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.gizmos.GizmoStyle;
import net.minecraft.gizmos.Gizmos;
import net.minecraft.network.chat.Component;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;

/**
 * Sneak+F2 does not save right away: it shows the box that would be saved, following the
 * aim, with the aimed block at its near right corner. Scrolling while sneaking resizes it, F2 saves exactly that box (the screenshot is
 * taken a moment later, once the box is gone) and Esc cancels. Client thread only.
 */
public final class BuildPreview {
	/** Ticks to wait so a frame without the box is rendered before the screenshot. */
	private static final int CAPTURE_DELAY_TICKS = 2;
	private static final double PICK_RANGE = 96;
	private static final GizmoStyle BOX_FILL = GizmoStyle.fill(0x185CE07A);
	private static final GizmoStyle BOX_EDGES = GizmoStyle.stroke(0xFF5CE07A, 2.5f);
	private static final GizmoStyle TARGET = GizmoStyle.stroke(0xFFFFD24A, 2.0f);

	private static boolean active;
	private static int size;
	private static Direction facing;
	private static BlockPos target;
	private static int computedSize;
	private static BuildRegion region;
	private static int age;

	private static int captureIn;
	private static boolean capturing;
	private static BuildRegion chosen;

	private BuildPreview() {}

	/** Screenshot.grab(Minecraft, …) is starting; true cancels it. */
	public static boolean onScreenshotKey(Minecraft mc) {
		if (capturing) return false;
		if (active) {
			if (region == null) {
				message(mc, "Apunta a la base del build para guardarlo (Esc cancela)");
				return true;
			}
			chosen = region;
			active = false;
			captureIn = CAPTURE_DELAY_TICKS;
			// Keep the picture clean: no box and no action-bar text.
			if (mc.player != null) mc.player.sendOverlayMessage(Component.empty());
			return true;
		}
		CompanionConfig config = CompanionConfig.get();
		if (config.build().equals("sneak") && mc.player != null && mc.player.isShiftKeyDown() && mc.hasSingleplayerServer()) {
			active = true;
			size = config.buildSize();
			target = null;
			region = null;
			age = 0;
			return true;
		}
		return false;
	}

	/** The box chosen in the preview, once, for the screenshot being taken. */
	public static BuildRegion takeChosen() {
		BuildRegion r = chosen;
		chosen = null;
		return r;
	}

	/** Scrolling while sneaking in the preview resizes the box; true consumes the scroll. */
	public static boolean onScroll(Minecraft mc, double amount) {
		if (!active || amount == 0 || mc.player == null || !mc.player.isShiftKeyDown()) return false;
		size = Math.max(CompanionConfig.MIN_SIZE, Math.min(CompanionConfig.MAX_SIZE, size + (amount > 0 ? 1 : -1)));
		age = 0;
		return true;
	}

	/** End of each client tick: inside the per-tick gizmo collection. */
	public static void tick(Minecraft mc) {
		if (captureIn > 0 && --captureIn == 0) {
			BuildRegion saved = chosen;
			capturing = true;
			try {
				Screenshot.grab(mc, false);
			} finally {
				capturing = false;
			}
			if (saved != null) message(mc, "Build guardado: " + saved.sizeText() + " · " + saved.blocks() + " bloques");
			return;
		}
		if (!active) return;
		if (mc.player == null || mc.level == null || mc.gui.screen() != null) {
			active = false;
			if (mc.player != null) message(mc, "Guardado del build cancelado");
			return;
		}
		// Our own ray, much longer than the hand's reach: the build is framed from outside.
		HitResult hit = mc.player.pick(PICK_RANGE, 1.0f, false);
		BlockPos aimed = hit instanceof BlockHitResult b && hit.getType() == HitResult.Type.BLOCK ? b.getBlockPos() : null;
		Direction looking = mc.player.getDirection();
		// The scan is up to 97³ blocks: redo it when the aim or the size changes, or twice a second.
		if (aimed == null) {
			region = null;
		} else if (!aimed.equals(target) || computedSize != size || looking != facing || age % 10 == 0) {
			region = CompanionConfig.get().region(mc.level, aimed, size, looking);
			computedSize = size;
		}
		facing = looking;
		target = aimed;
		if (region != null) {
			// Edges drawn over the blocks (the bottom ones are inside the ground), like a selection.
			var box = region.aabb().inflate(0.02);
			Gizmos.cuboid(box, BOX_FILL);
			Gizmos.cuboid(box, BOX_EDGES).setAlwaysOnTop();
		}
		if (aimed != null) Gizmos.cuboid(aimed, TARGET).setAlwaysOnTop();
		if (age % 10 == 0) {
			message(mc, region == null
				? "Apunta a la base del build · Esc cancela"
				: "Build " + region.sizeText() + " · " + region.blocks() + " bloques · F2 guarda · rueda agachado: tamaño (" + size + ") · Esc cancela");
		}
		age++;
	}

	private static void message(Minecraft mc, String text) {
		if (mc.player != null) mc.player.sendOverlayMessage(Component.literal(text));
	}
}
