package com.rpgclient.cooldown;

import net.minecraft.client.gui.GuiButton;
import net.minecraft.client.gui.GuiScreen;
import net.minecraft.client.gui.GuiTextField;
import net.minecraft.util.ChatComponentText;

import java.io.IOException;

public class GuiInstanceCreate extends GuiScreen {
    private GuiTextField nameField;
    private int panelLeft;
    private int panelTop;

    @Override
    public void initGui() {
        panelLeft = (width - 320) / 2;
        panelTop = (height - 130) / 2;
        nameField = new GuiTextField(1, fontRendererObj, panelLeft + 20,
                panelTop + 52, 280, 20);
        buttonList.add(new GuiButton(1, panelLeft + 45, panelTop + 88, 105, 20, "Crear"));
        buttonList.add(new GuiButton(2, panelLeft + 170, panelTop + 88, 105, 20, "Cancelar"));
    }

    @Override
    public void drawScreen(int mouseX, int mouseY, float partialTicks) {
        drawDefaultBackground();
        drawRect(panelLeft, panelTop, panelLeft + 320, panelTop + 130, 0xE8101018);
        drawCenteredString(fontRendererObj, "Crear una nueva instancia", width / 2,
                panelTop + 15, 0xFFFFFF);
        drawString(fontRendererObj, "Nombre del grupo:", panelLeft + 20, panelTop + 38, 0xCCCCCC);
        nameField.drawTextBox();
        super.drawScreen(mouseX, mouseY, partialTicks);
    }

    @Override
    protected void actionPerformed(GuiButton button) {
        if (button.id == 1) {
            if (CooldownManager.createInstance(nameField.getText())) {
                mc.displayGuiScreen(new GuiInstanceList());
            } else {
                mc.thePlayer.addChatMessage(new ChatComponentText(
                        "[AnnthModCD] Ese nombre esta vacio o ya existe."));
            }
        } else if (button.id == 2) {
            mc.displayGuiScreen(new GuiCooldownMenu());
        }
    }

    @Override
    protected void keyTyped(char typedChar, int keyCode) throws IOException {
        if (!nameField.textboxKeyTyped(typedChar, keyCode)) {
            super.keyTyped(typedChar, keyCode);
        }
    }

    @Override
    protected void mouseClicked(int mouseX, int mouseY, int mouseButton) throws IOException {
        nameField.mouseClicked(mouseX, mouseY, mouseButton);
        super.mouseClicked(mouseX, mouseY, mouseButton);
    }
}
