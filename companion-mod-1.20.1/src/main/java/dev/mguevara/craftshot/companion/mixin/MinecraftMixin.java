package dev.mguevara.craftshot.companion.mixin;

import dev.mguevara.craftshot.companion.BuildPlacer;
import dev.mguevara.craftshot.companion.BuildPreview;
import dev.mguevara.craftshot.companion.Guide;
import dev.mguevara.craftshot.companion.Materials;
import dev.mguevara.craftshot.companion.Plans;
import dev.mguevara.craftshot.companion.compat.Gizmos;
import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Runs the build preview, the build placer, the guide and the plans each client tick, while per-tick gizmos are being collected. */
@Mixin(Minecraft.class)
public abstract class MinecraftMixin {
	@Inject(method = "tick()V", at = @At("TAIL"))
	private void craftshot$tick(CallbackInfo ci) {
		Minecraft mc = (Minecraft) (Object) this;
		Gizmos.beginTick();
		BuildPreview.tick(mc);
		BuildPlacer.tick(mc);
		Guide.tick(mc);
		Plans.tick(mc);
		Materials.tick(mc);
		Gizmos.endTick();
	}
}
