package dev.mguevara.craftshot.companion;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.util.List;
import java.util.Map;

/**
 * Everything collected at the moment F2 was pressed. Serialised as the
 * "craftshot-companion" JSON format (schema 1), the contract with the F2+F3 app.
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
	List<EntityGroup> entities,
	Game game,
	List<ModInfo> mods,
	List<EntityGroup> nearby
) {
	public static final String FORMAT = "craftshot-companion";
	public static final int SCHEMA = 1;

	public record Vec(double x, double y, double z) {}

	public record BlockVec(int x, int y, int z) {}

	public record World(String type, String name, Long seed, String dimension, long day, long timeOfDay, String weather) {}

	public record Player(Vec position, BlockVec block, BlockVec chunk, String direction, float yaw, float pitch, String gameMode) {}

	public record Light(int sky, int block) {}

	/** state: block state properties, e.g. {delay=3, facing=south}. */
	public record TargetBlock(String id, BlockVec pos, Map<String, String> state) {}

	/** networkId: the entity id shared with the integrated server (not serialised). */
	public record TargetEntity(String id, double distance, int networkId) {}

	/** Client-side settings and the tick rate the client was told about. */
	public record Game(String difficulty, boolean hardcore, int renderDistance, int simulationDistance,
			String serverBrand, float tickRate, String tickState) {}

	public record ModInfo(String id, String name, String version) {}

	public record EntityGroup(String id, int count, double nearest) {}

	/**
	 * The server part (structures, mob caps, game rules…) comes from the integrated server
	 * in singleplayer; null in multiplayer, where the client is never told about it.
	 */
	public JsonObject toJson(ServerCollector.Result server, String buildFile) {
		Structures structures = server != null ? server.structures() : null;
		JsonObject root = new JsonObject();
		root.addProperty("format", FORMAT);
		root.addProperty("schema", SCHEMA);

		JsonObject mod = new JsonObject();
		mod.addProperty("name", "F2+F3 Companion");
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
			if (!targetBlock.state().isEmpty()) {
				JsonObject st = new JsonObject();
				targetBlock.state().forEach(st::addProperty);
				b.add("state", st);
			}
			if (server != null && server.block() != null) server.block().entrySet().forEach(en -> b.add(en.getKey(), en.getValue()));
			target.add("block", b);
		}
		if (targetEntity != null) {
			JsonObject e = new JsonObject();
			e.addProperty("id", targetEntity.id());
			e.addProperty("distance", round(targetEntity.distance(), 2));
			if (server != null && server.villager() != null) e.add("villager", server.villager());
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

		JsonArray near = new JsonArray();
		for (EntityGroup g : nearby) {
			JsonObject e = new JsonObject();
			e.addProperty("id", g.id());
			e.addProperty("count", g.count());
			near.add(e);
		}
		root.add("nearby", near);

		JsonObject gm = new JsonObject();
		gm.addProperty("difficulty", game.difficulty());
		gm.addProperty("hardcore", game.hardcore());
		gm.addProperty("renderDistance", game.renderDistance());
		gm.addProperty("simulationDistance", game.simulationDistance());
		if (game.serverBrand() != null) gm.addProperty("serverBrand", game.serverBrand());
		JsonObject tick = new JsonObject();
		tick.addProperty("rate", server != null ? server.tickRate() : game.tickRate());
		tick.addProperty("state", server != null ? server.tickState() : game.tickState());
		if (server != null && server.mspt() != null) tick.addProperty("mspt", round(server.mspt(), 2));
		gm.add("tick", tick);
		root.add("game", gm);

		JsonArray ms = new JsonArray();
		for (ModInfo m : mods) {
			JsonObject o = new JsonObject();
			o.addProperty("id", m.id());
			o.addProperty("name", m.name());
			o.addProperty("version", m.version());
			ms.add(o);
		}
		root.add("mods", ms);

		if (server != null && server.spawn() != null) root.add("spawn", server.spawn());
		if (server != null && server.gamerules() != null) root.add("gamerules", server.gamerules());
		if (buildFile != null && server.build() != null) {
			ServerCollector.Build b = server.build();
			JsonObject o = new JsonObject();
			o.addProperty("file", buildFile);
			o.add("origin", vec(new BlockVec(b.origin().getX(), b.origin().getY(), b.origin().getZ())));
			o.add("size", vec(new BlockVec(b.size().getX(), b.size().getY(), b.size().getZ())));
			o.addProperty("blocks", b.blocks());
			o.addProperty("entities", b.entities());
			if (b.template() != null) o.addProperty("template", b.template());
			root.add("build", o);
		}

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
