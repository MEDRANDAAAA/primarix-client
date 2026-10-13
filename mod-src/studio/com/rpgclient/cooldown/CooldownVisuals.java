package com.rpgclient.cooldown;

public final class CooldownVisuals {
    public static final int TOOL_COLOR = 0xB0E05AC8;
    public static final int HEAL_COLOR = 0xB05AC8F0;
    public static final int ABSORPTION_COLOR = 0xB020B040;

    private CooldownVisuals() {
    }

    public static int registeredItemColor(boolean isTool, boolean hasCooldown,
            boolean isAbsorption, boolean isHeal, boolean onCooldown,
            int emptyColor, int readyColor, int cooldownColor) {
        if (isTool) return TOOL_COLOR;
        if (!hasCooldown) return emptyColor;
        if (onCooldown) return cooldownColor;
        if (isHeal) return HEAL_COLOR;
        if (isAbsorption) return ABSORPTION_COLOR;
        return readyColor;
    }

    public static int slotColor(boolean onCooldown, boolean isHeal) {
        if (onCooldown) return 0xFFFF5151;
        return isHeal ? 0xFF5AC8F0 : 0xFF35D06F;
    }
}
