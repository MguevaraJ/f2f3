package dev.mguevara.craftshot.companion;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.NbtAccounter;
import net.minecraft.nbt.NbtIo;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Util;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

/**
 * The shopping list of a saved build, pinned at the right of the HUD: every item its
 * blocks need against what the player carries, ticked off as the inventory fills up.
 * Pinned from the gallery; the materials key hides or shows it. Client thread only,
 * except reading the build.
 */
public final class Materials {
	private static final class Row {
		final ItemStack icon;
		final String name;
		final int need;
		int have;

		Row(Item item, int need) {
			this.icon = item.getDefaultInstance();
			this.name = icon.getHoverName().getString();
			this.need = need;
		}

		boolean done() {
			return have >= need;
		}
	}

	private static final float HUD_SCALE = 0.75f;
	private static final int ROW = 17;
	private static final int MAX_ROWS = 10;
	private static final int MARGIN = 6;
	private static final int COUNT_TICKS = 5;
	private static final int WHITE = 0xFFFFFFFF;
	private static final int MUTED = 0xFFA0A0A0;
	private static final int DONE = 0xFF6EE08A;
	private static final int PENDING = 0xFFFFD24A;

	private static CaptureIndex.Capture capture;
	/** In the build's order: most needed first. */
	private static List<Row> rows = List.of();
	/** As drawn: what is still missing first. */
	private static List<Row> sorted = List.of();
	private static boolean hidden;
	private static boolean complete;
	private static int ticks;

	private Materials() {}

	public static boolean isFor(CaptureIndex.Capture c) {
		return capture != null && c != null && capture.image().equals(c.image());
	}

	public static void clear() {
		capture = null;
		rows = sorted = List.of();
	}

	/** Pins the list of that screenshot's build. */
	public static void start(Minecraft mc, CaptureIndex.Capture c) {
		if (c.build() == null) return;
		Util.ioPool().execute(() -> {
			Map<Item, Integer> needed;
			try {
				needed = count(NbtIo.readCompressed(c.build().file(), NbtAccounter.unlimitedHeap()));
			} catch (Exception e) {
				CraftshotCompanion.LOG.warn("Could not read {}", c.build().file(), e);
				mc.execute(() -> message(mc, "No se pudo leer el build de esa captura"));
				return;
			}
			mc.execute(() -> {
				if (needed.isEmpty()) {
					message(mc, "Ese build no necesita materiales");
					return;
				}
				List<Row> list = new ArrayList<>();
				needed.forEach((item, n) -> list.add(new Row(item, n)));
				list.sort(Comparator.comparingInt((Row r) -> r.need).reversed());
				capture = c;
				rows = list;
				hidden = false;
				complete = false;
				recount(mc);
				String key = CompanionConfig.get().materialsKey().toUpperCase();
				message(mc, "Lista de materiales fijada (" + key + " la oculta)");
			});
		});
	}

	/** Items the structure's blocks take: one per block, two per double slab, one per door, bed or tall plant. */
	private static Map<Item, Integer> count(CompoundTag tag) {
		ListTag palette = tag.getListOrEmpty("palette");
		Item[] items = new Item[palette.size()];
		int[] each = new int[palette.size()];
		for (int i = 0; i < items.length; i++) {
			CompoundTag state = palette.getCompoundOrEmpty(i);
			// 26.x writes "id"; older structures, "Name".
			Identifier id = Identifier.tryParse(state.getStringOr("id", state.getStringOr("Name", "")));
			CompoundTag properties = state.getCompoundOrEmpty("Properties");
			Item item = id == null ? Items.AIR : BuiltInRegistries.BLOCK.getValue(id).asItem();
			// The other half of a door, a tall plant or a bed comes with the same item.
			boolean second = properties.getStringOr("half", "").equals("upper") || properties.getStringOr("part", "").equals("head");
			items[i] = second ? Items.AIR : item;
			each[i] = properties.getStringOr("type", "").equals("double") ? 2 : 1;
		}
		Map<Item, Integer> out = new LinkedHashMap<>();
		ListTag blocks = tag.getListOrEmpty("blocks");
		for (int i = 0; i < blocks.size(); i++) {
			int state = blocks.getCompoundOrEmpty(i).getIntOr("state", -1);
			if (state < 0 || state >= items.length || items[state] == Items.AIR) continue;
			out.merge(items[state], each[state], Integer::sum);
		}
		return out;
	}

