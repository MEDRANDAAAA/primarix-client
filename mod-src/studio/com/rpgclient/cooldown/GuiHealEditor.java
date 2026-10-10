package com.rpgclient.cooldown;

import net.minecraft.client.gui.GuiButton;
import net.minecraft.client.gui.GuiScreen;
import net.minecraft.client.gui.GuiTextField;
import net.minecraft.util.ChatComponentText;
import org.lwjgl.input.Keyboard;
import org.lwjgl.input.Mouse;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public class GuiHealEditor extends GuiScreen {
    private static final int VISIBLE_SLOTS = 7;
    private final HealProfile existing;
    private HealProfile draft;
    private GuiTextField nameField;
    private GuiTextField slotField;
    private boolean capturingKey;
    private int scrollOffset;
    private int left;
    private int top;

    public GuiHealEditor(HealProfile existing) {
        this.existing = existing;
    }

    @Override
    public void initGui() {
        left = (width - 470) / 2;
        top = (height - 320) / 2;
        draft = new HealProfile(existing == null ? "" : existing.getName());
        if (existing != null) {
            draft.setTriggerKey(existing.getTriggerKey());
            draft.setSlots(new ArrayList<Integer>(existing.getSlots()));
        }
        nameField = new GuiTextField(1, fontRendererObj, left + 120, top + 42, 200, 20);
        slotField = new GuiTextField(2, fontRendererObj, left + 120, top + 225, 55, 20);
        nameField.setText(draft.getName());
        slotField.setText("1");
        rebuildButtons();
    }

    private void rebuildButtons() {
        buttonList.clear();
        int visible = Math.min(VISIBLE_SLOTS, draft.getSlots().size() - scrollOffset);
        for (int index = 0; index < visible; index++) {
            buttonList.add(new GuiButton(1000 + index, left + 330,
                    top + 65 + index * 22, 80, 18, "Quitar"));
        }
        buttonList.add(new GuiButton(1, left + 190, top + 224, 125, 20, "Agregar item"));
        buttonList.add(new GuiButton(2, left + 330, top + 42, 125, 20,
                capturingKey ? "Pulsa tecla..." : "Establecer tecla"));
        buttonList.add(new GuiButton(3, left + 50, top + 275, 105, 20, "Guardar"));
        buttonList.add(new GuiButton(4, left + 165, top + 275, 105, 20, "Cancelar"));
    }

    @Override
    public void drawScreen(int mouseX, int mouseY, float partialTicks) {
        drawDefaultBackground();
        drawRect(left, top, left + 470, top + 320, 0xE8101018);
        drawRect(left, top, left + 470, top + 2, 0xFFFFA000);
        drawCenteredString(fontRendererObj, existing == null ? "Nuevo AutoH" : "Editar AutoH",
                width / 2, top + 14, 0xFFFFFF);
        drawString(fontRendererObj, "Nombre del perfil:", left + 20, top + 48, 0xFFCCCCCC);
        nameField.drawTextBox();
        drawString(fontRendererObj, "Tecla: " + keyName(draft.getTriggerKey()),
                left + 20, top + 78, 0xFFCCCCCC);
        drawString(fontRendererObj, "Objetos en orden de uso", left + 20, top + 105, 0xFFFFA000);
        int visible = Math.min(VISIBLE_SLOTS, draft.getSlots().size() - scrollOffset);
        for (int index = 0; index < visible; index++) {
            int realIndex = scrollOffset + index;
            drawString(fontRendererObj, (realIndex + 1) + ". Casilla del inventario: "
                    + draft.getSlots().get(realIndex), left + 30, top + 125 + index * 22,
                    0xFFFFFFFF);
        }
        if (draft.getSlots().size() > VISIBLE_SLOTS) {
            drawString(fontRendererObj, "Usa la rueda para ver mas items",
                    left + 20, top + 205, 0xFF999999);
        }
        drawString(fontRendererObj, "Casilla: inventario 1-27, barra rápida 28-36:", left + 20, top + 231,
                0xFFCCCCCC);
        slotField.drawTextBox();
        drawString(fontRendererObj, "Puedes agregar hasta 36 items.", left + 20,
                top + 255, 0xFF999999);
        super.drawScreen(mouseX, mouseY, partialTicks);
    }

    private String keyName(int key) {
        String value = Keyboard.getKeyName(key);
        return value == null ? "Sin asignar" : value;
    }

    @Override
    protected void actionPerformed(GuiButton button) {
        if (button.id >= 1000 && button.id < 2000) {
            int index = scrollOffset + button.id - 1000;
            if (index < draft.getSlots().size()) draft.removeSlot(index);
            scrollOffset = Math.min(scrollOffset, maxScrollOffset());
            rebuildButtons();
        } else if (button.id == 1) {
            addSlot();
        } else if (button.id == 2) {
            capturingKey = true;
            rebuildButtons();
        } else if (button.id == 3) {
            save();
        } else if (button.id == 4) {
            mc.displayGuiScreen(new GuiHealList());
        }
    }

    private void addSlot() {
        try {
            int slot = Integer.parseInt(slotField.getText().trim());
            if (!HealManager.isValidSlot(slot) || draft.getSlots().size() >= 36) {
                throw new NumberFormatException();
            }
            draft.addSlot(slot);
            slotField.setText("1");
            rebuildButtons();
        } catch (NumberFormatException exception) {
            mc.thePlayer.addChatMessage(new ChatComponentText(
                    "[AnnthModCD] El slot debe estar entre 1 y 36."));
        }
    }

    private void save() {
        String cleanName = nameField.getText().trim();
        if (cleanName.isEmpty() || draft.getTriggerKey() <= 0 || draft.getSlots().isEmpty()) {
            mc.thePlayer.addChatMessage(new ChatComponentText(
                    "[AnnthModCD] Necesitas nombre, tecla y al menos un item."));
            return;
        }
        if (existing == null) {
            if (!HealManager.add(cleanName)) {
                mc.thePlayer.addChatMessage(new ChatComponentText(
                        "[AnnthModCD] Ese nombre ya existe o esta vacio."));
                return;
            }
            HealProfile profile = HealManager.get(cleanName);
            profile.setTriggerKey(draft.getTriggerKey());
            profile.setSlots(new ArrayList<Integer>(draft.getSlots()));
        } else {
            existing.setTriggerKey(draft.getTriggerKey());
            existing.setSlots(new ArrayList<Integer>(draft.getSlots()));
        }
        HealManager.save();
        mc.displayGuiScreen(new GuiHealList());
    }

    private int maxScrollOffset() {
        return Math.max(0, draft.getSlots().size() - VISIBLE_SLOTS);
    }

    @Override
    public void handleMouseInput() throws IOException {
        super.handleMouseInput();
        int wheel = Mouse.getEventDWheel();
        if (wheel != 0) {
            scrollOffset = Math.max(0, Math.min(maxScrollOffset(),
                    scrollOffset + (wheel > 0 ? -1 : 1)));
            rebuildButtons();
        }
    }

    @Override
    protected void keyTyped(char typedChar, int keyCode) throws IOException {
        if (capturingKey) {
            if (keyCode != Keyboard.KEY_ESCAPE) {
                draft.setTriggerKey(keyCode);
                capturingKey = false;
                rebuildButtons();
            }
            return;
        }
        nameField.textboxKeyTyped(typedChar, keyCode);
        slotField.textboxKeyTyped(typedChar, keyCode);
        super.keyTyped(typedChar, keyCode);
    }

    @Override
    protected void mouseClicked(int mouseX, int mouseY, int mouseButton) throws IOException {
        nameField.mouseClicked(mouseX, mouseY, mouseButton);
        slotField.mouseClicked(mouseX, mouseY, mouseButton);
        super.mouseClicked(mouseX, mouseY, mouseButton);
    }
}
