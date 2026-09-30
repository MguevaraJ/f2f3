package dev.mguevara.craftshot.companion;

import java.text.Normalizer;
import java.util.function.Consumer;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.network.chat.Component;

/**
 * Asks for the build's name before saving it. Enter saves (empty → build_N), Esc goes
 * back to the preview. The world keeps running behind it, box included.
 */
public final class BuildNameScreen extends Screen {
	private static final int WIDTH = 220;

	private final String size;
	private final Consumer<String> onSave;
	private final Runnable onBack;
	private EditBox name;
	private boolean done;

	public BuildNameScreen(String size, Consumer<String> onSave, Runnable onBack) {
		super(Component.literal("Nombre del build"));
		this.size = size;
		this.onSave = onSave;
		this.onBack = onBack;
	}

	/** "Casa del Lago!" → "casa_del_lago": a valid template path, easy to type in /place. */
	public static String slug(String raw) {
		String s = Normalizer.normalize(raw, Normalizer.Form.NFD).replaceAll("\\p{M}+", "").toLowerCase();
		s = s.replaceAll("[^a-z0-9_.-]+", "_").replaceAll("_+", "_").replaceAll("^[_.-]+|[_.-]+$", "");
		return s.length() > 48 ? s.substring(0, 48) : s;
	}

	@Override
	protected void init() {
		int x = (width - WIDTH) / 2;
		int y = height / 2 - 20;
		name = new EditBox(font, x, y, WIDTH, 20, Component.literal("Nombre"));
		name.setMaxLength(64);
		name.setHint(Component.literal("Vacío = build_1, build_2…"));
		addRenderableWidget(name);
		addRenderableWidget(Button.builder(Component.literal("Guardar"), b -> save()).bounds(x, y + 28, WIDTH / 2 - 2, 20).build());
		addRenderableWidget(Button.builder(Component.literal("Volver"), b -> onClose()).bounds(x + WIDTH / 2 + 2, y + 28, WIDTH / 2 - 2, 20).build());
		setInitialFocus(name);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partial) {
		super.extractRenderState(g, mouseX, mouseY, partial);
		int y = height / 2 - 20;
		g.centeredText(font, "Nombre del build (" + size + ")", width / 2, y - 26, 0xFFFFFFFF);
		String preview = slug(name.getValue());
		g.centeredText(font, "Se guardará como craftshot:" + (preview.isEmpty() ? "build_N" : preview), width / 2, y - 13, 0xFFA0A0A0);
	}

	/** No blur: the box must stay visible behind; a dark panel keeps the text readable. */
	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mouseX, int mouseY, float partial) {
		int x = (width - WIDTH) / 2;
		int y = height / 2 - 20;
		g.fill(x - 10, y - 34, x + WIDTH + 10, y + 56, 0xC0101010);
	}

	@Override
	public boolean keyPressed(KeyEvent event) {
		if (event.isConfirmation()) {
			save();
			return true;
		}
		return super.keyPressed(event);
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	private void save() {
		if (done) return;
		done = true;
		minecraft.gui.setScreen(null);
		onSave.accept(slug(name.getValue()));
	}

	@Override
	public void onClose() {
		if (done) return;
		done = true;
		minecraft.gui.setScreen(null);
		onBack.run();
	}
}
