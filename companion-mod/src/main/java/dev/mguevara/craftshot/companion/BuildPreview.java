package dev.mguevara.craftshot.companion;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.Screenshot;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.gizmos.GizmoStyle;
import net.minecraft.gizmos.Gizmos;
import net.minecraft.network.chat.ClickEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.HoverEvent;
import net.minecraft.util.FormattedCharSequence;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;

/**
 * Sneak+F2 does not save right away: it shows the box that would be saved, following the
 * aim, with the aimed block at its near right corner. Three steps, each set by scrolling
 * while sneaking and confirmed with F2: how far it goes, how wide to the left, how tall.
 * The last F2 saves exactly that box (the screenshot is taken a moment later, once the box
 * is gone); Esc goes back a step or cancels. Client thread only.
 */
public final class BuildPreview {
	/** Ticks to wait so a frame without the box is rendered before the screenshot. */
	private static final int CAPTURE_DELAY_TICKS = 2;
	private static final double PICK_RANGE = 96;
	private static final GizmoStyle BOX_FILL = GizmoStyle.fill(0x185CE07A);
	private static final GizmoStyle BOX_EDGES = GizmoStyle.stroke(0xFF5CE07A, 2.5f);
	/** Blue while the box is pinned in place. */
	private static final GizmoStyle BOX_EDGES_LOCKED = GizmoStyle.stroke(0xFF4FC3F7, 2.5f);
	private static final GizmoStyle TARGET = GizmoStyle.stroke(0xFFFFD24A, 2.0f);

	private static boolean active;
	/** Pinned: the box stops following the aim, so the player can walk around and check it. */
	private static boolean locked;
	/** Blocks away from the player, and to their left. */
	private static int depth;
	private static int width;
	private static Direction facing;
	private static BlockPos target;
	private static int computedDepth;
	private static int computedWidth;
	/** 1: how far the base goes; 2: how wide (pinned from here on); 3: how tall. */
	private static int step = 1;
	/** Height chosen in step 3; 0 = as tall as the highest block inside. */
	private static int height;
	private static int computedHeight;
	private static boolean lockedBeforeWidth;
	private static BuildRegion region;
	private static int age;
	private static String hudStatus = "";
	private static String hudControls = "";

	private static int captureIn;
	private static boolean capturing;
	private static BuildRegion chosen;
	/** The name screen is open for the chosen box. */
	private static boolean naming;
	/** Name typed for the chosen box ("" → build_N). */
	private static String chosenName = "";

	private BuildPreview() {}

