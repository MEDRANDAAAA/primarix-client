package com.rpgclient.cooldown;

import net.minecraft.client.gui.GuiButton;
import net.minecraft.client.gui.GuiScreen;
import net.minecraft.client.gui.ScaledResolution;

import java.io.IOException;

public class GuiHudLayoutEditor extends GuiScreen {
    private int cooldownLeft;
    private int cooldownTop;
    private int armorLeft;
    private int armorTop;
    private int opacity;
    private int dragOffsetX;
    private int dragOffsetY;
    private int draggingPanel;

    @Override
    public void initGui() {
        ScaledResolution resolution = new ScaledResolution(mc);
        cooldownLeft = GuiCooldownInventory.getCooldownLeft(resolution);
        cooldownTop = GuiCooldownInventory.getCooldownTop(resolution);
        armorLeft = GuiCooldownInventory.getArmorLeft(resolution);
        armorTop = GuiCooldownInventory.getArmorTop(resolution);
        opacity = GuiCooldownInventory.getHudOpacity();
        buttonList.clear();
        buttonList.add(new GuiButton(1, width / 2 - 105, height - 28, 100, 20, "Aceptar"));
        buttonList.add(new GuiButton(2, width / 2 + 5, height - 28, 100, 20, "Cancelar"));
        buttonList.add(new GuiButton(3, 10, height - 28, 90, 20, "Opacidad -"));
        buttonList.add(new GuiButton(4, 105, height - 28, 90, 20, "Opacidad +"));
    }

    @Override
    public void drawScreen(int mouseX, int mouseY, float partialTicks) {
        drawDefaultBackground();
        drawString(fontRendererObj, "Mueve las interfaces y acepta para guardar", 10, 10, 0xFFFFFF);
        drawString(fontRendererObj, "Opacidad: " + opacity + "%", 10, 24, 0xCCCCCC);
        drawPanel(cooldownLeft, cooldownTop, GuiCooldownInventory.getCooldownPanelWidth(),
                GuiCooldownInventory.getCooldownPanelHeight(), "Recargas", 0xB028A850);
        drawPanel(armorLeft, armorTop, GuiCooldownInventory.getArmorPanelWidth(),
                GuiCooldownInventory.getArmorPanelHeight(), "Armadura", 0xB05070A0);
        super.drawScreen(mouseX, mouseY, partialTicks);
    }

    private void drawPanel(int left, int top, int panelWidth, int panelHeight,
            String title, int color) {
        drawRect(left, top, left + panelWidth, top + panelHeight, color);
        drawRect(left, top, left + panelWidth, top + 20, 0xD0181818);
        drawString(fontRendererObj, title, left + 5, top + 6, 0xFFFFFF);
    }

    @Override
    protected void actionPerformed(GuiButton button) {
        if (button.id == 1) {
                GuiCooldownInventory.setPanelPositions(cooldownLeft, cooldownTop,
                    armorLeft, armorTop, opacity);
            mc.displayGuiScreen(null);
        } else if (button.id == 2) {
            mc.displayGuiScreen(null);
        } else if (button.id == 3) {
            opacity = Math.max(20, opacity - 10);
        } else if (button.id == 4) {
            opacity = Math.min(100, opacity + 10);
        }
    }

    @Override
    protected void mouseClicked(int mouseX, int mouseY, int mouseButton) throws IOException {
        if (mouseButton == 0) {
            if (inside(mouseX, mouseY, cooldownLeft, cooldownTop,
                    GuiCooldownInventory.getCooldownPanelWidth(),
                    GuiCooldownInventory.getCooldownPanelHeight())) {
                draggingPanel = 1;
                dragOffsetX = mouseX - cooldownLeft;
                dragOffsetY = mouseY - cooldownTop;
            } else if (inside(mouseX, mouseY, armorLeft, armorTop,
                    GuiCooldownInventory.getArmorPanelWidth(),
                    GuiCooldownInventory.getArmorPanelHeight())) {
                draggingPanel = 2;
                dragOffsetX = mouseX - armorLeft;
                dragOffsetY = mouseY - armorTop;
            }
        }
        super.mouseClicked(mouseX, mouseY, mouseButton);
    }

    @Override
    protected void mouseClickMove(int mouseX, int mouseY, int clickedMouseButton,
            long timeSinceLastClick) {
        if (clickedMouseButton != 0) {
            return;
        }
        if (draggingPanel == 1) {
            cooldownLeft = clamp(mouseX - dragOffsetX,
                    0, Math.max(0, width - GuiCooldownInventory.getCooldownPanelWidth()));
            cooldownTop = clamp(mouseY - dragOffsetY,
                    0, Math.max(0, height - GuiCooldownInventory.getCooldownPanelHeight()));
        } else if (draggingPanel == 2) {
            armorLeft = clamp(mouseX - dragOffsetX,
                    0, Math.max(0, width - GuiCooldownInventory.getArmorPanelWidth()));
            armorTop = clamp(mouseY - dragOffsetY,
                    0, Math.max(0, height - GuiCooldownInventory.getArmorPanelHeight()));
        }
    }

    private int clamp(int value, int minimum, int maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }

    @Override
    protected void mouseReleased(int mouseX, int mouseY, int state) {
        if (state == 0) {
            draggingPanel = 0;
        }
    }

    @Override
    public void handleMouseInput() throws IOException {
        super.handleMouseInput();
        int wheel = org.lwjgl.input.Mouse.getEventDWheel();
        if (wheel != 0) {
            opacity = Math.max(20, Math.min(100, opacity + (wheel > 0 ? 5 : -5)));
        }
    }

    private boolean inside(int mouseX, int mouseY, int left, int top,
            int panelWidth, int panelHeight) {
        return mouseX >= left && mouseX <= left + panelWidth
                && mouseY >= top && mouseY <= top + panelHeight;
    }
}
