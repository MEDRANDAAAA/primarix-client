package com.rpgclient.cooldown;

public final class HudBounds {
    private HudBounds() {
    }

    public static int clampPosition(int position, int viewportSize, int panelSize) {
        return Math.max(0, Math.min(position, Math.max(0, viewportSize - panelSize)));
    }

    public static boolean containsSlot(int panelWidth, int panelHeight,
            int slotLeft, int slotTop, int slotSize) {
        return slotLeft >= 0 && slotTop >= 0 && slotSize > 0
                && slotLeft + slotSize <= panelWidth
                && slotTop + slotSize <= panelHeight;
    }
}