	/** The materials key: shows or hides the list; false when nothing is pinned. */
	public static boolean toggle(Minecraft mc) {
		if (capture == null) return false;
		hidden = !hidden;
		message(mc, hidden ? "Lista de materiales oculta" : "Lista de materiales visible");
		return true;
	}

	public static void tick(Minecraft mc) {
		if (capture == null || mc.player == null) return;
		if (ticks++ % COUNT_TICKS == 0) recount(mc);
	}

	private static void recount(Minecraft mc) {
		if (mc.player == null) return;
		Map<Item, Integer> carried = new HashMap<>();
		Inventory inventory = mc.player.getInventory();
		for (int i = 0; i < inventory.getContainerSize(); i++) {
			ItemStack stack = inventory.getItem(i);
			if (!stack.isEmpty()) carried.merge(stack.getItem(), stack.getCount(), Integer::sum);
		}
		boolean all = true;
		for (Row row : rows) {
			row.have = carried.getOrDefault(row.icon.getItem(), 0);
			all &= row.done();
		}
		List<Row> order = new ArrayList<>(rows);
		// Stable: the build's order within each group.
		order.sort(Comparator.comparing(Row::done));
		sorted = order;
		if (all && !complete) message(mc, "Ya llevas todos los materiales de " + capture.name());
		complete = all;
	}

	private static void message(Minecraft mc, String text) {
		if (mc.player != null) mc.player.sendOverlayMessage(Component.literal(text));
	}

	/** The list, against the right edge and centred in height. */
	public static void drawHud(GuiGraphicsExtractor g) {
		Minecraft mc = Minecraft.getInstance();
		if (capture == null || hidden || mc.player == null || mc.gui.screen() != null) return;
		Font font = mc.font;
		int shown = Math.min(sorted.size(), MAX_ROWS);
		int more = sorted.size() - shown;
		int done = 0;
		for (Row row : rows) if (row.done()) done++;
		String title = complete ? "✔ Materiales listos" : "Materiales " + done + "/" + rows.size();
		String name = font.plainSubstrByWidth(capture.name(), 150);

		int width = Math.max(font.width(title), font.width(name));
		String[] counts = new String[shown];
		for (int i = 0; i < shown; i++) {
			Row row = sorted.get(i);
			counts[i] = Math.min(row.have, row.need) + "/" + row.need;
			width = Math.max(width, 20 + font.width(row.name) + 8 + font.width(counts[i]));
		}
		width = Math.min(width, 200) + MARGIN * 2;
		int height = MARGIN * 2 + 22 + shown * ROW + (more > 0 ? 11 : 0);

		g.pose().pushMatrix();
		g.pose().scale(HUD_SCALE, HUD_SCALE);
		int x = Math.round(g.guiWidth() / HUD_SCALE) - width - 4;
		int y = Math.round(g.guiHeight() / 2 / HUD_SCALE) - height / 2;
		g.fill(x, y, x + width, y + height, 0x90000000);
		g.fill(x, y, x + 2, y + height, complete ? DONE : PENDING);
		int left = x + MARGIN + 2, right = x + width - MARGIN;
		g.text(font, title, left, y + MARGIN, complete ? DONE : PENDING);
		g.text(font, name, left, y + MARGIN + 10, MUTED);
		int top = y + MARGIN + 22;
		for (int i = 0; i < shown; i++) {
			Row row = sorted.get(i);
			int color = row.done() ? DONE : WHITE;
			g.item(row.icon, left, top);
			String label = font.plainSubstrByWidth(row.name, right - left - 26 - font.width(counts[i]));
			g.text(font, label, left + 20, top + 4, row.done() ? MUTED : WHITE);
			g.text(font, counts[i], right - font.width(counts[i]), top + 4, color);
			top += ROW;
		}
		if (more > 0) g.text(font, "+" + more + " más", left, top + 1, MUTED);
		g.pose().popMatrix();
	}
}
