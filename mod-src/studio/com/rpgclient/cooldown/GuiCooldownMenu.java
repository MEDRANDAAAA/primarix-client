package com.rpgclient.cooldown;

import net.minecraft.client.gui.GuiButton;
import net.minecraft.client.gui.GuiScreen;

public class GuiCooldownMenu extends GuiScreen {
    private int panelLeft;
    private int panelTop;

    @Override
    public void initGui() {
        panelLeft = (width - 300) / 2;
        panelTop = (height - 235) / 2;
        buttonList.clear();
        buttonList.add(new GuiButton(1, panelLeft + 50, panelTop + 48, 200, 20,
                "Crear nueva instancia"));
        buttonList.add(new GuiButton(2, panelLeft + 50, panelTop + 75, 200, 20,
                "Lista de instancias"));
        buttonList.add(new GuiButton(3, panelLeft + 50, panelTop + 102, 200, 20,
                "Editor del HUD"));
        buttonList.add(new GuiButton(4, panelLeft + 50, panelTop + 129, 200, 20,
            "AutoH"));
        buttonList.add(new GuiButton(6, panelLeft + 50, panelTop + 156, 200, 20,
            "Abs"));
        buttonList.add(new GuiButton(5, panelLeft + 50, panelTop + 183, 200, 20,
            "Cerrar"));
    }

    @Override
    public void drawScreen(int mouseX, int mouseY, float partialTicks) {
        drawDefaultBackground();
        drawRect(panelLeft, panelTop, panelLeft + 300, panelTop + 230, 0xE8101018);
        drawRect(panelLeft, panelTop, panelLeft + 300, panelTop + 2, 0xFF4CC9FF);
        drawCenteredString(fontRendererObj, "AnnthModCD", width / 2, panelTop + 15, 0xFFFFFF);
        drawCenteredString(fontRendererObj, "Instancia activa: "
                + CooldownManager.getActiveInstanceName(), width / 2, panelTop + 34, 0xFFB8B8B8);
        super.drawScreen(mouseX, mouseY, partialTicks);
    }

    @Override
    protected void actionPerformed(GuiButton button) {
        if (button.id == 1) {
            mc.displayGuiScreen(new GuiInstanceCreate());
        } else if (button.id == 2) {
            mc.displayGuiScreen(new GuiInstanceList());
        } else if (button.id == 3) {
            mc.displayGuiScreen(new GuiHudLayoutEditor());
        } else if (button.id == 4) {
            mc.displayGuiScreen(new GuiHealList());
        } else if (button.id == 5) {
            mc.displayGuiScreen(null);
        } else if (button.id == 6) {
            mc.displayGuiScreen(new GuiAbsConfig());
        }
    }
}
