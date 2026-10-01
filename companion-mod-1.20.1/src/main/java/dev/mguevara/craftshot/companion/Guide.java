package dev.mguevara.craftshot.companion;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import dev.mguevara.craftshot.companion.compat.GuiGraphicsExtractor;
import net.minecraft.core.BlockPos;
import dev.mguevara.craftshot.companion.compat.GizmoStyle;
import dev.mguevara.craftshot.companion.compat.Gizmos;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;

/**
 * Leads the player to where a screenshot was taken: a small arrow on the HUD that turns
 * with the view, the distance, and a dot at the spot, joined to the player by a line once
 * near. It clears itself on arrival and can be hidden with the guide key. From the
 * other side of a Nether portal it points at the matching coordinates (×8 / ÷8).
 * Client thread only.
 */
public final class Guide {
	private static final int COLOR = 0xFFFFD24A;
	private static final GizmoStyle SPOT = GizmoStyle.stroke(COLOR, 2.5f);
	private static final float HUD_SCALE = 0.7f;
	/** Within this many blocks a line joins the player and the spot. */
	private static final double NEAR = 24;
	/** Horizontal blocks from the spot that count as being there. */
	private static final double ARRIVED = 3;
	private static final double ARRIVED_HEIGHT = 12;
	/** Gizmos beyond the view distance are not drawn: a far spot is shown this close, in line. */
	private static final double DOT_DISTANCE = 48;
	private static final String OVERWORLD = "minecraft:overworld";
	private static final String NETHER = "minecraft:the_nether";

	private static CaptureIndex.Capture capture;
	private static boolean hidden;

	private Guide() {}

	public static void start(Minecraft mc, CaptureIndex.Capture c) {
		capture = c;
		hidden = false;
		String key = CompanionConfig.get().guideKey().toUpperCase();
		if (mc.player != null) mc.player.displayClientMessage(Component.literal("Guía activada: sigue la flecha (" + key + " la oculta)"), true);
	}

	public static void clear() {
		capture = null;
	}

	/** Shows or hides the arrow and the spot without dropping the guide; false when there is none. */
	public static boolean toggle(Minecraft mc) {
		if (capture == null) return false;
		hidden = !hidden;
		if (mc.player != null) mc.player.displayClientMessage(Component.literal(hidden ? "Guía oculta" : "Guía visible"), true);
		return true;
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
		String here = mc.level.dimension().location().toString();
		String there = capture.dimension() == null ? here : capture.dimension();
		if (here.equals(there)) return new Vec3(p.getX() + 0.5, p.getY(), p.getZ() + 0.5);
		if (here.equals(OVERWORLD) && there.equals(NETHER)) return new Vec3(p.getX() * 8 + 4, mc.player.getY(), p.getZ() * 8 + 4);
		if (here.equals(NETHER) && there.equals(OVERWORLD)) return new Vec3(Math.floor(p.getX() / 8.0) + 0.5, mc.player.getY(), Math.floor(p.getZ() / 8.0) + 0.5);
		return null;
	}

	private static boolean sameDimension(Minecraft mc) {
		return capture.dimension() == null || capture.dimension().equals(mc.level.dimension().location().toString());
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
			mc.player.displayClientMessage(Component.literal("Has llegado al lugar de la captura"), true);
			return;
		}
		if (hidden) return;
		Vec3 spot = here ? new Vec3(goal.x, capture.pos().getY() + 0.5, goal.z) : goal;
		Vec3 eyes = mc.player.getEyePosition();
		Vec3 away = spot.subtract(eyes);
		double distance = away.length();
		if (distance > DOT_DISTANCE) spot = eyes.add(away.scale(DOT_DISTANCE / distance));
		Gizmos.point(spot, COLOR, 9f).setAlwaysOnTop();
		if (here && distance <= NEAR) {
			Gizmos.cuboid(capture.pos(), SPOT).setAlwaysOnTop();
			// From the feet: a line from the eyes would be seen end-on.
			Gizmos.line(me.add(0, 0.1, 0), spot, COLOR, 2f).setAlwaysOnTop();
		}
	}

	/** The arrow and the distance, at the top of the HUD. */
	public static void drawHud(GuiGraphicsExtractor g) {
		Minecraft mc = Minecraft.getInstance();
		if (capture == null || hidden || mc.player == null || mc.level == null || mc.screen != null) return;
		Font font = mc.font;
		// Drawn smaller than the rest of the HUD: it stays on screen for the whole trip.
		g.pose().pushMatrix();
		g.pose().scale(HUD_SCALE, HUD_SCALE);
		int cx = Math.round(g.guiWidth() / 2 / HUD_SCALE);
		hud(g, mc, font, cx);
		g.pose().popMatrix();
	}

	private static void hud(GuiGraphicsExtractor g, Minecraft mc, Font font, int cx) {
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
		g.pose().translate(cx, 16);
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
		centred(g, font, text, cx, 31, 0xFFFFFFFF);
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
