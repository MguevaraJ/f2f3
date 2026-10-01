package dev.mguevara.craftshot.companion.compat;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.BufferBuilder;
import com.mojang.blaze3d.vertex.BufferUploader;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.Tesselator;
import com.mojang.blaze3d.vertex.VertexFormat;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.core.BlockPos;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;
import org.joml.Vector3f;

/**
 * Shapes drawn in the world for one tick: lines, boxes, flat quads, dots and text. Newer
 * versions of the game have this built in (net.minecraft.gizmos); here the shapes asked
 * for during a client tick are kept and drawn after the level every frame until the next
 * tick replaces them. Client and render thread are the same thread.
 */
public final class Gizmos {
	private abstract static class Shape implements GizmoProperties {
		boolean onTop;

		@Override
		public GizmoProperties setAlwaysOnTop() {
			onTop = true;
			return this;
		}
	}

	private static final class Line extends Shape {
		final Vec3 a, b;
		final int color;
		final float width;

		Line(Vec3 a, Vec3 b, int color, float width) {
			this.a = a;
			this.b = b;
			this.color = color;
			this.width = width;
		}
	}

	private static final class Quad extends Shape {
		final Vec3[] corners;
		final int color;

		Quad(int color, Vec3... corners) {
			this.corners = corners;
			this.color = color;
		}
	}

	private static final class Point extends Shape {
		final Vec3 pos;
		final int color;
		final float size;

		Point(Vec3 pos, int color, float size) {
			this.pos = pos;
			this.color = color;
			this.size = size;
		}
	}

	private static final class Text extends Shape {
		final String text;
		final Vec3 pos;
		final TextGizmo.Style style;

		Text(String text, Vec3 pos, TextGizmo.Style style) {
			this.text = text;
			this.pos = pos;
			this.style = style;
		}
	}

	/** Several shapes behind one handle (a box is twelve lines). */
	private static final class Group implements GizmoProperties {
		final List<Shape> shapes = new ArrayList<>();

		@Override
		public GizmoProperties setAlwaysOnTop() {
			for (Shape s : shapes) s.onTop = true;
			return this;
		}
	}

	/** Lines longer than this are cut: the game's line shader loses the ones that cross behind the camera. */
	private static final double MAX_SEGMENT = 16;
	/** World size of a dot per pixel of its size and block of distance. */
	private static final double POINT_SCALE = 0.0011;
	private static final float TEXT_SCALE = 0.03f;

	private static List<Shape> collecting = new ArrayList<>();
	private static List<Shape> drawn = List.of();

	private Gizmos() {}

	/** Start of the mod's part of a client tick. */
	public static void beginTick() {
		collecting = new ArrayList<>();
	}

	/** End of it: what was asked for is what gets drawn from now on. */
	public static void endTick() {
		drawn = collecting;
	}

	private static <T extends Shape> T add(T shape) {
		collecting.add(shape);
		return shape;
	}

	public static GizmoProperties line(Vec3 a, Vec3 b, int color, float width) {
		return add(new Line(a, b, color, width));
	}

	public static GizmoProperties point(Vec3 pos, int color, float size) {
		return add(new Point(pos, color, size));
	}

	public static GizmoProperties billboardText(String text, Vec3 pos, TextGizmo.Style style) {
		return add(new Text(text, pos, style));
	}

	public static GizmoProperties rect(Vec3 a, Vec3 b, Vec3 c, Vec3 d, GizmoStyle style) {
		Group group = new Group();
		if (style.hasFill()) group.shapes.add(add(new Quad(style.fill(), a, b, c, d)));
		if (style.hasStroke()) {
			Vec3[] corners = { a, b, c, d };
			for (int i = 0; i < 4; i++) {
				group.shapes.add(add(new Line(corners[i], corners[(i + 1) % 4], style.stroke(), style.strokeWidth())));
			}
		}
		return group;
	}

	public static GizmoProperties cuboid(BlockPos pos, GizmoStyle style) {
		return cuboid(new AABB(pos), style);
	}

	public static GizmoProperties cuboid(AABB box, GizmoStyle style) {
		Group group = new Group();
		Vec3[] c = new Vec3[8];
		for (int i = 0; i < 8; i++) {
			c[i] = new Vec3((i & 1) == 0 ? box.minX : box.maxX, (i & 2) == 0 ? box.minY : box.maxY, (i & 4) == 0 ? box.minZ : box.maxZ);
		}
		if (style.hasFill()) {
			int[][] faces = { { 0, 1, 5, 4 }, { 2, 6, 7, 3 }, { 0, 2, 3, 1 }, { 4, 5, 7, 6 }, { 0, 4, 6, 2 }, { 1, 3, 7, 5 } };
			for (int[] f : faces) group.shapes.add(add(new Quad(style.fill(), c[f[0]], c[f[1]], c[f[2]], c[f[3]])));
		}
		if (style.hasStroke()) {
			int[][] edges = { { 0, 1 }, { 2, 3 }, { 4, 5 }, { 6, 7 }, { 0, 2 }, { 1, 3 }, { 4, 6 }, { 5, 7 }, { 0, 4 }, { 1, 5 }, { 2, 6 }, { 3, 7 } };
			for (int[] e : edges) group.shapes.add(add(new Line(c[e[0]], c[e[1]], style.stroke(), style.strokeWidth())));
		}
		return group;
	}

	// ── drawing ──

