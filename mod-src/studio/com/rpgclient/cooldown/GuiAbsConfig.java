package com.rpgclient.cooldown;

import net.minecraft.client.gui.GuiButton;
import net.minecraft.client.gui.GuiScreen;
import net.minecraft.client.gui.GuiTextField;
import net.minecraft.util.ChatComponentText;
import org.lwjgl.input.Keyboard;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public class GuiAbsConfig extends GuiScreen {
    private GuiTextField hotbarField;
    private GuiTextField inventoryField;
    private int left;
    private int top;
    private boolean allInventory;
    private boolean capturingKey;
    private boolean isHealMode;

    @Override
    public void initGui() {
        String currentHotbarText = hotbarField == null ? null : hotbarField.getText();
        String currentInventoryText = inventoryField == null ? null : inventoryField.getText();
        left = (width - 470) / 2;
        top = (height - 285) / 2;
        allInventory = AbsorptionManager.isAllInventorySelected();
        hotbarField = new GuiTextField(1, fontRendererObj, left + 175, top + 42, 270, 20);
        hotbarField.setMaxStringLength(80);
        hotbarField.setText(currentHotbarText == null
            ? formatSlots(AbsorptionManager.getHotbarSlots()) : currentHotbarText);
        inventoryField = new GuiTextField(2, fontRendererObj, left + 175, top + 111, 270, 20);
        inventoryField.setMaxStringLength(120);
        inventoryField.setText(currentInventoryText == null
            ? formatSlots(AbsorptionManager.getInventorySlots()) : currentInventoryText);

        buttonList.clear();
        buttonList.add(new GuiButton(1, left + 175, top + 78, 160, 20,
                allInventory ? "Inventario: todo" : "Inventario: manual"));
        buttonList.add(new GuiButton(2, left + 175, top + 151, 160, 20,
                capturingKey ? "Pulsa una tecla..." : "Tecla: " + keyName()));
        buttonList.add(new GuiButton(6, left + 25, top + 20, 120, 20,
                isHealMode ? "Modo: Curación" : "Modo: Abs"));
        buttonList.add(new GuiButton(3, left + 25, top + 235, 120, 20, "Guardar"));
        buttonList.add(new GuiButton(4, left + 155, top + 235, 150, 20,
                AbsorptionManager.isEnabled() ? "Desactivar" : "Activar"));
        buttonList.add(new GuiButton(5, left + 315, top + 235, 120, 20, "Volver"));
    }

    @Override
    public void drawScreen(int mouseX, int mouseY, float partialTicks) {
        drawDefaultBackground();
        drawRect(left, top, left + 470, top + 285, 0xE8101018);
        drawRect(left, top, left + 470, top + 2, 0xFF4CC9FF);
        drawCenteredString(fontRendererObj, "Abs - " + CooldownManager.getActiveInstanceName(),
                width / 2, top + 14, 0xFFFFFF);
        drawString(fontRendererObj, "Barra rápida (1-9):", left + 20, top + 48, 0xFFCCCCCC);
        drawString(fontRendererObj, "Ejemplo: 1.2.5", left + 175, top + 65, 0xFF888888);
        drawString(fontRendererObj, "Fuentes del inventario principal (slots 1-27):",
                left + 20, top + 91, 0xFFCCCCCC);
        if (allInventory) {
            drawString(fontRendererObj, "Busca en 27 casillas; excluye barra rápida.",
                    left + 175, top + 111, 0xFF888888);
        } else {
            drawString(fontRendererObj, "Ejemplo: 1.5.6.7.12", left + 175, top + 134, 0xFF888888);
        }
        drawString(fontRendererObj, "Activacion por tecla opcional:", left + 20, top + 157,
                0xFFCCCCCC);
        drawString(fontRendererObj, "Un swap por tick; solo usa items Abs listos.",
                left + 20, top + 196, 0xFFAAAAAA);
        if (!allInventory) inventoryField.drawTextBox();
        hotbarField.drawTextBox();
        super.drawScreen(mouseX, mouseY, partialTicks);
    }

    @Override
    protected void actionPerformed(GuiButton button) {
        if (button.id == 6) {
            isHealMode = !isHealMode;
            initGui();
        } else if (button.id == 1) {
            allInventory = !allInventory;
            AbsorptionManager.setAllInventorySelected(allInventory);
            initGui();
        } else if (button.id == 2) {
            capturingKey = true;
            initGui();
            buttonList.get(1).displayString = "Pulsa una tecla...";
        } else if (button.id == 3) {
            saveConfiguration();
        } else if (button.id == 4) {
            String error = AbsorptionManager.setEnabled(!AbsorptionManager.isEnabled());
            if (error != null) {
                showMessage(error);
            } else {
                initGui();
            }
        } else if (button.id == 5) {
            mc.displayGuiScreen(new GuiCooldownMenu());
        }
    }

    private void saveConfiguration() {
        List<Integer> hotbarSlots = parseSlots(hotbarField.getText());
        List<Integer> inventorySlots = parseSlots(inventoryField.getText());
        if (hotbarSlots == null || inventorySlots == null) {
            showMessage("Escribe slots separados por puntos, comas o espacios.");
            return;
        }
        String error = AbsorptionManager.saveConfiguration(
                hotbarSlots, allInventory, inventorySlots);
        if (error != null) {
            showMessage(error);
            return;
        }
        showMessage("Configuracion Abs guardada para "
                + CooldownManager.getActiveInstanceName() + ".");
        initGui();
    }

    private List<Integer> parseSlots(String value) {
        List<Integer> slots = new ArrayList<Integer>();
        if (value.trim().isEmpty()) return slots;
        for (String part : value.trim().split("[.,;\\s]+")) {
            try {
                int slot = Integer.parseInt(part);
                if (slots.contains(slot)) return null;
                slots.add(slot);
            } catch (NumberFormatException exception) {
                return null;
            }
        }
        return slots;
    }

    private String formatSlots(List<Integer> slots) {
        StringBuilder value = new StringBuilder();
        for (Integer slot : slots) {
            if (value.length() > 0) value.append('.');
            value.append(slot);
        }
        return value.toString();
    }

    private String keyName() {
        int key = AbsorptionManager.getToggleKey();
        String name = key <= 0 ? null : Keyboard.getKeyName(key);
        return name == null ? "Sin asignar" : name;
    }

    private void showMessage(String message) {
        if (mc.thePlayer != null) {
            mc.thePlayer.addChatMessage(new ChatComponentText("[AnnthModCD] " + message));
        }
    }

    @Override
    protected void keyTyped(char typedChar, int keyCode) throws IOException {
        if (capturingKey) {
            capturingKey = false;
            if (keyCode != Keyboard.KEY_ESCAPE) AbsorptionManager.setToggleKey(keyCode);
            initGui();
            return;
        }
        hotbarField.textboxKeyTyped(typedChar, keyCode);
        if (!allInventory) inventoryField.textboxKeyTyped(typedChar, keyCode);
        super.keyTyped(typedChar, keyCode);
    }

    @Override
    protected void mouseClicked(int mouseX, int mouseY, int mouseButton) throws IOException {
        hotbarField.mouseClicked(mouseX, mouseY, mouseButton);
        if (!allInventory) inventoryField.mouseClicked(mouseX, mouseY, mouseButton);
        super.mouseClicked(mouseX, mouseY, mouseButton);
    }
}