package com.rpgclient.cooldown;

import net.minecraft.client.gui.GuiButton;
import net.minecraft.client.gui.GuiScreen;

import java.util.List;

public class GuiHealList extends GuiScreen {
    private List<HealProfile> profiles;
    private int left;
    private int top;

    @Override
    public void initGui() {
        profiles = HealManager.getProfiles();
        left = (width - 440) / 2;
        top = (height - Math.min(300, 80 + profiles.size() * 28)) / 2;
        buttonList.clear();
        for (int index = 0; index < profiles.size(); index++) {
            int y = top + 38 + index * 28;
            buttonList.add(new GuiButton(1000 + index, left + 225, y, 65, 20, "Editar"));
            buttonList.add(new GuiButton(2000 + index, left + 295, y, 65, 20, "Eliminar"));
        }
        buttonList.add(new GuiButton(1, left + 15, top + 38, 95, 20, "Agregar"));
        buttonList.add(new GuiButton(2, left + 365, top + 38, 60, 20, "Volver"));
    }

    @Override
    public void drawScreen(int mouseX, int mouseY, float partialTicks) {
        drawDefaultBackground();
        int panelHeight = Math.max(80, 80 + profiles.size() * 28);
        drawRect(left, top, left + 440, top + panelHeight, 0xE8101018);
        drawRect(left, top, left + 440, top + 2, 0xFFFFA000);
        drawCenteredString(fontRendererObj, "AutoH - perfiles", width / 2, top + 12, 0xFFFFFF);
        for (int index = 0; index < profiles.size(); index++) {
            HealProfile profile = profiles.get(index);
            drawString(fontRendererObj, profile.getName(), left + 15, top + 44 + index * 28, 0xFFFFFFFF);
                drawString(fontRendererObj, "Tecla: " + keyName(profile.getTriggerKey())
                    + " | Items: " + profile.getSlots().toString(),
                    left + 15, top + 55 + index * 28, 0xFFAAAAAA);
        }
        super.drawScreen(mouseX, mouseY, partialTicks);
    }

    private String keyName(int key) {
        String name = org.lwjgl.input.Keyboard.getKeyName(key);
        return name == null ? "Sin asignar" : name;
    }

    @Override
    protected void actionPerformed(GuiButton button) {
        int index;
        if (button.id == 1) {
            mc.displayGuiScreen(new GuiHealEditor(null));
        } else if (button.id == 2) {
            mc.displayGuiScreen(new GuiCooldownMenu());
        } else if (button.id >= 1000 && button.id < 2000) {
            index = button.id - 1000;
            if (index < profiles.size()) mc.displayGuiScreen(new GuiHealEditor(profiles.get(index)));
        } else if (button.id >= 2000 && button.id < 3000) {
            index = button.id - 2000;
            if (index < profiles.size()) { HealManager.remove(profiles.get(index).getName()); initGui(); }
        }
    }
}
