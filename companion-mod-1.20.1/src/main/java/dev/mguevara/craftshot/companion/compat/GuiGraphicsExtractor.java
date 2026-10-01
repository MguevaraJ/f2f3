package dev.mguevara.craftshot.companion.compat;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.FormattedCharSequence;
import net.minecraft.world.item.ItemStack;

/**
 * This version's GuiGraphics under the names newer versions of the game use, so the HUD
 * and screen code reads the same in every port.
 */
public final class GuiGraphicsExtractor {
	/** The 2D transform, over the game's 3D pose stack. */
	public final class Pose {
		public void pushMatrix() {
			stack().pushPose();
		}

		public void popMatrix() {
			stack().popPose();
		}

		public void translate(float x, float y) {
			stack().translate(x, y, 0);
		}

		public void scale(float x, float y) {
			stack().scale(x, y, 1);
		}

		public void rotate(float radians) {
			stack().mulPose(Axis.ZP.rotation(radians));
		}
	}

	private final GuiGraphics graphics;
	private final Pose pose = new Pose();

	public GuiGraphicsExtractor(GuiGraphics graphics) {
		this.graphics = graphics;
	}

	public GuiGraphics raw() {
		return graphics;
	}

	private PoseStack stack() {
		return graphics.pose();
	}

	public Pose pose() {
		return pose;
	}

	public int guiWidth() {
		return graphics.guiWidth();
	}

	public int guiHeight() {
		return graphics.guiHeight();
	}

	public void text(Font font, String text, int x, int y, int color) {
		graphics.drawString(font, text, x, y, color);
	}

	public void text(Font font, Component text, int x, int y, int color) {
		graphics.drawString(font, text, x, y, color);
	}

	public void text(Font font, FormattedCharSequence text, int x, int y, int color) {
		graphics.drawString(font, text, x, y, color);
	}

	public void centeredText(Font font, String text, int x, int y, int color) {
		graphics.drawCenteredString(font, text, x, y, color);
	}

	public void centeredText(Font font, Component text, int x, int y, int color) {
		graphics.drawCenteredString(font, text, x, y, color);
	}

	public void fill(int x0, int y0, int x1, int y1, int color) {
		graphics.fill(x0, y0, x1, y1, color);
	}

	public void outline(int x, int y, int width, int height, int color) {
		graphics.renderOutline(x, y, width, height, color);
	}

	public void enableScissor(int x0, int y0, int x1, int y1) {
		graphics.enableScissor(x0, y0, x1, y1);
	}

	public void disableScissor() {
		graphics.disableScissor();
	}

	public void blit(Object pipeline, ResourceLocation texture, int x, int y, float u, float v, int width, int height,
			int textureWidth, int textureHeight) {
		graphics.blit(texture, x, y, u, v, width, height, textureWidth, textureHeight);
	}

	public void item(ItemStack stack, int x, int y) {
		graphics.renderItem(stack, x, y);
	}
}
