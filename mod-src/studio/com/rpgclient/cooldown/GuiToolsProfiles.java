package com.rpgclient.cooldown;

import net.minecraft.client.gui.GuiButton;
import net.minecraft.client.gui.GuiScreen;

import java.util.List;

public class GuiToolsProfiles extends GuiScreen {
    private List<String> profiles;

    @Override
    public void initGui() {
        profiles = ToolsManager.getProfileNames();
        buttonList.clear();
        for (int index = 0; index < profiles.size(); index++) {
            int y = 35 + index * 28;
            buttonList.add(new GuiButton(100 + index, width / 2 - 290, y, 72, 20, "Usar"));
            buttonList.add(new GuiButton(200 + index, width / 2 - 212, y, 72, 20, "Editar"));
            buttonList.add(new GuiButton(300 + index, width / 2 - 134, y, 72, 20, "Borrar"));
        }
        buttonList.add(new GuiButton(1, width / 2 - 100,
                height - 30, 200, 20, "Cerrar"));
    }

    @Override
    public void drawScreen(int mouseX, int mouseY, float partialTicks) {
        drawDefaultBackground();
        drawCenteredString(fontRendererObj, "Intercambio Rapido de Herramientas",
                width / 2, 12, 0xFFFFFF);
        for (int index = 0; index < profiles.size(); index++) {
            ToolsProfile profile = ToolsManager.getProfile(profiles.get(index));
            String key = profile.getToggleKey() == 0 ? "Sin tecla"
                : org.lwjgl.input.Keyboard.getKeyName(profile.getToggleKey());
            drawString(fontRendererObj,
            fontRendererObj.trimStringToWidth(profile.getName(), 102), width / 2 - 52,
            41 + index * 28, 0xFFFFFF);
            drawString(fontRendererObj, "Tecla: " + key, width / 2 + 55,
                41 + index * 28, 0xBBBBBB);
        }
        drawCenteredString(fontRendererObj, ToolsManager.isEnabled()
                ? "Activo" : "Desactivado", width / 2, height - 48,
                ToolsManager.isEnabled() ? 0xFF55DD66 : 0xFFFF6666);
        super.drawScreen(mouseX, mouseY, partialTicks);
    }

    @Override
    protected void actionPerformed(GuiButton button) {
        if (button.id == 1) {
            mc.displayGuiScreen(null);
        } else if (button.id >= 100 && button.id < 200) {
            int index = button.id - 100;
            if (index < profiles.size()) {
                ToolsManager.use(profiles.get(index));
            }
        } else if (button.id >= 200 && button.id < 300) {
            int index = button.id - 200;
            if (index < profiles.size()) mc.displayGuiScreen(new GuiToolsEditor(profiles.get(index)));
        } else if (button.id >= 300 && button.id < 400) {
            int index = button.id - 300;
            if (index < profiles.size()) {
                ToolsManager.delete(profiles.get(index));
                initGui();
            }
        }
    }
}