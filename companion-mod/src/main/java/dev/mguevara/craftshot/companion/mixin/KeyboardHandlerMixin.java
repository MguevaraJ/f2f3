package dev.mguevara.craftshot.companion.mixin;

import dev.mguevara.craftshot.companion.BuildPlacer;
import dev.mguevara.craftshot.companion.BuildPreview;
import dev.mguevara.craftshot.companion.CompanionConfig;
import dev.mguevara.craftshot.companion.GalleryScreen;
import dev.mguevara.craftshot.companion.Guide;
import dev.mguevara.craftshot.companion.Materials;
import dev.mguevara.craftshot.companion.Plans;
import net.minecraft.client.KeyboardHandler;
import net.minecraft.client.Minecraft;
import net.minecraft.client.input.KeyEvent;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * While a build is being framed or placed, Esc cancels instead of opening the pause menu and
 * Enter pins or places. In game, the gallery key opens the gallery and
 * the guide key shows or hides the guide, and the plans key the app's plans and the
 * materials key the pinned list of materials.
 */
@Mixin(KeyboardHandler.class)
public abstract class KeyboardHandlerMixin {
	private static final int PRESS = 1;

	@Inject(method = "keyPress(JILnet/minecraft/client/input/KeyEvent;)V", at = @At("HEAD"), cancellable = true)
	private void craftshot$onKey(long window, int action, KeyEvent event, CallbackInfo ci) {
		if (action != PRESS) return;
		Minecraft mc = Minecraft.getInstance();
		if (event.isEscape() && (BuildPreview.onEscape(mc) || BuildPlacer.onEscape(mc))) ci.cancel();
		else if (event.isConfirmation() && (BuildPreview.onLockKey(mc) || BuildPlacer.onConfirm(mc))) ci.cancel();
		else if (event.key() == CompanionConfig.get().galleryKeyCode() && mc.player != null && mc.gui.screen() == null) {
			mc.gui.setScreen(new GalleryScreen());
			ci.cancel();
		} else if (event.key() == CompanionConfig.get().guideKeyCode() && mc.gui.screen() == null && Guide.toggle(mc)) ci.cancel();
		else if (event.key() == CompanionConfig.get().plansKeyCode() && mc.gui.screen() == null && Plans.onKey(mc)) ci.cancel();
		else if (event.key() == CompanionConfig.get().materialsKeyCode() && mc.gui.screen() == null && Materials.toggle(mc)) ci.cancel();
	}
}
