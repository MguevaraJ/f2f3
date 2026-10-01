package dev.mguevara.craftshot.companion;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Vec3i;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;

/**
 * The box saved as the build: computed the same way on the client (for the preview) and
 * on the server (when builds are saved on every F2 without a preview).
 */
public record BuildRegion(BlockPos origin, Vec3i size, int blocks) {
	/** How far up a corner box looks for blocks. */
	private static final int MAX_HEIGHT = 97;

	/**
	 * A box with the target at its bottom corner nearest to the player, on their right:
	 * exactly `side` blocks away from the player (`facing`) and `side` to their left, so it
	 * grows evenly as the size changes. Only the height adapts, up to the highest block
	 * inside. Like framing a picture, the build can be selected from outside.
	 */
	public static BuildRegion corner(Level level, BlockPos target, int side, Direction facing) {
		int n = side - 1;
		BlockPos far = target.relative(facing, n).relative(facing.getCounterClockWise(), n);
		int minX = Math.min(target.getX(), far.getX()), maxX = Math.max(target.getX(), far.getX());
		int minZ = Math.min(target.getZ(), far.getZ()), maxZ = Math.max(target.getZ(), far.getZ());
		int y0 = Math.max(level.getMinY(), target.getY());
		int yMax = Math.min(level.getMaxY(), target.getY() + MAX_HEIGHT - 1);
		if (y0 > yMax) return null;

		int top = y0;
		int blocks = 0;
		for (BlockPos p : BlockPos.betweenClosed(minX, y0, minZ, maxX, yMax, maxZ)) {
			if (level.getBlockState(p).isAir()) continue;
			blocks++;
			top = Math.max(top, p.getY());
		}
		return new BuildRegion(new BlockPos(minX, y0, minZ), new Vec3i(maxX - minX + 1, top - y0 + 1, maxZ - minZ + 1), blocks);
	}

	/** A cube of `side` blocks centred on the target. */
	public static BuildRegion centred(Level level, BlockPos target, int side) {
		int r = side / 2;
		return trimmed(level, target.offset(-r, -r, -r), target.offset(r, r, r));
	}

	/** The box between two corners, clipped to the world's height and trimmed to non-air blocks; null when empty. */
	private static BuildRegion trimmed(Level level, BlockPos a, BlockPos b) {
		BlockPos from = new BlockPos(Math.min(a.getX(), b.getX()), Math.max(level.getMinY(), Math.min(a.getY(), b.getY())), Math.min(a.getZ(), b.getZ()));
		BlockPos to = new BlockPos(Math.max(a.getX(), b.getX()), Math.min(level.getMaxY(), Math.max(a.getY(), b.getY())), Math.max(a.getZ(), b.getZ()));
		if (from.getY() > to.getY()) return null;

		int minX = Integer.MAX_VALUE, minY = Integer.MAX_VALUE, minZ = Integer.MAX_VALUE;
		int maxX = Integer.MIN_VALUE, maxY = Integer.MIN_VALUE, maxZ = Integer.MIN_VALUE;
		int blocks = 0;
		for (BlockPos p : BlockPos.betweenClosed(from, to)) {
			if (level.getBlockState(p).isAir()) continue;
			blocks++;
			minX = Math.min(minX, p.getX()); maxX = Math.max(maxX, p.getX());
			minY = Math.min(minY, p.getY()); maxY = Math.max(maxY, p.getY());
			minZ = Math.min(minZ, p.getZ()); maxZ = Math.max(maxZ, p.getZ());
		}
		if (blocks == 0) return null;
		return new BuildRegion(
			new BlockPos(minX, minY, minZ),
			new Vec3i(maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1),
			blocks
		);
	}

	/** Non-air blocks inside the box, counted on the level that saves it. */
	public int countBlocks(Level level) {
		int n = 0;
		for (BlockPos p : BlockPos.betweenClosed(origin, origin.offset(size).offset(-1, -1, -1))) {
			if (!level.getBlockState(p).isAir()) n++;
		}
		return n;
	}

	public AABB aabb() {
		return new AABB(
			origin.getX(), origin.getY(), origin.getZ(),
			origin.getX() + size.getX(), origin.getY() + size.getY(), origin.getZ() + size.getZ()
		);
	}

	public String sizeText() {
		return size.getX() + "×" + size.getY() + "×" + size.getZ();
	}
}