	/** After the level is drawn; `modelView` is the camera's rotation. */
	public static void render(Matrix4f modelView, Camera camera) {
		List<Shape> shapes = drawn;
		if (shapes.isEmpty()) return;
		Vec3 cam = camera.getPosition();
		PoseStack stack = RenderSystem.getModelViewStack();
		stack.pushPose();
		stack.mulPoseMatrix(modelView);
		RenderSystem.applyModelViewMatrix();
		float fog = RenderSystem.getShaderFogStart();
		RenderSystem.setShaderFogStart(Float.MAX_VALUE);
		RenderSystem.enableBlend();
		RenderSystem.defaultBlendFunc();
		RenderSystem.disableCull();
		RenderSystem.depthMask(false);

		for (int pass = 0; pass < 2; pass++) {
			boolean onTop = pass == 1;
			if (onTop) RenderSystem.disableDepthTest();
			else RenderSystem.enableDepthTest();
			quads(shapes, onTop, cam, camera);
			lines(shapes, onTop, cam);
			texts(shapes, onTop, cam, camera);
		}

		RenderSystem.enableDepthTest();
		RenderSystem.depthMask(true);
		RenderSystem.enableCull();
		RenderSystem.disableBlend();
		RenderSystem.lineWidth(1f);
		RenderSystem.setShaderFogStart(fog);
		stack.popPose();
		RenderSystem.applyModelViewMatrix();
	}

	private static void vertex(BufferBuilder buffer, Vec3 p, Vec3 cam, int color) {
		buffer.vertex(p.x - cam.x, p.y - cam.y, p.z - cam.z).color(color).endVertex();
	}

	private static void draw(BufferBuilder buffer) {
		BufferBuilder.RenderedBuffer mesh = buffer.endOrDiscardIfEmpty();
		if (mesh != null) BufferUploader.drawWithShader(mesh);
	}

	private static void quads(List<Shape> shapes, boolean onTop, Vec3 cam, Camera camera) {
		RenderSystem.setShader(GameRenderer::getPositionColorShader);
		BufferBuilder buffer = Tesselator.getInstance().getBuilder();
		buffer.begin(VertexFormat.Mode.QUADS, DefaultVertexFormat.POSITION_COLOR);
		Vector3f left = camera.getLeftVector(), up = camera.getUpVector();
		for (Shape shape : shapes) {
			if (shape.onTop != onTop) continue;
			if (shape instanceof Quad quad) {
				for (Vec3 corner : quad.corners) vertex(buffer, corner, cam, quad.color);
			} else if (shape instanceof Point point) {
				// A square facing the camera that keeps its size on screen.
				double half = point.size * POINT_SCALE * Math.max(1, point.pos.distanceTo(cam));
				Vec3 l = new Vec3(left.x(), left.y(), left.z()).scale(half), u = new Vec3(up.x(), up.y(), up.z()).scale(half);
				vertex(buffer, point.pos.add(l).add(u), cam, point.color);
				vertex(buffer, point.pos.add(l).subtract(u), cam, point.color);
				vertex(buffer, point.pos.subtract(l).subtract(u), cam, point.color);
				vertex(buffer, point.pos.subtract(l).add(u), cam, point.color);
			}
		}
		draw(buffer);
	}

	private static void lines(List<Shape> shapes, boolean onTop, Vec3 cam) {
		TreeSet<Float> widths = new TreeSet<>();
		for (Shape shape : shapes) if (shape.onTop == onTop && shape instanceof Line line) widths.add(line.width);
		RenderSystem.setShader(GameRenderer::getRendertypeLinesShader);
		for (float width : widths) {
			RenderSystem.lineWidth(width);
			BufferBuilder buffer = Tesselator.getInstance().getBuilder();
			buffer.begin(VertexFormat.Mode.LINES, DefaultVertexFormat.POSITION_COLOR_NORMAL);
			for (Shape shape : shapes) {
				if (shape.onTop != onTop || !(shape instanceof Line line) || line.width != width) continue;
				Vec3 span = line.b.subtract(line.a);
				double length = span.length();
				if (length < 1e-6) continue;
				Vec3 n = span.scale(1 / length);
				int pieces = (int) Math.ceil(length / MAX_SEGMENT);
				for (int i = 0; i < pieces; i++) {
					Vec3 from = line.a.add(span.scale((double) i / pieces)), to = line.a.add(span.scale((double) (i + 1) / pieces));
					buffer.vertex(from.x - cam.x, from.y - cam.y, from.z - cam.z).color(line.color)
						.normal((float) n.x, (float) n.y, (float) n.z).endVertex();
					buffer.vertex(to.x - cam.x, to.y - cam.y, to.z - cam.z).color(line.color)
						.normal((float) n.x, (float) n.y, (float) n.z).endVertex();
				}
			}
			draw(buffer);
		}
	}

	private static void texts(List<Shape> shapes, boolean onTop, Vec3 cam, Camera camera) {
		Minecraft mc = Minecraft.getInstance();
		Font font = mc.font;
		MultiBufferSource.BufferSource buffers = mc.renderBuffers().bufferSource();
		boolean any = false;
		for (Shape shape : shapes) {
			if (shape.onTop != onTop || !(shape instanceof Text text)) continue;
			PoseStack pose = new PoseStack();
			pose.translate(text.pos.x - cam.x, text.pos.y - cam.y, text.pos.z - cam.z);
			pose.mulPose(camera.rotation());
			float scale = TEXT_SCALE * text.style.scale();
			// Before 1.21 the camera rotation faces the other way.
			pose.scale(-scale, -scale, scale);
			font.drawInBatch(text.text, -font.width(text.text) / 2f, 0, text.style.color(), false, pose.last().pose(), buffers,
				onTop ? Font.DisplayMode.SEE_THROUGH : Font.DisplayMode.NORMAL, 0x60000000, 0xF000F0);
			any = true;
		}
		if (any) buffers.endBatch();
	}
}
