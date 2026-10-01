package dev.mguevara.craftshot.companion;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import dev.mguevara.craftshot.companion.compat.GuiGraphicsExtractor;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.Renderable;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.multiplayer.ServerData;
import dev.mguevara.craftshot.companion.compat.RenderPipelines;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.util.FormattedCharSequence;

/**
 * F2+F3 inside the game: the screenshots as a grid and, for the chosen one, what the
 * app shows about it. From here a screenshot's spot can be followed with the guide and
 * its saved build placed back.
 */
public final class GalleryScreen extends Screen {
	private static final int MARGIN = 8;
	private static final int TOP = 30;
	private static final int GAP = 4;
	private static final int LABEL = 11;
	private static final int BUTTON = 16;
	private static final int ACCENT = 0xFF5CE07A;
	private static final int MUTED = 0xFFA0A0A0;
	private static final int WHITE = 0xFFFFFFFF;

	private record Line(FormattedCharSequence text, int color) {}

	/** Kept between openings in a session. */
	private static boolean onlyThisWorld = true;

	private final String world;
	private List<CaptureIndex.Capture> all = List.of();
	private List<CaptureIndex.Capture> shown = List.of();
	private boolean loading = true;
	private boolean requested;
	private CaptureIndex.Capture selected;
	private List<Line> details = List.of();
	private double scroll;
	private double detailScroll;

	private int gridWidth, columns, cellWidth, imageHeight, panelX, panelWidth, bottom, detailTop, detailBottom;
	private Button filterButton, guideButton, copyButton, placeButton, materialsButton, undoButton;

	public GalleryScreen() {
		super(Component.literal("F2+F3"));
		Minecraft mc = Minecraft.getInstance();
		ServerData server = mc.getCurrentServer();
		world = mc.getSingleplayerServer() != null ? mc.getSingleplayerServer().getWorldData().getLevelName()
			: server != null ? server.name : "";
	}

	@Override
	protected void init() {
		panelWidth = Math.max(140, Math.min(240, width * 2 / 5));
		panelX = width - MARGIN - panelWidth;
		gridWidth = panelX - MARGIN * 2 - 4;
		columns = Math.max(1, (gridWidth + GAP) / (96 + GAP));
		cellWidth = (gridWidth - GAP * (columns - 1)) / columns;
		imageHeight = cellWidth * 9 / 16;
		bottom = height - MARGIN;

		filterButton = addRenderableWidget(Button.builder(Component.empty(), b -> {
			onlyThisWorld = !onlyThisWorld;
			filter();
		}).bounds(width - MARGIN - 120, 6, 120, 18).build());

		int x = panelX + 4, w = panelWidth - 8, y = 0;
		guideButton = addRenderableWidget(Button.builder(Component.empty(), b -> guide()).bounds(x, y, w, BUTTON).build());
		copyButton = addRenderableWidget(Button.builder(Component.literal("Copiar XYZ"), b -> {
			BlockPos p = selected.pos();
			minecraft.keyboardHandler.setClipboard(p.getX() + " " + p.getY() + " " + p.getZ());
			b.setMessage(Component.literal("Copiadas"));
		}).bounds(x, y, w, BUTTON).build());
		placeButton = addRenderableWidget(Button.builder(Component.literal("Colocar build"), b -> {
			minecraft.setScreen(null);
			BuildPlacer.start(minecraft, selected);
		}).bounds(x, y, w, BUTTON).build());
		materialsButton = addRenderableWidget(Button.builder(Component.empty(), b -> {
			if (Materials.isFor(selected)) Materials.clear();
			else Materials.start(minecraft, selected);
			minecraft.setScreen(null);
		}).bounds(x, y, w, BUTTON).build());
		undoButton = addRenderableWidget(Button.builder(Component.literal("Deshacer"), b -> {
			minecraft.setScreen(null);
			BuildPlacer.undo(minecraft);
		}).bounds(x, y, w, BUTTON).build());

		if (!requested) {
			requested = true;
			CaptureIndex.load(minecraft.gameDirectory.toPath()).thenAccept(list -> minecraft.execute(() -> {
				all = list;
				loading = false;
				filter();
			}));
		}
		filter();
	}

