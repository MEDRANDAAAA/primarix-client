package com.rpgclient.cooldown;

import net.minecraft.client.gui.GuiButton;
import net.minecraft.client.gui.GuiScreen;

import java.io.IOException;

public class GuiRMenu extends GuiScreen {
    private int panelLeft;
    private int panelTop;
    private int selectedTab;

    @Override
    public void initGui() {
        panelLeft = (width - 340) / 2;
        panelTop = (height - 280) / 2;
        selectedTab = 0;
        buttonList.clear();
        buttonList.add(new GuiButton(1, panelLeft + 10, panelTop + 30, 100, 20, "Recargas"));
        buttonList.add(new GuiButton(2, panelLeft + 120, panelTop + 30, 100, 20, "Abs/Curación"));
        buttonList.add(new GuiButton(3, panelLeft + 230, panelTop + 30, 100, 20, "Herramientas"));
        buttonList.add(new GuiButton(6, panelLeft + 10, panelTop + 60, 100, 20, "AutoH"));
        buttonList.add(new GuiButton(4, panelLeft + 10, panelTop + 240, 150, 20, "Instancias"));
        buttonList.add(new GuiButton(5, panelLeft + 170, panelTop + 240, 150, 20, "Cerrar"));
    }

    @Override
    public void drawScreen(int mouseX, int mouseY, float partialTicks) {
        drawDefaultBackground();
        drawRect(panelLeft, panelTop, panelLeft + 340, panelTop + 280, 0xE8101018);
        drawRect(panelLeft, panelTop, panelLeft + 340, panelTop + 2, 0xFF4CC9FF);
        drawCenteredString(fontRendererObj, "Menú de AnnthModCD", width / 2, panelTop + 12, 0xFFFFFF);

        if (selectedTab == 0) {
            drawCooldownsTab();
        } else if (selectedTab == 1) {
            drawAbsHealTab();
        } else if (selectedTab == 2) {
            drawToolsTab();
        }

        super.drawScreen(mouseX, mouseY, partialTicks);
    }

    private void drawCooldownsTab() {
        drawCenteredString(fontRendererObj, "Instancia: " + CooldownManager.getActiveInstanceName(),
                width / 2, panelTop + 60, 0xFFB8B8B8);
        drawCenteredString(fontRendererObj, "Objetos registrados: " + CooldownManager.getEntries().size(),
                width / 2, panelTop + 80, 0xFFB8B8B8);
        drawCenteredString(fontRendererObj, "Abre Recargas para administrar tus objetos",
                width / 2, panelTop + 120, 0xFFAAAAAA);
    }

    private void drawAbsHealTab() {
        drawCenteredString(fontRendererObj, "Abs: "
                        + (AbsorptionManager.isEnabled() ? "ACTIVADO" : "DESACTIVADO"),
                width / 2, panelTop + 60, AbsorptionManager.isEnabled() ? 0xFF55DD66 : 0xFFFF6666);
        drawCenteredString(fontRendererObj, "Configuración de Abs y curación",
                width / 2, panelTop + 80, 0xFFB8B8B8);
        drawCenteredString(fontRendererObj, "Abre Abs/Curación para configurar",
                width / 2, panelTop + 120, 0xFFAAAAAA);
    }

    private void drawToolsTab() {
        drawCenteredString(fontRendererObj, "Herramientas: "
                        + (ToolsManager.isEnabled() ? "ACTIVADAS" : "DESACTIVADAS"),
                width / 2, panelTop + 60, ToolsManager.isEnabled() ? 0xFF55DD66 : 0xFFFF6666);
        drawCenteredString(fontRendererObj, "Perfiles: " + ToolsManager.getProfileNames().size(),
                width / 2, panelTop + 80, 0xFFB8B8B8);
        drawCenteredString(fontRendererObj, "Abre Herramientas para gestionar perfiles",
                width / 2, panelTop + 120, 0xFFAAAAAA);
    }

    private void drawAutoHTab() {
        drawCenteredString(fontRendererObj, "AutoH: "
                        + (HealManager.isRunning() ? "ACTIVO" : "DESACTIVADO"),
                width / 2, panelTop + 60, HealManager.isRunning() ? 0xFF55DD66 : 0xFFFF6666);
        drawCenteredString(fontRendererObj, "Perfiles: " + HealManager.getProfiles().size(),
                width / 2, panelTop + 80, 0xFFB8B8B8);
        drawCenteredString(fontRendererObj, "Abre AutoH para gestionar sus perfiles",
                width / 2, panelTop + 120, 0xFFAAAAAA);
    }

    @Override
    protected void actionPerformed(GuiButton button) {
        if (button.id == 1) {
            mc.displayGuiScreen(new GuiCooldownMenu());
        } else if (button.id == 2) {
            mc.displayGuiScreen(new GuiAbsConfig());
        } else if (button.id == 3) {
            mc.displayGuiScreen(new GuiToolsProfiles());
        } else if (button.id == 6) {
            mc.displayGuiScreen(new GuiHealList());
        } else if (button.id == 4) {
            mc.displayGuiScreen(new GuiInstanceList());
        } else if (button.id == 5) {
            mc.displayGuiScreen(null);
        }
    }
}
