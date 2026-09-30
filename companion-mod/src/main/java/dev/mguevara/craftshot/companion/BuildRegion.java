package dev.mguevara.craftshot.companion;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Vec3i;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;

/**
 * The box saved as the build: computed the same way on the client (for the preview) and
 * on the server (when builds are saved on every F2 without a preview).
 */
public record BuildRegion(BlockPos origin, Vec3i size, int blocks) {
	/**
	 * 2r+1 blocks wide around the target, from its level upwards 2r+1 blocks (or centred on
	 * it), clipped to the world's height and trimmed to the non-air blocks. Null when empty.
	 */
	public static BuildRegion around(Level level, BlockPos target, int r, boolean fromTarget) {
		int y0 = Math.max(level.getMinY(), fromTarget ? target.getY() : target.getY() - r);
		int y1 = Math.min(level.getMaxY(), fromTarget ? target.getY() + 2 * r : target.getY() + r);
		BlockPos from = new BlockPos(target.getX() - r, y0, target.getZ() - r);
		BlockPos to = new BlockPos(target.getX() + r, y1, target.getZ() + r);

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
