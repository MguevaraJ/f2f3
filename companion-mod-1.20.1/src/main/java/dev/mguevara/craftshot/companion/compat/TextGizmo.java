package dev.mguevara.craftshot.companion.compat;

public final class TextGizmo {
	private TextGizmo() {}

	public record Style(int color, float scale) {
		public static Style forColorAndCentered(int color) {
			return new Style(color, 1f);
		}

		public Style withScale(float scale) {
			return new Style(color, scale);
		}
	}
}
