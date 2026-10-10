package com.rpgclient.cooldown;

import net.minecraft.client.gui.GuiButton;
import net.minecraft.client.gui.GuiScreen;
import net.minecraft.client.gui.GuiTextField;
import net.minecraft.client.renderer.GlStateManager;
import net.minecraft.client.renderer.RenderHelper;

import java.io.IOException;

public class GuiToolsEditor extends GuiScreen {
    private final String profileName;
    private boolean waitingForKey;
    private GuiTextField[] delayFields;

    public GuiToolsEditor(String profileName) {
        this.profileName = profileName;
    }

    @Override
    public void initGui() {
        buttonList.clear();
        buttonList.add(new GuiButton(1, width / 2 - 150, height - 28, 90, 20, "Volver"));
        buttonList.add(new GuiButton(2, width / 2 - 50, height - 28, 100, 20, "Agregar mano"));
        buttonList.add(new GuiButton(3, width / 2 + 60, height - 28, 90, 20, "Grabar tecla"));
        ToolsProfile profile = ToolsManager.getProfile(profileName);
        delayFields = profile == null ? new GuiTextField[0]
            : new GuiTextField[profile.getItems().size()];
        if (profile != null) {
            for (int index = 0; index < profile.getItems().size(); index++) {
            GuiTextField delayField = new GuiTextField(500 + index, fontRendererObj,
                width / 2 - 5, 45 + index * 28, 42, 20);
            delayField.setMaxStringLength(5);
                delayField.setText(String.valueOf(profile.getItemDelayMs(index, 1000)));
            delayFields[index] = delayField;
                buttonList.add(new GuiButton(100 + index, width / 2 + 40,
                        45 + index * 28, 80, 20, "Borrar"));
            }
        }
    }

    @Override
    public void drawScreen(int mouseX, int mouseY, float partialTicks) {
        drawDefaultBackground();
        ToolsProfile profile = ToolsManager.getProfile(profileName);
        drawCenteredString(fontRendererObj, "Editar: " + profileName, width / 2, 15, 0xFFFFFF);
        if (profile != null) {
            for (int index = 0; index < profile.getItems().size(); index++) {
                int y = 45 + index * 28;
                net.minecraft.item.ItemStack item = profile.getItems().get(index);
                String itemId = ToolsManager.getItemId(item);
                drawString(fontRendererObj, itemId == null ? "item" : itemId,
                        width / 2 - 150, y + 5, 0xFFFFFF);
                if (item != null) {
                    RenderHelper.enableGUIStandardItemLighting();
                    mc.getRenderItem().renderItemIntoGUI(item, width / 2 - 175, y);
                    RenderHelper.disableStandardItemLighting();
                    GlStateManager.enableAlpha();
                }
                drawString(fontRendererObj, "ms", width / 2 + 38, y + 6, 0xFFCCCCCC);
            }
            String key = profile.getToggleKey() == 0 ? "Sin tecla"
                    : org.lwjgl.input.Keyboard.getKeyName(profile.getToggleKey());
            drawString(fontRendererObj, waitingForKey ? "Pulsa una tecla..." : "Tecla: " + key,
                    width / 2 - 150, height - 48, 0xFFDDDD55);
        }
        for (GuiTextField delayField : delayFields) delayField.drawTextBox();
        super.drawScreen(mouseX, mouseY, partialTicks);
    }

    @Override
    protected void actionPerformed(GuiButton button) {
        ToolsProfile profile = ToolsManager.getProfile(profileName);
        if (button.id == 1) {
            saveDelayFields();
            mc.displayGuiScreen(new GuiToolsProfiles());
        } else if (button.id == 2) {
            saveDelayFields();
            ToolsManager.addHeldItem(profileName);
            initGui();
        } else if (button.id == 3) {
            waitingForKey = true;
        } else if (button.id >= 100 && profile != null) {
            saveDelayFields();
            profile.removeItem(button.id - 100);
            ToolsManager.save();
            initGui();
        }
    }

    @Override
    protected void keyTyped(char typedChar, int keyCode) throws IOException {
        if (waitingForKey) {
            waitingForKey = false;
            ToolsManager.setProfileKey(profileName, keyCode);
            return;
        }
        for (GuiTextField delayField : delayFields) {
            if (delayField.textboxKeyTyped(typedChar, keyCode)) return;
        }
        super.keyTyped(typedChar, keyCode);
    }

    @Override
    protected void mouseClicked(int mouseX, int mouseY, int mouseButton) throws IOException {
        for (GuiTextField delayField : delayFields) {
            delayField.mouseClicked(mouseX, mouseY, mouseButton);
        }
        super.mouseClicked(mouseX, mouseY, mouseButton);
    }

    private void saveDelayFields() {
        ToolsProfile profile = ToolsManager.getProfile(profileName);
        if (profile == null) return;
        for (int index = 0; index < delayFields.length; index++) {
            try {
                int delayMs = Integer.parseInt(delayFields[index].getText());
                ToolsManager.setItemDelayMs(profileName, index, delayMs);
            } catch (NumberFormatException ignored) { }
        }
    }
}