	private void filter() {
		filterButton.setMessage(Component.literal(onlyThisWorld ? "Solo este mundo" : "Todos los mundos"));
		shown = !onlyThisWorld ? all : all.stream().filter(c -> c.world().equals(world)).toList();
		if (selected != null && !shown.contains(selected)) selected = null;
		scroll = Math.max(0, Math.min(scroll, maxScroll()));
		select(selected);
	}

	private void select(CaptureIndex.Capture capture) {
		selected = capture;
		detailScroll = 0;
		details = capture == null ? List.of() : describe(capture);

		boolean guided = Guide.isFor(capture) || (capture == null && Guide.isActive());
		guideButton.setMessage(Component.literal(guided ? "Quitar guía" : "Guiarme"));
		String blocked = guided ? null
			: capture == null ? "Elige una captura"
			: capture.pos() == null ? "Esta captura no tiene coordenadas"
			: !capture.world().isEmpty() && !capture.world().equals(world) ? "Esta captura es de otro mundo (" + capture.world() + ")"
			: null;
		guideButton.active = blocked == null;
		guideButton.setTooltip(Tooltip.create(Component.literal(blocked != null ? blocked
			: guided ? "Deja de señalar el lugar de la captura" : "Una flecha te lleva al lugar de esta captura")));

		copyButton.visible = capture != null && capture.pos() != null;
		copyButton.setMessage(Component.literal("Copiar XYZ"));
		copyButton.setTooltip(Tooltip.create(Component.literal("Copia las coordenadas de la captura al portapapeles")));
		placeButton.visible = capture != null && capture.build() != null;
		placeButton.active = minecraft.hasSingleplayerServer();
		placeButton.setTooltip(Tooltip.create(Component.literal(placeButton.active ? "Coloca el build guardado con esta captura" : "Solo en mundos de un jugador")));
		boolean pinned = Materials.isFor(capture);
		materialsButton.visible = capture != null && capture.build() != null;
		materialsButton.setMessage(Component.literal(pinned ? "Quitar lista" : "Materiales"));
		materialsButton.setTooltip(Tooltip.create(Component.literal(pinned ? "Quita la lista de materiales de la pantalla"
			: "Fija en pantalla lo que necesita este build y lo va tachando con tu inventario")));
		undoButton.setTooltip(Tooltip.create(Component.literal("Deshace la última colocación de un build")));
		undoButton.visible = BuildPlacer.canUndo(minecraft);

		// Two per row at the bottom of the panel (a lone one takes the row); the details take the rest.
		List<Button> visible = new ArrayList<>();
		for (Button button : new Button[] { guideButton, copyButton, placeButton, materialsButton, undoButton }) if (button.visible) visible.add(button);
		int rows = (visible.size() + 1) / 2;
		int left = panelX + 4, full = panelWidth - 8, half = (full - 2) / 2;
		int top = bottom - 3 - rows * (BUTTON + 2);
		for (int i = 0; i < visible.size(); i++) {
			boolean alone = i == visible.size() - 1 && i % 2 == 0;
			Button button = visible.get(i);
			button.setX(left + (i % 2) * (half + 2));
			button.setY(top + (i / 2) * (BUTTON + 2));
			button.setWidth(alone ? full : half);
		}
		detailBottom = top - 4;
	}

	private void guide() {
		if (Guide.isFor(selected) || selected == null) Guide.clear();
		else Guide.start(minecraft, selected);
		minecraft.setScreen(null);
	}

	/** Everything known about a screenshot, wrapped to the panel. */
	private List<Line> describe(CaptureIndex.Capture c) {
		List<Line> out = new ArrayList<>();
		int max = panelWidth - 20;
		add(out, Component.literal(c.name()), WHITE, max);
		add(out, Component.literal(new SimpleDateFormat("dd/MM/yyyy HH:mm").format(new Date(c.time()))), MUTED, max);
		if (c.favorite()) add(out, Component.literal("★ Favorita"), 0xFFFFD24A, max);
		if (!c.tags().isEmpty()) add(out, Component.literal("#" + String.join(" #", c.tags())), 0xFF4FC3F7, max);
		if (!c.note().isEmpty()) add(out, Component.literal(c.note()), 0xFFFFE066, max);

		BlockPos p = c.pos();
		if (p != null && minecraft.player != null && c.world().equals(world)
				&& (c.dimension() == null || c.dimension().equals(minecraft.level.dimension().location().toString()))) {
			int distance = (int) Math.round(Math.sqrt(minecraft.player.distanceToSqr(p.getX() + 0.5, p.getY(), p.getZ() + 0.5)));
			add(out, Component.literal("A " + distance + " bloques de ti"), ACCENT, max);
		}
		for (CaptureIndex.Section section : c.sections()) {
			out.add(new Line(FormattedCharSequence.EMPTY, 0));
			add(out, Component.literal(section.title().toUpperCase()), ACCENT, max);
			for (String[] row : section.rows()) {
				MutableComponent text = Component.literal(row[0] + ": ").withStyle(ChatFormatting.GRAY)
					.append(Component.literal(row[1]).withStyle(ChatFormatting.WHITE));
				add(out, text, WHITE, max);
			}
		}
		if (c.sections().isEmpty()) {
			out.add(new Line(FormattedCharSequence.EMPTY, 0));
			add(out, Component.literal("Sin datos: no se hizo con el mod y la app aún no la ha analizado."), MUTED, max);
		}
		return out;
	}

