package com.rpgclient.cooldown;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiButton;
import net.minecraft.client.gui.GuiScreen;
import net.minecraft.client.gui.GuiTextField;
import net.minecraft.item.ItemStack;
import org.lwjgl.input.Mouse;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public class GuiCooldownEditor extends GuiScreen {
    private static final int ROW_HEIGHT = 28;
    private static final int VISIBLE_ROWS = 6;
    private final List<GuiTextField> secondsFields = new ArrayList<GuiTextField>();
    private final List<CooldownEntry> entries = new ArrayList<CooldownEntry>();
    private int panelLeft;
    private int panelTop;
    private int scrollOffset;
    private CooldownManager.Category category = CooldownManager.Category.COOLDOWN;

    @Override
    public void initGui() {
        panelLeft = (width - 420) / 2;
        panelTop = (height - 300) / 2;
        entries.clear();
        entries.addAll(CooldownManager.getEntries(category));
        scrollOffset = Math.min(scrollOffset, maxScrollOffset());
        rebuildVisibleControls();
    }

    private void rebuildVisibleControls() {
        buttonList.clear();
        secondsFields.clear();
        buttonList.add(new GuiButton(9100, panelLeft + 12, panelTop + 28, 75, 20, "Inicio"));
        buttonList.add(new GuiButton(9101, panelLeft + 91, panelTop + 28, 112, 20, "Absorciones"));
        buttonList.add(new GuiButton(9102, panelLeft + 207, panelTop + 28, 65, 20, "Curación"));
        buttonList.add(new GuiButton(9001, panelLeft + 276, panelTop + 28, 55, 20, "HUD"));
        buttonList.add(new GuiButton(9000, panelLeft + 335, panelTop + 28, 73, 20, "Cerrar"));
        int visibleCount = Math.min(VISIBLE_ROWS, Math.max(0, entries.size() - scrollOffset));
        for (int visibleIndex = 0; visibleIndex < visibleCount; visibleIndex++) {
            int y = panelTop + 72 + visibleIndex * ROW_HEIGHT;
            CooldownEntry entry = entries.get(scrollOffset + visibleIndex);
            GuiTextField field = new GuiTextField(visibleIndex, fontRendererObj,
                    panelLeft + 215, y + 2, 58, 18);
            field.setText(formatSeconds(entry.getSeconds()));
            secondsFields.add(field);
            buttonList.add(new GuiButton(1000 + visibleIndex, panelLeft + 275, y, 60, 20, "Guardar"));
            buttonList.add(new GuiButton(2000 + visibleIndex, panelLeft + 337, y, 60, 20, "Eliminar"));
        }
    }

    @Override
    public void drawScreen(int mouseX, int mouseY, float partialTicks) {
        drawDefaultBackground();
        drawRect(panelLeft, panelTop, panelLeft + 420, panelTop + 300, 0xE8101018);
        drawRect(panelLeft, panelTop, panelLeft + 420, panelTop + 2, 0xFF4CC9FF);
        String section = category == CooldownManager.Category.ABSORPTION ? "Absorciones"
                : category == CooldownManager.Category.HEAL ? "Curación" : "Recargas";
        drawCenteredString(fontRendererObj, section + " - "
            + CooldownManager.getActiveInstanceName(), width / 2, panelTop + 10, 0xFFFFFF);
        drawString(fontRendererObj, "Objeto / ID", panelLeft + 12, panelTop + 60, 0xAAAAAA);
        drawString(fontRendererObj, "Recarga (s)", panelLeft + 190, panelTop + 60, 0xAAAAAA);

        if (entries.isEmpty()) {
            drawCenteredString(fontRendererObj, "Sin items registrados", width / 2, panelTop + 145, 0xD0D0D0);
        }

        int visibleCount = Math.min(VISIBLE_ROWS, Math.max(0, entries.size() - scrollOffset));
        for (int visibleIndex = 0; visibleIndex < visibleCount; visibleIndex++) {
            int index = scrollOffset + visibleIndex;
            int y = panelTop + 76 + visibleIndex * ROW_HEIGHT;
            ItemStack item = entries.get(index).getSample();
            if (item != null) {
                mc.getRenderItem().renderItemIntoGUI(item, panelLeft + 12, y - 2);
            }
            drawString(fontRendererObj, entries.get(index).getId(), panelLeft + 35, y + 4, 0xFFFFFF);
            secondsFields.get(visibleIndex).drawTextBox();
        }
        if (maxScrollOffset() > 0) {
            int trackTop = panelTop + 72;
            int trackBottom = panelTop + 246;
            int trackHeight = trackBottom - trackTop;
            int thumbHeight = Math.max(18, trackHeight * VISIBLE_ROWS / entries.size());
            int thumbRange = trackHeight - thumbHeight;
            int thumbTop = trackTop + (thumbRange * scrollOffset / maxScrollOffset());
            drawRect(panelLeft + 405, trackTop, panelLeft + 411, trackBottom, 0xFF555555);
            drawRect(panelLeft + 405, thumbTop, panelLeft + 411,
                    thumbTop + thumbHeight, 0xFF4CC9FF);
        }
        super.drawScreen(mouseX, mouseY, partialTicks);
    }

    @Override
    protected void actionPerformed(GuiButton button) {
        if (button.id >= 9100 && button.id <= 9102) {
            saveVisibleValues();
            category = button.id == 9101 ? CooldownManager.Category.ABSORPTION
                    : button.id == 9102 ? CooldownManager.Category.HEAL
                    : CooldownManager.Category.COOLDOWN;
            scrollOffset = 0;
            initGui();
            return;
        }
        if (button.id == 9000) {
            mc.displayGuiScreen(null);
            return;
        }
        if (button.id == 9001) {
            mc.displayGuiScreen(new GuiHudLayoutEditor());
            return;
        }
        if (button.id >= 1000 && button.id < 2000) {
            int visibleIndex = button.id - 1000;
            int index = scrollOffset + visibleIndex;
            if (visibleIndex < secondsFields.size() && index < entries.size()) {
                double seconds = parseSeconds(secondsFields.get(visibleIndex).getText());
                entries.get(index).setSeconds(seconds);
                CooldownManager.register(category, entries.get(index).getId(), seconds,
                    entries.get(index).getSample());
            }
        } else if (button.id >= 2000 && button.id < 3000) {
            int visibleIndex = button.id - 2000;
            int index = scrollOffset + visibleIndex;
            if (index < entries.size()) {
                CooldownManager.delete(category, entries.get(index).getId());
                initGui();
            }
        }
    }

    private double parseSeconds(String value) {
        try {
            double seconds = Double.parseDouble(value.replace(',', '.'));
            return Math.max(0.1D, Math.min(500.0D, seconds));
        } catch (NumberFormatException exception) {
            return 10.0D;
        }
    }

    private String formatSeconds(double seconds) {
        return String.valueOf(seconds).replace('.', ',');
    }

    private int maxScrollOffset() {
        return Math.max(0, entries.size() - VISIBLE_ROWS);
    }

    private void syncVisibleValues() {
        for (int visibleIndex = 0; visibleIndex < secondsFields.size(); visibleIndex++) {
            int index = scrollOffset + visibleIndex;
            if (index < entries.size()) {
                entries.get(index).setSeconds(parseSeconds(secondsFields.get(visibleIndex).getText()));
            }
        }
    }

    private void saveVisibleValues() {
        for (int visibleIndex = 0; visibleIndex < secondsFields.size(); visibleIndex++) {
            int index = scrollOffset + visibleIndex;
            if (index < entries.size()) {
                CooldownEntry entry = entries.get(index);
                double seconds = parseSeconds(secondsFields.get(visibleIndex).getText());
                entry.setSeconds(seconds);
                CooldownManager.register(category, entry.getId(), seconds, entry.getSample());
            }
        }
    }

    private void scroll(int amount) {
        syncVisibleValues();
        scrollOffset = Math.max(0, Math.min(maxScrollOffset(), scrollOffset + amount));
        rebuildVisibleControls();
    }

    @Override
    protected void keyTyped(char typedChar, int keyCode) throws IOException {
        for (GuiTextField field : secondsFields) {
            field.textboxKeyTyped(typedChar, keyCode);
        }
        super.keyTyped(typedChar, keyCode);
    }

    @Override
    protected void mouseClicked(int mouseX, int mouseY, int mouseButton) throws IOException {
        for (GuiTextField field : secondsFields) {
            field.mouseClicked(mouseX, mouseY, mouseButton);
        }
        super.mouseClicked(mouseX, mouseY, mouseButton);
    }

    @Override
    public void handleMouseInput() throws IOException {
        super.handleMouseInput();
        int wheel = Mouse.getEventDWheel();
        if (wheel != 0) {
            scroll(wheel > 0 ? -1 : 1);
        }
    }
}
