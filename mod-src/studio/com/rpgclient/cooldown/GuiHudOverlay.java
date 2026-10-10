package com.rpgclient.cooldown;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiScreen;

public class GuiHudOverlay extends GuiScreen {
    @Override
    public void initGui() {
        // No-op
    }

    @Override
    public void drawScreen(int mouseX, int mouseY, float partialTicks) {
        GuiCooldownInventory.renderHudOverlay(Minecraft.getMinecraft());
        super.drawScreen(0, 0, 0);
    }

    @Override
    public boolean doesGuiPauseGame() {
        return false;
    }
}