	/** Screenshot.grab(Minecraft, …) is starting; true cancels it. */
	public static boolean onScreenshotKey(Minecraft mc) {
		if (capturing) return false;
		if (naming) return true;
		if (active) {
			if (region == null) {
				message(mc, "Apunta a la base del build para guardarlo (Esc cancela)");
				return true;
			}
			if (step == 1) {
				// Depth done: pin the corner and let the wheel set the width.
				step = 2;
				lockedBeforeWidth = locked;
				locked = true;
				age = 0;
				return true;
			}
			if (step == 2) {
				step = 3;
				// The base was shown one block tall; the height starts at the highest block inside.
				BuildRegion full = CompanionConfig.get().region(mc.level, target, depth, width, facing, 0);
				height = full != null ? full.size().getY() : 1;
				age = 0;
				return true;
			}
			// Ask for a name first; the screenshot is taken once the screen is gone.
			chosen = region;
			active = false;
			naming = true;
			mc.gui.setScreen(new BuildNameScreen(region.sizeText(), name -> {
				naming = false;
				chosenName = name;
				captureIn = CAPTURE_DELAY_TICKS;
				// Keep the picture clean: no box and no action-bar text.
				if (mc.player != null) mc.player.sendOverlayMessage(Component.empty());
			}, () -> {
				naming = false;
				chosen = null;
				active = true;
				age = 0;
			}));
			return true;
		}
		CompanionConfig config = CompanionConfig.get();
		if (config.build().equals("sneak") && mc.player != null && mc.player.isShiftKeyDown() && mc.hasSingleplayerServer()) {
			BuildPlacer.cancel();
			active = true;
			locked = false;
			step = 1;
			height = 0;
			// The size chosen with the wheel is kept for the next build of this session.
			if (depth == 0) depth = width = config.buildSize();
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

	/** The name typed for the chosen box, once ("" → automatic). */
	public static String takeChosenName() {
		String n = chosenName;
		chosenName = "";
		return n;
	}

	/** Esc with the preview on screen (and nothing else open) cancels it; true consumes the key. */
	public static boolean onEscape(Minecraft mc) {
		if (!active || mc.gui.screen() != null) return false;
		if (step == 3) {
			// Back to the width, with the automatic height again.
			step = 2;
			height = 0;
			age = 0;
			return true;
		}
		if (step == 2) {
			step = 1;
			locked = lockedBeforeWidth;
			age = 0;
			return true;
		}
		active = false;
		message(mc, "Guardado del build cancelado");
		return true;
	}

	/** Enter pins the box where it is, or lets it follow the aim again; true consumes the key. */
	public static boolean onLockKey(Minecraft mc) {
		if (!active || mc.gui.screen() != null) return false;
		if (!locked && region == null) {
			message(mc, "Apunta a la base del build para fijar la caja");
			return true;
		}
		locked = !locked;
		age = 0;
		return true;
	}

	/** Scrolling while sneaking in the preview resizes the box; true consumes the scroll. */
	public static boolean onScroll(Minecraft mc, double amount) {
		if (!active || amount == 0 || mc.player == null || !mc.player.isShiftKeyDown()) return false;
		int delta = amount > 0 ? 1 : -1;
		if (step == 3) height = Math.max(1, Math.min(BuildRegion.MAX_HEIGHT, height + delta));
		else if (step == 2) width = side(width + delta);
		else depth = side(depth + delta);
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
		if (naming) {
			// The box stays visible behind the name screen.
			if (chosen != null) {
				var box = chosen.aabb().inflate(0.02);
				Gizmos.cuboid(box, BOX_FILL);
				Gizmos.cuboid(box, BOX_EDGES).setAlwaysOnTop();
			}
			return;
		}
		if (!active) return;
		if (mc.player == null || mc.level == null || mc.gui.screen() != null) {
			active = false;
			if (mc.player != null) message(mc, "Guardado del build cancelado");
			return;
		}
		// Our own ray, much longer than the hand's reach: the build is framed from outside.
		// Pinned: keep the corner and the direction it had, wherever the player looks now.
		HitResult hit = locked ? null : mc.player.pick(PICK_RANGE, 1.0f, false);
		BlockPos aimed = locked ? target
			: hit instanceof BlockHitResult b && hit.getType() == HitResult.Type.BLOCK ? b.getBlockPos() : null;
		Direction looking = locked ? facing : mc.player.getDirection();
		// The scan is up to 97³ blocks: redo it when the aim or the size changes, or twice a second.
		if (aimed == null) {
			region = null;
		} else if (!aimed.equals(target) || computedDepth != depth || computedWidth != width || computedHeight != height || looking != facing || age % 10 == 0) {
			// While choosing the base the box is a single layer: easier to judge than a tall one.
			BuildRegion fresh = CompanionConfig.get().region(mc.level, aimed, depth, width, looking, step < 3 ? 1 : height);
			// Far from a pinned box its chunks unload and it looks empty: keep the last one.
			if (fresh != null || !locked) region = fresh;
			computedDepth = depth;
			computedWidth = width;
			computedHeight = height;
		}
		facing = looking;
		target = aimed;
		if (region != null) {
			// Edges drawn over the blocks (the bottom ones are inside the ground), like a selection.
			var box = region.aabb().inflate(0.02);
			Gizmos.cuboid(box, BOX_FILL);
			Gizmos.cuboid(box, locked ? BOX_EDGES_LOCKED : BOX_EDGES).setAlwaysOnTop();
		}
		if (aimed != null) Gizmos.cuboid(aimed, TARGET).setAlwaysOnTop();
		// Shown by drawHud: the action bar is a single line and cut the text on narrow windows.
		String pin = "Enter " + (locked ? "suelta" : "fija");
		if (region == null) {
			hudStatus = "Apunta a la base del build";
			hudControls = "Esc cancela";
		} else if (step == 1) {
			hudStatus = "Paso 1 de 3: el fondo · " + (locked ? "FIJADA · " : "") + depth + " hacia el fondo × " + width + " a la izquierda";
			hudControls = "Rueda agachado: fondo (" + depth + ") · F2 siguiente · " + pin + " · Esc cancela";
		} else if (step == 2) {
			hudStatus = "Paso 2 de 3: el ancho · " + (locked ? "" : "SUELTA · ") + depth + " hacia el fondo × " + width + " a la izquierda";
			hudControls = "Rueda agachado: ancho (" + width + ") · F2 siguiente · " + pin + " · Esc vuelve al fondo";
		} else {
			hudStatus = "Paso 3 de 3: la altura · Build " + region.sizeText() + " · " + region.blocks() + " bloques";
			hudControls = "Rueda agachado: altura (" + height + ") · F2 guardar · " + pin + " · Esc vuelve al ancho";
		}
		age++;
	}

	/**
	 * Tells where the build was saved, with the /place command that puts it back around
	 * the player (same facing as now) one click away.
	 */
	public static void announce(ServerCollector.Build b, CaptureSnapshot.BlockVec player, String facing) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null) return;
		String command = "/place template " + b.template()
			+ " " + rel(b.origin().getX() - player.x()) + " " + rel(b.origin().getY() - player.y()) + " " + rel(b.origin().getZ() - player.z());
		Component copy = Component.literal("[Copiar comando]").withStyle(style -> style
			.withColor(ChatFormatting.GREEN)
			.withUnderlined(true)
			.withClickEvent(new ClickEvent.CopyToClipboard(command))
			.withHoverEvent(new HoverEvent.ShowText(Component.literal(command
				+ "\nEjecútalo mirando al " + facingName(facing) + " y el build aparecerá en el mismo sitio respecto a ti."))));
		mc.player.sendSystemMessage(Component.literal("Build guardado en el mundo como ")
			.append(Component.literal(b.template()).withStyle(ChatFormatting.YELLOW))
			.append(" (" + b.size().getX() + "×" + b.size().getY() + "×" + b.size().getZ() + ") ")
			.append(copy));
	}

