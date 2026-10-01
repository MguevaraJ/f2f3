package dev.mguevara.craftshot.companion.compat;

/** How a shape is drawn (the name and shape of the class newer versions of the game have). */
public record GizmoStyle(int stroke, float strokeWidth, int fill) {
	public static GizmoStyle stroke(int color, float width) {
		return new GizmoStyle(color, width, 0);
	}

	public static GizmoStyle fill(int color) {
		return new GizmoStyle(0, 0, color);
	}

	public boolean hasFill() {
		return fill != 0;
	}

	public boolean hasStroke() {
		return stroke != 0;
	}
}
