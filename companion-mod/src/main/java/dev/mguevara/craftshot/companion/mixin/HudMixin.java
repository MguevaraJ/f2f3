package dev.mguevara.craftshot.companion.mixin;

import dev.mguevara.craftshot.companion.BuildPlacer;
import dev.mguevara.craftshot.companion.BuildPreview;
import dev.mguevara.craftshot.companion.Guide;
import dev.mguevara.craftshot.companion.Materials;
import dev.mguevara.craftshot.companion.Plans;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.Hud;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Draws the build preview's status and controls on the HUD, wrapped to the screen width. */
@Mixin(Hud.class)
public abstract class HudMixin {
	@Inject(method = "extractRenderState(Lnet/minecraft/client/gui/GuiGraphicsExtractor;Lnet/minecraft/client/DeltaTracker;)V", at = @At("TAIL"))
	private void craftshot$hud(GuiGraphicsExtractor graphics, DeltaTracker delta, CallbackInfo ci) {
		BuildPreview.drawHud(graphics);
		BuildPlacer.drawHud(graphics);
		Guide.drawHud(graphics);
		Plans.drawHud(graphics);
		Materials.drawHud(graphics);
	}
}
