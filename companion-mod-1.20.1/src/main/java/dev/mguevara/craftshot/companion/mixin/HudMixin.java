package dev.mguevara.craftshot.companion.mixin;

import dev.mguevara.craftshot.companion.BuildPlacer;
import dev.mguevara.craftshot.companion.BuildPreview;
import dev.mguevara.craftshot.companion.Guide;
import dev.mguevara.craftshot.companion.Materials;
import dev.mguevara.craftshot.companion.Plans;
import dev.mguevara.craftshot.companion.compat.GuiGraphicsExtractor;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Gui;
import net.minecraft.client.gui.GuiGraphics;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Draws the build preview's status and controls on the HUD, wrapped to the screen width. */
@Mixin(Gui.class)
public abstract class HudMixin {
	@Inject(method = "render(Lnet/minecraft/client/gui/GuiGraphics;F)V", at = @At("TAIL"))
	private void craftshot$hud(GuiGraphics raw, float partial, CallbackInfo ci) {
		if (Minecraft.getInstance().options.hideGui) return;
		GuiGraphicsExtractor graphics = new GuiGraphicsExtractor(raw);
		BuildPreview.drawHud(graphics);
		BuildPlacer.drawHud(graphics);
		Guide.drawHud(graphics);
		Plans.drawHud(graphics);
		Materials.drawHud(graphics);
	}
}
