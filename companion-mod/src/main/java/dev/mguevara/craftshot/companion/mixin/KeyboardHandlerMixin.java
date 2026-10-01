package dev.mguevara.craftshot.companion.mixin;

import dev.mguevara.craftshot.companion.BuildPreview;
import net.minecraft.client.KeyboardHandler;
import net.minecraft.client.Minecraft;
import net.minecraft.client.input.KeyEvent;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** During the build preview, Esc cancels it instead of opening the pause menu and Enter pins the box. */
@Mixin(KeyboardHandler.class)
public abstract class KeyboardHandlerMixin {
	private static final int PRESS = 1;

	@Inject(method = "keyPress(JILnet/minecraft/client/input/KeyEvent;)V", at = @At("HEAD"), cancellable = true)
	private void craftshot$onKey(long window, int action, KeyEvent event, CallbackInfo ci) {
		if (action != PRESS) return;
		Minecraft mc = Minecraft.getInstance();
		if (event.isEscape() && BuildPreview.onEscape(mc)) ci.cancel();
		else if (event.isConfirmation() && BuildPreview.onLockKey(mc)) ci.cancel();
	}
}
