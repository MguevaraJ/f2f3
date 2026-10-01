package dev.mguevara.craftshot.companion.compat;

import org.lwjgl.glfw.GLFW;

/** A key press, as newer versions of the game hand it to screens. */
public record KeyEvent(int key, int scancode, int modifiers) {
	public boolean isEscape() {
		return key == GLFW.GLFW_KEY_ESCAPE;
	}

	public boolean isConfirmation() {
		return key == GLFW.GLFW_KEY_ENTER || key == GLFW.GLFW_KEY_KP_ENTER;
	}
}
