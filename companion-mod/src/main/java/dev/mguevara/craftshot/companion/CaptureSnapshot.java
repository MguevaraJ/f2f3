package dev.mguevara.craftshot.companion;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.util.List;

/**
 * Everything collected at the moment F2 was pressed. Serialised as the
 * "craftshot-companion" JSON format (schema 1), the contract with the Craftshot app.
 */
public record CaptureSnapshot(
	String capturedAt,
	String minecraftVersion,
	String modVersion,
	World world,
	Player player,
	String biome,
	Light light,
	TargetBlock targetBlock,
	TargetEntity targetEntity,
	List<EntityGroup> entities
) {
	public static final String FORMAT = "craftshot-companion";
	public static final int SCHEMA = 1;

	public record Vec(double x, double y, double z) {}

	public record BlockVec(int x, int y, int z) {}

	public record World(String type, String name, Long seed, String dimension, long day, long timeOfDay, String weather) {}

	public record Player(Vec position, BlockVec block, BlockVec chunk, String direction, float yaw, float pitch, String gameMode) {}

	public record Light(int sky, int block) {}

	public record TargetBlock(String id, BlockVec pos) {}

	public record TargetEntity(String id, double distance) {}

	public record EntityGroup(String id, int count, double nearest) {}

	/** Structures are resolved later on the integrated server thread (singleplayer only). */
	public JsonObject toJson(Structures structures) {
		JsonObject root = new JsonObject();
		root.addProperty("format", FORMAT);
		root.addProperty("schema", SCHEMA);

		JsonObject mod = new JsonObject();
		mod.addProperty("name", "Craftshot Companion");
		mod.addProperty("version", modVersion);
		mod.addProperty("loader", "fabric");
		mod.addProperty("minecraft", minecraftVersion);
		root.add("mod", mod);
		root.addProperty("capturedAt", capturedAt);

		JsonObject w = new JsonObject();
		w.addProperty("type", world.type());
		w.addProperty("name", world.name());
		// As a string: 64-bit seeds exceed JavaScript's safe integer range.
		if (world.seed() != null) w.addProperty("seed", Long.toString(world.seed()));
		w.addProperty("dimension", world.dimension());
		w.addProperty("day", world.day());
		w.addProperty("timeOfDay", world.timeOfDay());
		w.addProperty("weather", world.weather());
		root.add("world", w);

		JsonObject p = new JsonObject();
		p.add("position", vec(player.position()));
		p.add("block", vec(player.block()));
		p.add("chunk", vec(player.chunk()));
		JsonObject facing = new JsonObject();
		facing.addProperty("direction", player.direction());
		facing.addProperty("yaw", round(player.yaw(), 1));
		facing.addProperty("pitch", round(player.pitch(), 1));
		p.add("facing", facing);
		p.addProperty("gameMode", player.gameMode());
		root.add("player", p);

		root.addProperty("biome", biome);
		if (light != null) {
			JsonObject l = new JsonObject();
			l.addProperty("sky", light.sky());
			l.addProperty("block", light.block());
			root.add("light", l);
		}

		JsonObject target = new JsonObject();
		if (targetBlock != null) {
			JsonObject b = new JsonObject();
			b.addProperty("id", targetBlock.id());
			b.add("pos", vec(targetBlock.pos()));
			target.add("block", b);
		}
		if (targetEntity != null) {
			JsonObject e = new JsonObject();
			e.addProperty("id", targetEntity.id());
			e.addProperty("distance", round(targetEntity.distance(), 2));
			target.add("entity", e);
		}
		root.add("target", target);

		JsonArray ents = new JsonArray();
		for (EntityGroup g : entities) {
			JsonObject e = new JsonObject();
			e.addProperty("id", g.id());
			e.addProperty("count", g.count());
			e.addProperty("nearest", round(g.nearest(), 1));
			ents.add(e);
		}
		root.add("entities", ents);

		// null = unknown (multiplayer: the client is never told about structures).
		if (structures != null) {
			JsonObject s = new JsonObject();
			s.add("inside", array(structures.inside()));
			s.add("target", array(structures.target()));
			root.add("structures", s);
		}
		return root;
	}

	public record Structures(List<String> inside, List<String> target) {}

	private static JsonArray array(List<String> items) {
		JsonArray a = new JsonArray();
		items.forEach(a::add);
		return a;
	}

	private static JsonObject vec(Vec v) {
		JsonObject o = new JsonObject();
		o.addProperty("x", v.x());
		o.addProperty("y", v.y());
		o.addProperty("z", v.z());
		return o;
	}

	private static JsonObject vec(BlockVec v) {
		JsonObject o = new JsonObject();
		o.addProperty("x", v.x());
		o.addProperty("y", v.y());
		o.addProperty("z", v.z());
		return o;
	}

	private static double round(double v, int decimals) {
		double f = Math.pow(10, decimals);
		return Math.round(v * f) / f;
	}
}
