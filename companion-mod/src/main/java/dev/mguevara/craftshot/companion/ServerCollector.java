package dev.mguevara.craftshot.companion;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import java.util.List;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.GlobalPos;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.Vec3i;
import net.minecraft.core.registries.Registries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.ServerTickRateManager;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.Container;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.ai.memory.MemoryModuleType;
import net.minecraft.world.entity.npc.villager.AbstractVillager;
import net.minecraft.world.entity.npc.villager.Villager;
import net.minecraft.world.entity.npc.villager.VillagerData;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.enchantment.ItemEnchantments;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.level.NaturalSpawner;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.ComparatorBlockEntity;
import net.minecraft.world.level.gamerules.GameRule;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplate;

/**
 * What only the (integrated) server knows, read on the server thread in singleplayer:
 * structures, tick time, mob caps, game rules, redstone and container contents of the
 * targeted block, and the targeted villager's trades and bonds.
 */
public final class ServerCollector {
	private ServerCollector() {}

	/** Everything the server added; each part is null when unknown. */
	public record Result(
		CaptureSnapshot.Structures structures,
		Float mspt,
		String tickState,
		Float tickRate,
		JsonObject spawn,
		JsonObject gamerules,
		JsonObject block,
		JsonObject villager,
		Build build
	) {}

	/** The blocks around the targeted block as a vanilla structure (.nbt), plus its summary. */
	public record Build(CompoundTag nbt, BlockPos origin, Vec3i size, int blocks, int entities) {}

	public static Result collect(MinecraftServer server, ServerLevel level, BlockPos at, BlockPos target, Integer entityId,
			BuildRegion buildRegion, String author) {
		ServerTickRateManager tick = server.tickRateManager();
		String state = tick.isFrozen() ? (tick.isSteppingForward() ? "stepping" : "frozen")
			: tick.isSprinting() ? "sprinting" : "normal";
		return new Result(
			new CaptureSnapshot.Structures(structuresAt(level, at), target != null ? structuresAt(level, target) : List.of()),
			server.getCurrentSmoothedTickTime(),
			state,
			tick.tickrate(),
			spawn(level),
			gamerules(level.getGameRules()),
			target != null ? block(level, target) : null,
			entityId != null ? villager(level.getEntity(entityId)) : null,
			buildRegion != null ? build(level, buildRegion, author) : null
		);
	}

	/** Saves the box as a vanilla structure; air inside is kept so pasting clears the area. */
	private static Build build(ServerLevel level, BuildRegion region, String author) {
		StructureTemplate template = new StructureTemplate();
		template.fillFromWorld(level, region.origin(), region.size(), true, List.of(Blocks.STRUCTURE_VOID));
		template.setAuthor(author);
		CompoundTag nbt = template.save(new CompoundTag());
		return new Build(nbt, region.origin(), region.size(), region.countBlocks(level), nbt.getListOrEmpty("entities").size());
	}

	private static List<String> structuresAt(ServerLevel level, BlockPos pos) {
		var registry = level.registryAccess().lookupOrThrow(Registries.STRUCTURE);
		return level.structureManager().getAllStructuresAt(pos).keySet().stream()
			.filter(st -> level.structureManager().getStructureAt(pos, st).isValid())
			.map((Structure st) -> String.valueOf(registry.getKey(st)))
			.sorted()
			.toList();
	}

	/** Mob counts per category from the last spawning pass, and the chunks it covered. */
	private static JsonObject spawn(ServerLevel level) {
		NaturalSpawner.SpawnState st = level.getChunkSource().getLastSpawnState();
		if (st == null) return null;
		JsonObject counts = new JsonObject();
		for (MobCategory c : MobCategory.values()) counts.addProperty(c.getName(), st.getMobCategoryCounts().getInt(c));
		JsonObject o = new JsonObject();
		o.addProperty("chunks", st.getSpawnableChunkCount());
		o.add("counts", counts);
		return o;
	}

	private static JsonObject gamerules(GameRules rules) {
		JsonObject out = new JsonObject();
		rules.availableRules().forEach(r -> putRule(out, rules, r));
		return out;
	}

	private static <T> void putRule(JsonObject out, GameRules rules, GameRule<T> rule) {
		JsonObject o = new JsonObject();
		o.add("value", primitive(rules.get(rule)));
		o.add("default", primitive(rule.defaultValue()));
		out.add(rule.getIdentifier().toString(), o);
	}