	private void add(List<Line> out, Component text, int color, int max) {
		for (FormattedCharSequence line : font.split(text, max)) out.add(new Line(line, color));
	}

	private int rows() {
		return (shown.size() + columns - 1) / columns;
	}

	private int cellHeight() {
		return imageHeight + LABEL + GAP;
	}

	private double maxScroll() {
		return Math.max(0, rows() * cellHeight() - (bottom - TOP));
	}

	private double maxDetailScroll() {
		return Math.max(0, details.size() * (font.lineHeight + 1) - (detailBottom - detailTop));
	}

	@Override
	public void render(GuiGraphics raw, int mouseX, int mouseY, float partial) {
		// The background first: the game's own render would draw it over the gallery.
		renderBackground(raw, mouseX, mouseY, partial);
		GuiGraphicsExtractor g = new GuiGraphicsExtractor(raw);
		String count = loading ? "Cargando…" : shown.size() + (shown.size() == 1 ? " captura" : " capturas");
		g.text(font, "F2+F3", MARGIN, 11, ACCENT);
		g.text(font, "· " + count, MARGIN + font.width("F2+F3 "), 11, WHITE);

		g.enableScissor(MARGIN - 2, TOP - 2, MARGIN + gridWidth + 2, bottom);
		for (int i = 0; i < shown.size(); i++) {
			int x = MARGIN + (i % columns) * (cellWidth + GAP);
			int y = TOP + (i / columns) * cellHeight() - (int) scroll;
			if (y + cellHeight() < TOP || y > bottom) continue;
			CaptureIndex.Capture c = shown.get(i);
			g.fill(x, y, x + cellWidth, y + imageHeight, 0xFF1A1A1A);
			image(g, c, x, y, cellWidth, imageHeight);
			boolean hovered = mouseX >= x && mouseX < x + cellWidth && mouseY >= y && mouseY < y + imageHeight && mouseY >= TOP && mouseY < bottom;
			if (c == selected) g.outline(x - 1, y - 1, cellWidth + 2, imageHeight + 2, ACCENT);
			else if (hovered) g.outline(x - 1, y - 1, cellWidth + 2, imageHeight + 2, 0xB0FFFFFF);

			int badge = x + cellWidth - 2;
			if (c.build() != null) badge = badge(g, "BUILD", badge, y + 2, 0xFFFF9F43);
			if (Guide.isFor(c)) badge = badge(g, "GUÍA", badge, y + 2, 0xFFFFD24A);
			if (c.favorite()) badge(g, "★", badge, y + 2, 0xFFFFD24A);

			BlockPos p = c.pos();
			String label = !c.note().isEmpty() ? c.note() : p != null ? p.getX() + " " + p.getY() + " " + p.getZ() : c.name();
			g.text(font, font.plainSubstrByWidth(label, cellWidth), x, y + imageHeight + 2, c == selected ? WHITE : MUTED);
		}
		g.disableScissor();
		if (!loading && shown.isEmpty()) {
			g.centeredText(font, onlyThisWorld ? "No hay capturas de este mundo" : "No hay capturas", MARGIN + gridWidth / 2, TOP + 30, MUTED);
		}
		if (maxScroll() > 0) {
			int track = bottom - TOP;
			int thumb = Math.max(12, (int) (track * (double) track / (rows() * cellHeight())));
			int at = TOP + (int) ((track - thumb) * scroll / maxScroll());
			g.fill(MARGIN + gridWidth + 3, at, MARGIN + gridWidth + 5, at + thumb, 0x80FFFFFF);
		}

		g.fill(panelX, TOP - 2, panelX + panelWidth, bottom, 0xB0101010);
		if (selected == null) {
			detailTop = TOP + 6;
			g.centeredText(font, "Elige una captura", panelX + panelWidth / 2, TOP + 30, MUTED);
		} else {
			// A small picture: the panel is for the data.
			int w = (panelWidth - 8) * 3 / 5, h = w * 9 / 16, x = panelX + (panelWidth - w) / 2;
			g.fill(x, TOP + 2, x + w, TOP + 2 + h, 0xFF1A1A1A);
			image(g, selected, x, TOP + 2, w, h);
			detailTop = TOP + 2 + h + 6;
			// A darker well with a scrollbar: it reads as a list that goes on below.
			g.fill(panelX + 3, detailTop - 3, panelX + panelWidth - 3, detailBottom + 1, 0xC0000000);
			g.enableScissor(panelX + 3, detailTop - 1, panelX + panelWidth - 3, detailBottom);
			int y = detailTop - (int) detailScroll;
			for (Line line : details) {
				if (y + font.lineHeight >= detailTop && y <= detailBottom) g.text(font, line.text(), panelX + 7, y, line.color());
				y += font.lineHeight + 1;
			}
			g.disableScissor();
			if (maxDetailScroll() > 0) {
				int track = detailBottom - detailTop;
				int thumb = Math.max(10, (int) (track * (double) track / (details.size() * (font.lineHeight + 1))));
				int at = detailTop + (int) ((track - thumb) * detailScroll / maxDetailScroll());
				g.fill(panelX + panelWidth - 6, detailTop - 1, panelX + panelWidth - 4, detailBottom - 1, 0x30FFFFFF);
				g.fill(panelX + panelWidth - 6, at, panelX + panelWidth - 4, at + thumb, 0xC0FFFFFF);
			}
		}
		for (GuiEventListener child : children()) {
			if (child instanceof Renderable widget) widget.render(raw, mouseX, mouseY, partial);
		}
	}

