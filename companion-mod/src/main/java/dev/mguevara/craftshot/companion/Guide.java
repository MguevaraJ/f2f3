package dev.mguevara.craftshot.companion;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.core.BlockPos;
import net.minecraft.gizmos.GizmoStyle;
import net.minecraft.gizmos.Gizmos;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;

/**
 * Leads the player to where a screenshot was taken: an arrow on the HUD that turns with
 * the view, the distance, and a beam at the spot. It clears itself on arrival. From the
 * other side of a Nether portal it points at the matching coordinates (×8 / ÷8).
 * Client thread only.
 */
public final class Guide {
	private static final int COLOR = 0xFFFFD24A;
	private static final GizmoStyle SPOT = GizmoStyle.stroke(COLOR, 2.5f);
	/** Horizontal blocks from the spot that count as being there. */
	private static final double ARRIVED = 3;
	private static final double ARRIVED_HEIGHT = 12;
	/** Gizmos beyond the view distance are not drawn: far beams are shown this close, in line. */
	private static final double BEAM_DISTANCE = 48;
	private static final String OVERWORLD = "minecraft:overworld";
	private static final String NETHER = "minecraft:the_nether";

	private static CaptureIndex.Capture capture;

	private Guide() {}

	public static void start(Minecraft mc, CaptureIndex.Capture c) {
		capture = c;
		if (mc.player != null) mc.player.sendOverlayMessage(Component.literal("Guía activada: sigue la flecha"));
	}

	public static void clear() {
		capture = null;
	}

	public static boolean isActive() {
		return capture != null;
	}

	public static boolean isFor(CaptureIndex.Capture c) {
		return capture != null && c != null && capture.image().equals(c.image());
	}

	/** Where to head in the current dimension, or null when there is no way to tell. */
	private static Vec3 goal(Minecraft mc) {
		BlockPos p = capture.pos();
		String here = mc.level.dimension().identifier().toString();
		String there = capture.dimension() == null ? here : capture.dimension();
		if (here.equals(there)) return new Vec3(p.getX() + 0.5, p.getY(), p.getZ() + 0.5);
		if (here.equals(OVERWORLD) && there.equals(NETHER)) return new Vec3(p.getX() * 8 + 4, mc.player.getY(), p.getZ() * 8 + 4);
		if (here.equals(NETHER) && there.equals(OVERWORLD)) return new Vec3(Math.floor(p.getX() / 8.0) + 0.5, mc.player.getY(), Math.floor(p.getZ() / 8.0) + 0.5);
		return null;
	}

	private static boolean sameDimension(Minecraft mc) {
		return capture.dimension() == null || capture.dimension().equals(mc.level.dimension().identifier().toString());
	}

	/** End of each client tick: inside the per-tick gizmo collection. */
	public static void tick(Minecraft mc) {
		if (capture == null) return;
		if (mc.player == null || mc.level == null) {
			capture = null;
			return;
		}
		Vec3 goal = goal(mc);
		if (goal == null) return;
		Vec3 me = mc.player.position();
		double dx = goal.x - me.x, dz = goal.z - me.z;
		double flat = Math.sqrt(dx * dx + dz * dz);
		boolean here = sameDimension(mc);
		if (here && flat <= ARRIVED && Math.abs(goal.y - me.y) <= ARRIVED_HEIGHT) {
			capture = null;
			mc.player.sendOverlayMessage(Component.literal("Has llegado al lugar de la captura"));
			return;
		}
		double x = goal.x, z = goal.z;
		if (flat > BEAM_DISTANCE) {
			x = me.x + dx / flat * BEAM_DISTANCE;
			z = me.z + dz / flat * BEAM_DISTANCE;
		}
		Gizmos.line(new Vec3(x, me.y - 64, z), new Vec3(x, me.y + 128, z), COLOR, 3f).setAlwaysOnTop();
		if (here && flat <= BEAM_DISTANCE) Gizmos.cuboid(capture.pos(), SPOT).setAlwaysOnTop();
	}

	/** The arrow and the distance, at the top of the HUD. */
	public static void drawHud(GuiGraphicsExtractor g) {
		Minecraft mc = Minecraft.getInstance();
		if (capture == null || mc.player == null || mc.level == null || mc.gui.screen() != null) return;
		Font font = mc.font;
		int cx = g.guiWidth() / 2;
		Vec3 goal = goal(mc);
		String place = sameDimension(mc) ? "" : " · en " + CaptureIndex.dimensionName(capture.dimension());
		if (goal == null) {
			centred(g, font, "Captura" + place, cx, 8, COLOR);
			centred(g, font, "Ve a esa dimensión para seguir la guía", cx, 19, 0xFFFFFFFF);
			return;
		}
		Vec3 me = mc.player.position();
		double dx = goal.x - me.x, dz = goal.z - me.z;
		int flat = (int) Math.round(Math.sqrt(dx * dx + dz * dz));
		// Yaw 0 looks south (+z) and grows turning right.
		float turn = Mth.wrapDegrees((float) Math.toDegrees(Math.atan2(-dx, dz)) - mc.player.getYRot());

		g.pose().pushMatrix();
		g.pose().translate(cx, 20);
		g.pose().rotate((float) Math.toRadians(turn));
		arrow(g, 0xFF000000, 1);
		arrow(g, COLOR, 0);
		g.pose().popMatrix();

		String text = flat + " bloques" + place;
		if (sameDimension(mc)) {
			int dy = (int) Math.round(capture.pos().getY() - me.y);
			if (Math.abs(dy) >= 4) text += dy > 0 ? " · sube " + dy : " · baja " + -dy;
		} else {
			text += " · portal en " + (int) Math.floor(goal.x) + " " + (int) Math.floor(goal.z);
		}
		centred(g, font, text, cx, 36, 0xFFFFFFFF);
	}

	/** Pointing up, around the origin; `grow` fattens it for the outline. */
	private static void arrow(GuiGraphicsExtractor g, int color, int grow) {
		for (int i = 0; i < 8; i++) g.fill(-i - 1 - grow, -10 + i - grow, i + 1 + grow, -9 + i + grow, color);
		g.fill(-2 - grow, -2, 2 + grow, 9 + grow, color);
	}

	private static void centred(GuiGraphicsExtractor g, Font font, String text, int cx, int y, int color) {
		int w = font.width(text);
		g.fill(cx - w / 2 - 3, y - 2, cx + w / 2 + 3, y + font.lineHeight + 1, 0x90000000);
		g.text(font, text, cx - w / 2, y, color);
	}
}
