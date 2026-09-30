package dev.mguevara.craftshot.companion;

import net.fabricmc.api.ClientModInitializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Craftshot Companion: when a screenshot is taken (F2), writes the exact game data next
 * to it ("name.craftshot.json") so the Craftshot app can show coordinates, biome, mobs
 * and structures without relying on the F3 overlay or on image recognition.
 */
public final class CraftshotCompanion implements ClientModInitializer {
	public static final String MOD_ID = "craftshot_companion";
	public static final Logger LOG = LoggerFactory.getLogger("Craftshot Companion");

	@Override
	public void onInitializeClient() {
		LOG.info("Craftshot Companion ready: screenshots will get a .craftshot.json sidecar");
	}
}
