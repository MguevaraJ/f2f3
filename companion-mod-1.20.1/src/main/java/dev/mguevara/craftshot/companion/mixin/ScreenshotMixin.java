package dev.mguevara.craftshot.companion.mixin;

import com.mojang.blaze3d.pipeline.RenderTarget;
import dev.mguevara.craftshot.companion.BuildPreview;
import dev.mguevara.craftshot.companion.SidecarWriter;
import java.io.File;
import java.util.function.Consumer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Hooks the two moments of a screenshot:
 *  1. grab(...) starts it on the client thread → take the game-state snapshot now;
 *  2. getFile(...) picks "YYYY-MM-DD_HH.MM.SS.png" when the pixels are ready → write the sidecar.
 */
@Mixin(Screenshot.class)
public abstract class ScreenshotMixin {
	/** The screenshot key: sneak+F2 opens the build preview instead of taking the picture. */
	@Inject(
		method = "grab(Ljava/io/File;Lcom/mojang/blaze3d/pipeline/RenderTarget;Ljava/util/function/Consumer;)V",
		at = @At("HEAD"),
		cancellable = true
	)
	private static void craftshot$onKey(File gameDirectory, RenderTarget target, Consumer<Component> callback, CallbackInfo ci) {
		if (BuildPreview.onScreenshotKey(Minecraft.getInstance())) ci.cancel();
	}

	@Inject(
		method = "grab(Ljava/io/File;Ljava/lang/String;Lcom/mojang/blaze3d/pipeline/RenderTarget;Ljava/util/function/Consumer;)V",
		at = @At("HEAD")
	)
	private static void craftshot$onGrab(File gameDirectory, String name, RenderTarget target,
			Consumer<Component> callback, CallbackInfo ci) {
		File known = name != null ? new File(new File(gameDirectory, Screenshot.SCREENSHOT_DIR), name) : null;
		SidecarWriter.begin(known);
	}

	@Inject(method = "getFile", at = @At("RETURN"))
	private static void craftshot$onFileChosen(File directory, CallbackInfoReturnable<File> cir) {
		SidecarWriter.fileChosen(cir.getReturnValue());
	}
}