	/** The screenshot, fitted inside the box and centred. */
	private void image(GuiGraphicsExtractor g, CaptureIndex.Capture c, int x, int y, int w, int h) {
		Thumbnails.Thumb thumb = Thumbnails.get(c.image());
		if (thumb == null) return;
		int dw = w, dh = thumb.height() * w / thumb.width();
		if (dh > h) {
			dh = h;
			dw = thumb.width() * h / thumb.height();
		}
		g.blit(RenderPipelines.GUI_TEXTURED, thumb.id(), x + (w - dw) / 2, y + (h - dh) / 2, 0f, 0f, dw, dh, dw, dh);
	}

	/** A small tag ending at `right`; returns where the next one ends. */
	private int badge(GuiGraphicsExtractor g, String text, int right, int y, int color) {
		int w = font.width(text) + 4;
		g.fill(right - w, y, right, y + font.lineHeight + 2, 0xC0000000);
		g.text(font, text, right - w + 2, y + 2, color);
		return right - w - 2;
	}

	@Override
	public boolean mouseClicked(double mx, double my, int button) {
		if (super.mouseClicked(mx, my, button)) return true;
		if (mx < MARGIN || mx >= MARGIN + gridWidth || my < TOP || my >= bottom) return false;
		int column = (int) ((mx - MARGIN) / (cellWidth + GAP));
		int row = (int) ((my - TOP + scroll) / cellHeight());
		int index = row * columns + column;
		if (column >= columns || index >= shown.size()) return false;
		select(shown.get(index));
		return true;
	}

	@Override
	public boolean mouseScrolled(double mx, double my, double dx, double dy) {
		if (mx >= panelX) detailScroll = Math.max(0, Math.min(maxDetailScroll(), detailScroll - dy * 14));
		else scroll = Math.max(0, Math.min(maxScroll(), scroll - dy * 28));
		return true;
	}

	@Override
	public boolean keyPressed(int key, int scancode, int modifiers) {
		if (key == CompanionConfig.get().galleryKeyCode()) {
			onClose();
			return true;
		}
		return super.keyPressed(key, scancode, modifiers);
	}

	@Override
	public void removed() {
		Thumbnails.clear();
		super.removed();
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}
}