	private static JsonElement primitive(Object v) {
		if (v instanceof Boolean b) return new JsonPrimitive(b);
		if (v instanceof Number n) return new JsonPrimitive(n);
		return new JsonPrimitive(String.valueOf(v));
	}

	/** Redstone around the targeted block and what it holds. */
	private static JsonObject block(ServerLevel level, BlockPos pos) {
		JsonObject o = new JsonObject();
		JsonObject signal = new JsonObject();
		signal.addProperty("received", level.getBestNeighborSignal(pos));
		BlockEntity be = level.getBlockEntity(pos);
		if (be instanceof ComparatorBlockEntity comparator) signal.addProperty("comparatorOutput", comparator.getOutputSignal());
		if (be instanceof Container container) {
			signal.addProperty("containerSignal", AbstractContainerMenu.getRedstoneSignalFromContainer(container));
			JsonArray items = new JsonArray();
			for (int i = 0; i < container.getContainerSize(); i++) {
				ItemStack stack = container.getItem(i);
				if (stack.isEmpty()) continue;
				JsonObject item = item(stack);
				item.addProperty("slot", i);
				items.add(item);
			}
			JsonObject c = new JsonObject();
			c.addProperty("size", container.getContainerSize());
			c.add("items", items);
			o.add("container", c);
		}
		o.add("signal", signal);
		return o;
	}

	private static JsonObject item(ItemStack stack) {
		JsonObject o = new JsonObject();
		o.addProperty("id", stack.typeHolder().getRegisteredName());
		o.addProperty("count", stack.getCount());
		// What a librarian's book (or an enchanted tool) carries: the point of a trading hall.
		JsonObject ench = new JsonObject();
		for (var component : List.of(DataComponents.STORED_ENCHANTMENTS, DataComponents.ENCHANTMENTS)) {
			ItemEnchantments e = stack.get(component);
			if (e != null) for (var en : e.entrySet()) ench.addProperty(en.getKey().getRegisteredName(), en.getIntValue());
		}
		if (!ench.isEmpty()) o.add("enchantments", ench);
		return o;
	}

	/** Profession, level, trades and the POIs a villager is bound to. */
	private static JsonObject villager(Entity entity) {
		if (!(entity instanceof AbstractVillager merchant)) return null;
		JsonObject o = new JsonObject();
		if (merchant instanceof Villager v) {
			VillagerData data = v.getVillagerData();
			o.addProperty("profession", data.profession().getRegisteredName());
			o.addProperty("type", data.type().getRegisteredName());
			o.addProperty("level", data.level());
			o.addProperty("xp", v.getVillagerXp());
			pos(o, "home", v.getBrain().getMemory(MemoryModuleType.HOME));
			pos(o, "jobSite", v.getBrain().getMemory(MemoryModuleType.JOB_SITE));
			pos(o, "meetingPoint", v.getBrain().getMemory(MemoryModuleType.MEETING_POINT));
			// Villagers only need a golem when none was seen recently (iron farms).
			o.addProperty("golemDetectedRecently", v.getBrain().getMemory(MemoryModuleType.GOLEM_DETECTED_RECENTLY).orElse(false));
		}
		JsonArray trades = new JsonArray();
		for (MerchantOffer offer : merchant.getOffers()) {
			JsonObject t = new JsonObject();
			JsonArray buy = new JsonArray();
			buy.add(item(offer.getCostA()));
			if (!offer.getCostB().isEmpty()) buy.add(item(offer.getCostB()));
			t.add("buy", buy);
			t.add("sell", item(offer.getResult()));
			t.addProperty("uses", offer.getUses());
			t.addProperty("maxUses", offer.getMaxUses());
			trades.add(t);
		}
		o.add("trades", trades);
		return o;
	}

	private static void pos(JsonObject o, String key, Optional<GlobalPos> gp) {
		gp.ifPresent(p -> {
			JsonObject j = new JsonObject();
			j.addProperty("dimension", p.dimension().identifier().toString());
			j.addProperty("x", p.pos().getX());
			j.addProperty("y", p.pos().getY());
			j.addProperty("z", p.pos().getZ());
			o.add(key, j);
		});
	}
}
