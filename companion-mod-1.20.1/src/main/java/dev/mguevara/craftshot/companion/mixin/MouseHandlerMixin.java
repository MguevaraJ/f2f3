package dev.mguevara.craftshot.companion.mixin;

import dev.mguevara.craftshot.companion.BuildPlacer;
import dev.mguevara.craftshot.companion.BuildPreview;
import net.minecraft.client.Minecraft;
import net.minecraft.client.MouseHandler;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Scrolling while sneaking in the build preview resizes the box instead of the hotbar. */
@Mixin(MouseHandler.class)
public abstract class MouseHandlerMixin {
	@Inject(method = "onScroll(JDD)V", at = @At("HEAD"), cancellable = true)
	private void craftshot$onScroll(long window, double x, double y, CallbackInfo ci) {
		Minecraft mc = Minecraft.getInstance();
		if (BuildPreview.onScroll(mc, y) || BuildPlacer.onScroll(mc, y)) ci.cancel();
	}
}
