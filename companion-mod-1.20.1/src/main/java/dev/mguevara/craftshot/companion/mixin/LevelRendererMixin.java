package dev.mguevara.craftshot.companion.mixin;

import dev.mguevara.craftshot.companion.compat.Gizmos;
import net.minecraft.client.Camera;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.client.renderer.LevelRenderer;
import net.minecraft.client.renderer.LightTexture;
import org.joml.Matrix4f;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Draws the mod's shapes (boxes, lines, labels) once the level is on screen. */
@Mixin(LevelRenderer.class)
public abstract class LevelRendererMixin {
	@Inject(method = "renderLevel", at = @At("TAIL"))
	private void craftshot$shapes(PoseStack pose, float partial, long limit, boolean outline, Camera camera, GameRenderer renderer,
			LightTexture light, Matrix4f projection, CallbackInfo ci) {
		Gizmos.render(pose.last().pose(), camera);
	}
}