	private static String rel(int n) {
		return n == 0 ? "~" : "~" + n;
	}

	private static String facingName(String facing) {
		return switch (facing) {
			case "north" -> "norte";
			case "south" -> "sur";
			case "east" -> "este";
			case "west" -> "oeste";
			default -> facing;
		};
	}

	/** Status and controls above the hotbar while the preview is on. */
	public static void drawHud(GuiGraphicsExtractor g) {
		Minecraft mc = Minecraft.getInstance();
		if (!active || mc.gui.screen() != null) return;
		drawLines(g, hudStatus, hudControls);
	}

	/** A status line and its controls above the hotbar, each wrapped to the screen width. */
	static void drawLines(GuiGraphicsExtractor g, String status, String controls) {
		Font font = Minecraft.getInstance().font;
		int max = Math.max(60, g.guiWidth() - 24);
		List<FormattedCharSequence> lines = new ArrayList<>(font.split(Component.literal(status), max));
		int statusLines = lines.size();
		lines.addAll(font.split(Component.literal(controls), max));
		int lineHeight = font.lineHeight + 2;
		int widest = 0;
		for (FormattedCharSequence line : lines) widest = Math.max(widest, font.width(line));
		// Above the hotbar, the hearts and the held item's name.
		int top = g.guiHeight() - 62 - lines.size() * lineHeight;
		g.fill((g.guiWidth() - widest) / 2 - 5, top - 4, (g.guiWidth() + widest) / 2 + 5, top + lines.size() * lineHeight + 1, 0x90000000);
		for (int i = 0; i < lines.size(); i++) {
			FormattedCharSequence line = lines.get(i);
			g.text(font, line, (g.guiWidth() - font.width(line)) / 2, top + i * lineHeight, i < statusLines ? 0xFFFFE066 : 0xFFFFFFFF);
		}
	}

	private static int side(int n) {
		return Math.max(CompanionConfig.MIN_SIZE, Math.min(CompanionConfig.MAX_SIZE, n));
	}

	/** Drops the preview without a message (another tool took over). */
	static void cancel() {
		active = false;
	}

	private static void message(Minecraft mc, String text) {
		if (mc.player != null) mc.player.sendOverlayMessage(Component.literal(text));
	}
}
