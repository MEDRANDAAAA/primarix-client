package com.rpgclient.cooldown;

import net.minecraft.client.gui.GuiButton;
import net.minecraft.client.gui.GuiScreen;
import org.lwjgl.input.Mouse;

import java.io.IOException;
import java.util.List;

public class GuiInstanceList extends GuiScreen {
    private static final int ROW_HEIGHT = 42;
    private static final int VISIBLE_ROWS = 5;
    private List<String> instances;
    private int panelLeft;
    private int panelTop;
    private int scrollOffset;

    @Override
    public void initGui() {
        instances = CooldownManager.getInstanceNames();
        panelLeft = (width - 430) / 2;
        panelTop = (height - 290) / 2;
        scrollOffset = Math.max(0, Math.min(maxScrollOffset(), scrollOffset));
        buttonList.clear();
        int visibleCount = Math.min(VISIBLE_ROWS, instances.size() - scrollOffset);
        for (int visibleIndex = 0; visibleIndex < visibleCount; visibleIndex++) {
            int y = panelTop + 43 + visibleIndex * ROW_HEIGHT;
            buttonList.add(new GuiButton(1000 + visibleIndex, panelLeft + 12, y, 95, 20, "Usar"));
            buttonList.add(new GuiButton(2000 + visibleIndex, panelLeft + 112, y, 95, 20, "Editar"));
            buttonList.add(new GuiButton(3000 + visibleIndex, panelLeft + 212, y, 95, 20, "Eliminar"));
        }
        buttonList.add(new GuiButton(9000, panelLeft + 320, panelTop + 257, 95, 20, "Volver"));
    }

    @Override
    public void drawScreen(int mouseX, int mouseY, float partialTicks) {
        drawDefaultBackground();
        drawRect(panelLeft, panelTop, panelLeft + 430, panelTop + 290, 0xE8101018);
        drawRect(panelLeft, panelTop, panelLeft + 430, panelTop + 2, 0xFF4CC9FF);
        drawCenteredString(fontRendererObj, "Lista de instancias", width / 2, panelTop + 12, 0xFFFFFF);
        int visibleCount = Math.min(VISIBLE_ROWS, instances.size() - scrollOffset);
        for (int visibleIndex = 0; visibleIndex < visibleCount; visibleIndex++) {
            int index = scrollOffset + visibleIndex;
            int buttonY = panelTop + 43 + visibleIndex * ROW_HEIGHT;
            String name = instances.get(index);
            int color = name.equals(CooldownManager.getActiveInstanceName())
                    ? 0xFF55DD66 : 0xFFFFFFFF;
            drawString(fontRendererObj, name, panelLeft + 12, buttonY + 24, color);
        }
        if (maxScrollOffset() > 0) {
            int trackTop = panelTop + 42;
            int trackBottom = panelTop + 250;
            int trackHeight = trackBottom - trackTop;
            int thumbHeight = Math.max(20, trackHeight * VISIBLE_ROWS / instances.size());
            int thumbRange = trackHeight - thumbHeight;
            int thumbTop = trackTop + thumbRange * scrollOffset / maxScrollOffset();
            drawRect(panelLeft + 414, trackTop, panelLeft + 420, trackBottom, 0xFF555555);
            drawRect(panelLeft + 414, thumbTop, panelLeft + 420,
                    thumbTop + thumbHeight, 0xFF4CC9FF);
        }
        super.drawScreen(mouseX, mouseY, partialTicks);
    }

    @Override
    protected void actionPerformed(GuiButton button) {
        int index;
        if (button.id >= 1000 && button.id < 2000) {
            index = scrollOffset + button.id - 1000;
            if (index < instances.size()) {
                CooldownManager.useInstance(instances.get(index));
                initGui();
            }
        } else if (button.id >= 2000 && button.id < 3000) {
            index = scrollOffset + button.id - 2000;
            if (index < instances.size()) {
                CooldownManager.useInstance(instances.get(index));
                mc.displayGuiScreen(new GuiCooldownEditor());
            }
        } else if (button.id >= 3000 && button.id < 4000) {
            index = scrollOffset + button.id - 3000;
            if (index < instances.size()) {
                CooldownManager.deleteInstance(instances.get(index));
                initGui();
            }
        } else if (button.id == 9000) {
            mc.displayGuiScreen(new GuiCooldownMenu());
        }
    }

    private int maxScrollOffset() {
        return Math.max(0, instances.size() - VISIBLE_ROWS);
    }

    private void scroll(int amount) {
        scrollOffset = Math.max(0, Math.min(maxScrollOffset(), scrollOffset + amount));
        initGui();
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
