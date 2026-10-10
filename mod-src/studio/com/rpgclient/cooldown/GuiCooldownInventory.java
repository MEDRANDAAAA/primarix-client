package com.rpgclient.cooldown;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Gui;
import net.minecraft.client.gui.GuiScreen;
import net.minecraft.client.gui.ScaledResolution;
import net.minecraft.client.gui.inventory.GuiContainer;
import net.minecraft.client.renderer.RenderHelper;
import net.minecraft.client.renderer.GlStateManager;
import net.minecraft.entity.player.InventoryPlayer;
import net.minecraft.inventory.Slot;
import net.minecraft.item.ItemStack;
import net.minecraftforge.client.event.RenderGameOverlayEvent;
import net.minecraftforge.client.event.GuiScreenEvent;
import net.minecraftforge.fml.common.eventhandler.SubscribeEvent;
import net.minecraftforge.fml.relauncher.ReflectionHelper;

import java.io.IOException;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.Buffer;
import java.nio.FloatBuffer;
import java.util.Arrays;
import java.util.Properties;
import org.lwjgl.BufferUtils;
import org.lwjgl.opengl.GL11;
import org.lwjgl.opengl.GL14;
import org.lwjgl.opengl.GL12;

public class GuiCooldownInventory extends GuiScreen {
    private static final int SLOT = 18;
    private static final int COLUMNS = 9;
    private static final int ROWS = 4;
    private static final int READY_SLOT_COLOR = 0xFF35D06F;
    private static final int COOLDOWN_SLOT_COLOR = 0xFFFF5151;
    private static boolean overlayEnabled;
    private static boolean armorOverlayEnabled;
    private static int cooldownLeft = Integer.MIN_VALUE;
    private static int cooldownTop = Integer.MIN_VALUE;
    private static int armorLeft = Integer.MIN_VALUE;
    private static int armorTop = Integer.MIN_VALUE;
    private static float hudOpacity = 1.0F;
    private static final ItemStack[] cachedItems = new ItemStack[36];
    private static final CooldownEntry[] cachedCooldownEntries = new CooldownEntry[36];
    private static final CooldownEntry[] cachedAbsorptionEntries = new CooldownEntry[36];
    private static final CooldownEntry[] cachedHealEntries = new CooldownEntry[36];
    private static final boolean[] cachedToolItems = new boolean[36];
    private static long cachedCooldownRevision = Long.MIN_VALUE;
    private static long cachedToolsRevision = Long.MIN_VALUE;
    private static long lastRevisionCheckFrame = -1L;
    private static long currentFrame;
    private static ScaledResolution cachedResolution;
    private static int lastWidth;
    private static int lastHeight;
    private int left;
    private int top;

    private static final class HudRenderState {
        private static final FloatBuffer COLOR_BUFFER = BufferUtils.createFloatBuffer(16);

        private final boolean lighting = GL11.glIsEnabled(GL11.GL_LIGHTING);
        private final boolean light0 = GL11.glIsEnabled(GL11.GL_LIGHT0);
        private final boolean light1 = GL11.glIsEnabled(GL11.GL_LIGHT1);
        private final boolean colorMaterial = GL11.glIsEnabled(GL11.GL_COLOR_MATERIAL);
        private final boolean depth = GL11.glIsEnabled(GL11.GL_DEPTH_TEST);
        private final boolean blend = GL11.glIsEnabled(GL11.GL_BLEND);
        private final boolean alpha = GL11.glIsEnabled(GL11.GL_ALPHA_TEST);
        private final boolean texture = GL11.glIsEnabled(GL11.GL_TEXTURE_2D);
        private final boolean rescaleNormal = GL11.glIsEnabled(GL12.GL_RESCALE_NORMAL);
        private final boolean depthMask = GL11.glGetInteger(GL11.GL_DEPTH_WRITEMASK) != 0;
        private final int alphaFunction = GL11.glGetInteger(GL11.GL_ALPHA_TEST_FUNC);
        private final int blendSrc = GL11.glGetInteger(GL11.GL_BLEND_SRC);
        private final int blendDst = GL11.glGetInteger(GL11.GL_BLEND_DST);
        private final int blendSrcAlpha = GL11.glGetInteger(GL14.GL_BLEND_SRC_ALPHA);
        private final int blendDstAlpha = GL11.glGetInteger(GL14.GL_BLEND_DST_ALPHA);
        private final float alphaReference;
        private final float red;
        private final float green;
        private final float blue;
        private final float opacity;

        private HudRenderState() {
            ((Buffer) COLOR_BUFFER).clear();
            GL11.glGetFloat(GL11.GL_ALPHA_TEST_REF, COLOR_BUFFER);
            alphaReference = COLOR_BUFFER.get(0);
            ((Buffer) COLOR_BUFFER).clear();
            GL11.glGetFloat(GL11.GL_CURRENT_COLOR, COLOR_BUFFER);
            red = COLOR_BUFFER.get(0);
            green = COLOR_BUFFER.get(1);
            blue = COLOR_BUFFER.get(2);
            opacity = COLOR_BUFFER.get(3);
        }

        private void restore() {
            if (lighting) GlStateManager.enableLighting(); else GlStateManager.disableLighting();
            if (light0) GlStateManager.enableLight(0); else GlStateManager.disableLight(0);
            if (light1) GlStateManager.enableLight(1); else GlStateManager.disableLight(1);
            if (colorMaterial) GlStateManager.enableColorMaterial(); else GlStateManager.disableColorMaterial();
            if (depth) GlStateManager.enableDepth(); else GlStateManager.disableDepth();
            GlStateManager.depthMask(depthMask);
            if (blend) GlStateManager.enableBlend(); else GlStateManager.disableBlend();
            if (alpha) GlStateManager.enableAlpha(); else GlStateManager.disableAlpha();
            GlStateManager.alphaFunc(alphaFunction, alphaReference);
            if (texture) GlStateManager.enableTexture2D(); else GlStateManager.disableTexture2D();
            if (rescaleNormal) GlStateManager.enableRescaleNormal(); else GlStateManager.disableRescaleNormal();
            GlStateManager.tryBlendFuncSeparate(blendSrc, blendDst, blendSrcAlpha, blendDstAlpha);
            GlStateManager.color(red, green, blue, opacity);
        }
    }

    public static void toggleOverlay() {
        overlayEnabled = !overlayEnabled;
    }

    public static void toggleArmorOverlay() {
        armorOverlayEnabled = !armorOverlayEnabled;
    }

    public static boolean isArmorOverlayEnabled() {
        return armorOverlayEnabled;
    }

    public static void setOverlayEnabled(boolean enabled) {
        overlayEnabled = enabled;
    }

    public static boolean isOverlayEnabled() {
        return overlayEnabled;
    }

    public static void openLayoutEditor() {
        Minecraft.getMinecraft().displayGuiScreen(new GuiHudLayoutEditor());
    }

    public static int getCooldownPanelWidth() {
        return COLUMNS * SLOT + 12;
    }

    public static int getCooldownPanelHeight() {
        return ROWS * SLOT + 25;
    }

    public static int getArmorPanelWidth() {
        return 72;
    }

    public static int getArmorPanelHeight() {
        return ROWS * SLOT + 25;
    }

    public static int getCooldownLeft(ScaledResolution resolution) {
        ensurePositions(resolution);
        return cooldownLeft;
    }

    public static int getCooldownTop(ScaledResolution resolution) {
        ensurePositions(resolution);
        return cooldownTop;
    }

    public static int getArmorLeft(ScaledResolution resolution) {
        ensurePositions(resolution);
        return armorLeft;
    }

    public static int getArmorTop(ScaledResolution resolution) {
        ensurePositions(resolution);
        return armorTop;
    }

    public static void setPanelPositions(int newCooldownLeft, int newCooldownTop,
            int newArmorLeft, int newArmorTop, int newOpacity) {
        cooldownLeft = newCooldownLeft;
        cooldownTop = newCooldownTop;
        armorLeft = newArmorLeft;
        armorTop = newArmorTop;
        hudOpacity = Math.max(0.2F, Math.min(1.0F, newOpacity / 100.0F));
        clampPositions(new ScaledResolution(Minecraft.getMinecraft()));
        saveLayout();
    }

    public static int getHudOpacity() {
        return Math.round(hudOpacity * 100.0F);
    }

    private static void ensurePositions(ScaledResolution resolution) {
        if (cooldownLeft != Integer.MIN_VALUE && armorLeft != Integer.MIN_VALUE) {
            return;
        }
        cooldownLeft = 4;
        cooldownTop = 4;
        armorLeft = cooldownLeft + getCooldownPanelWidth() + 6;
        armorTop = cooldownTop;
        Properties properties = new Properties();
        File file = layoutFile();
        if (!file.isFile()) {
            clampPositions(resolution);
            return;
        }
        try {
            FileInputStream input = new FileInputStream(file);
            properties.load(input);
            input.close();
            cooldownLeft = Integer.parseInt(properties.getProperty("cooldownLeft", String.valueOf(cooldownLeft)));
            cooldownTop = Integer.parseInt(properties.getProperty("cooldownTop", String.valueOf(cooldownTop)));
            armorLeft = Integer.parseInt(properties.getProperty("armorLeft", String.valueOf(armorLeft)));
            armorTop = Integer.parseInt(properties.getProperty("armorTop", String.valueOf(armorTop)));
            hudOpacity = Math.max(0.2F, Math.min(1.0F,
                    Integer.parseInt(properties.getProperty("opacity", "100")) / 100.0F));
            if (cooldownLeft == resolution.getScaledWidth() - getCooldownPanelWidth() - 4
                    && cooldownTop == resolution.getScaledHeight() - getCooldownPanelHeight() - 4
                    && armorLeft == cooldownLeft - getArmorPanelWidth() - 6
                    && armorTop == cooldownTop) {
                cooldownLeft = 4;
                cooldownTop = 4;
                armorLeft = cooldownLeft + getCooldownPanelWidth() + 6;
                armorTop = cooldownTop;
                saveLayout();
            }
        } catch (Exception ignored) {
        }
        clampPositions(resolution);
    }

    private static void clampPositions(ScaledResolution resolution) {
        int width = resolution.getScaledWidth();
        int height = resolution.getScaledHeight();
        cooldownLeft = Math.max(0, Math.min(cooldownLeft,
                Math.max(0, width - getCooldownPanelWidth())));
        cooldownTop = Math.max(0, Math.min(cooldownTop,
                Math.max(0, height - getCooldownPanelHeight())));
        armorLeft = Math.max(0, Math.min(armorLeft,
                Math.max(0, width - getArmorPanelWidth())));
        armorTop = Math.max(0, Math.min(armorTop,
                Math.max(0, height - getArmorPanelHeight())));
    }

    private static void saveLayout() {
        try {
            File file = layoutFile();
            File parent = file.getParentFile();
            if (!parent.exists()) {
                parent.mkdirs();
            }
            Properties properties = new Properties();
            properties.setProperty("cooldownLeft", String.valueOf(cooldownLeft));
            properties.setProperty("cooldownTop", String.valueOf(cooldownTop));
            properties.setProperty("armorLeft", String.valueOf(armorLeft));
            properties.setProperty("armorTop", String.valueOf(armorTop));
            properties.setProperty("opacity", String.valueOf(getHudOpacity()));
            FileOutputStream output = new FileOutputStream(file);
            properties.store(output, "RPGClient Cooldown HUD");
            output.close();
        } catch (Exception ignored) {
        }
    }

    private static File layoutFile() {
        return new File(new File(Minecraft.getMinecraft().mcDataDir, "config"),
                "rpgclient-cooldown-hud.properties");
    }

    @Override
    public void initGui() {
        left = (width - 9 * SLOT) / 2;
        top = (height - 4 * SLOT) / 2;
    }

    @Override
    public void drawScreen(int mouseX, int mouseY, float partialTicks) {
        currentFrame++;
        drawDefaultBackground();
        drawRect(left - 8, top - 28, left + 9 * SLOT + 8 + 72 + 6,
            top + 4 * SLOT + 8, 0xD8101018);
        drawCenteredString(fontRendererObj, "Inventario de recargas", width / 2, top - 20, 0xFFFFFF);

        GlStateManager.pushMatrix();
        RenderHelper.enableGUIStandardItemLighting();
        InventoryPlayer inventory = mc.thePlayer.inventory;
        for (int index = 0; index < 36; index++) {
            int x = left + (index % 9) * SLOT + 1;
            int y = top + (index / 9) * SLOT + 1;
            int inventorySlot = inventoryIndexForDisplay(index);
            ItemStack item = inventory.getStackInSlot(inventorySlot);
            refreshCachedEntries(inventorySlot, item);
            int color = registeredItemColor(cachedToolItems[inventorySlot],
                cachedCooldownEntries[inventorySlot], cachedAbsorptionEntries[inventorySlot],
                cachedHealEntries[inventorySlot],
                0xB0606060, 0xB020B040, 0xB0D02020);
            drawRect(x - 1, y - 1, x + 17, y + 17, color);
            if (item != null) {
                mc.getRenderItem().renderItemIntoGUI(item, x, y);
                mc.getRenderItem().renderItemOverlays(fontRendererObj, item, x, y);
            }
            CooldownEntry cooldown = getCachedCooldownEntry(inventorySlot);
            if (cooldown != null) {
                drawCooldownProgress(x - 1, y - 1, cooldown);
            }
        }
        renderArmor(mc, inventory, left + 9 * SLOT + 8, top);
        RenderHelper.disableStandardItemLighting();
        GlStateManager.color(1.0F, 1.0F, 1.0F, 1.0F);
        GlStateManager.enableAlpha();
        GlStateManager.enableTexture2D();
        GlStateManager.disableBlend();
        GlStateManager.enableDepth();
        GlStateManager.disableLighting();
        GlStateManager.popMatrix();
        super.drawScreen(mouseX, mouseY, partialTicks);
    }

    @SubscribeEvent
    public void onRenderGameOverlay(RenderGameOverlayEvent.Post event) {
        Minecraft mc = Minecraft.getMinecraft();
        if (event.type == RenderGameOverlayEvent.ElementType.HOTBAR
                && mc.thePlayer != null && mc.currentScreen == null) {
            currentFrame++;
            renderHotbarCooldowns(mc, event.resolution);
            return;
        }
        if (event.type == RenderGameOverlayEvent.ElementType.ALL
            && (overlayEnabled || armorOverlayEnabled) && mc.currentScreen == null) {
            renderHud(mc);
        }
    }

    @SubscribeEvent
    public void onDrawInventory(GuiScreenEvent.DrawScreenEvent.Post event) {
        Minecraft mc = Minecraft.getMinecraft();
        if (!(event.gui instanceof GuiContainer) || mc.thePlayer == null) {
            return;
        }
        GuiContainer container = (GuiContainer) event.gui;
        if (container.inventorySlots == null) {
            return;
        }

        currentFrame++;
        int guiLeft = ReflectionHelper.getPrivateValue(
                GuiContainer.class, container, "guiLeft", "field_147003_i");
        int guiTop = ReflectionHelper.getPrivateValue(
                GuiContainer.class, container, "guiTop", "field_147009_r");
        HudRenderState renderState = new HudRenderState();
        GlStateManager.pushMatrix();
        try {
            GlStateManager.disableLighting();
            GlStateManager.disableDepth();
            GlStateManager.enableBlend();
            GlStateManager.enableAlpha();
            GlStateManager.tryBlendFuncSeparate(770, 771, 1, 0);
            for (Object slotObject : container.inventorySlots.inventorySlots) {
                Slot slot = (Slot) slotObject;
                if (slot.inventory != mc.thePlayer.inventory) {
                    continue;
                }
                CooldownEntry cooldown = getInventoryCooldownEntry(slot.getSlotIndex());
                if (cooldown != null) {
                    drawSlotCooldown(guiLeft + slot.xDisplayPosition,
                            guiTop + slot.yDisplayPosition, cooldown);
                }
            }
        } finally {
            renderState.restore();
            GlStateManager.popMatrix();
        }
    }

    private static void renderHotbarCooldowns(Minecraft mc, ScaledResolution resolution) {
        HudRenderState renderState = new HudRenderState();
        GlStateManager.pushMatrix();
        try {
            GlStateManager.disableLighting();
            GlStateManager.disableDepth();
            GlStateManager.enableBlend();
            GlStateManager.enableAlpha();
            GlStateManager.tryBlendFuncSeparate(770, 771, 1, 0);
            int left = resolution.getScaledWidth() / 2 - 89;
            int top = resolution.getScaledHeight() - 20;
            for (int slot = 0; slot < 9; slot++) {
                CooldownEntry cooldown = getInventoryCooldownEntry(slot);
                if (cooldown != null) {
                    drawSlotCooldown(left + slot * 20, top, cooldown);
                }
            }
        } finally {
            renderState.restore();
            GlStateManager.popMatrix();
        }
    }

    private static void drawSlotCooldown(int x, int y, CooldownEntry entry) {
        int color = entry.isOnCooldown() ? COOLDOWN_SLOT_COLOR : READY_SLOT_COLOR;
        int tint = 0x30000000 | (color & 0x00FFFFFF);
        Gui.drawRect(x, y, x + SLOT, y + SLOT, tint);
        Gui.drawRect(x, y + SLOT - 1, x + SLOT, y + SLOT, color);
        Gui.drawRect(x, y + 1, x + 1, y + SLOT - 1, color);
        Gui.drawRect(x + SLOT - 1, y + 1, x + SLOT, y + SLOT - 1, color);
        drawCooldownProgress(x, y, entry);
    }

    private static void drawCooldownProgress(int x, int y, CooldownEntry entry) {
        int progressWidth = 14;
        if (entry.isOnCooldown()) {
            double duration = entry.getSeconds() * 1000.0D;
            progressWidth = (int) Math.ceil(14.0D
                    * entry.getCooldownRemainingMillis() / duration);
            progressWidth = Math.max(0, Math.min(14, progressWidth));
        }
        Gui.drawRect(x + 2, y, x + SLOT - 2, y + 1, 0xB0000000);
        if (progressWidth > 0) {
            int color = entry.isOnCooldown() ? COOLDOWN_SLOT_COLOR : READY_SLOT_COLOR;
            Gui.drawRect(x + 2, y, x + 2 + progressWidth, y + 1, color);
        }
    }

    private static CooldownEntry getInventoryCooldownEntry(int inventorySlot) {
        if (inventorySlot < 0 || inventorySlot >= cachedItems.length) {
            return null;
        }
        Minecraft mc = Minecraft.getMinecraft();
        ItemStack item = mc.thePlayer.inventory.getStackInSlot(inventorySlot);
        refreshCachedEntries(inventorySlot, item);
        CooldownEntry entry = cachedAbsorptionEntries[inventorySlot];
        if (entry == null) {
            entry = cachedHealEntries[inventorySlot];
        }
        if (entry == null) {
            entry = cachedCooldownEntries[inventorySlot];
        }
        return entry;
    }

    private static void renderHud(Minecraft mc) {
        if (mc.thePlayer == null) {
            return;
        }
        currentFrame++;
        int displayWidth = mc.displayWidth;
        int displayHeight = mc.displayHeight;
        if (cachedResolution == null || displayWidth != lastWidth || displayHeight != lastHeight) {
            cachedResolution = new ScaledResolution(mc);
            lastWidth = displayWidth;
            lastHeight = displayHeight;
        }
        ScaledResolution resolution = cachedResolution;
        int gridWidth = COLUMNS * SLOT;
        int gridHeight = ROWS * SLOT;
        ensurePositions(resolution);
        int startX = cooldownLeft + 6;
        int startY = cooldownTop + 20;

        HudRenderState renderState = new HudRenderState();
        GlStateManager.pushMatrix();
        try {
            GlStateManager.disableLighting();
            GlStateManager.disableDepth();
            GlStateManager.enableBlend();
            GlStateManager.enableAlpha();
            GlStateManager.enableTexture2D();
            GlStateManager.color(1.0F, 1.0F, 1.0F, 1.0F);
            GlStateManager.tryBlendFuncSeparate(770, 771, 1, 0);
            RenderHelper.enableGUIStandardItemLighting();
            InventoryPlayer inventory = mc.thePlayer.inventory;
            if (overlayEnabled) {
                renderCooldownPanel(mc, inventory, startX, startY, gridWidth, gridHeight);
            }
            if (armorOverlayEnabled) {
                renderArmorPanel(mc, inventory, armorLeft, armorTop);
            }
        } finally {
            RenderHelper.disableStandardItemLighting();

            renderState.restore();
            GlStateManager.popMatrix();
        }
    }

    private static void renderCooldownPanel(Minecraft mc, InventoryPlayer inventory, int startX, int startY, int gridWidth, int gridHeight) {
        Gui.drawRect(startX - 6, startY - 20, startX + gridWidth + 6,
            startY + gridHeight + 5, hudColor(0x80181818));
        Gui.drawRect(startX - 6, startY - 20, startX + gridWidth + 6,
            startY - 19, hudColor(0xC0A0A0A0));
        mc.fontRendererObj.drawStringWithShadow("Recargas", startX + 4, startY - 15, 0xFFFFFFFF);
        for (int index = 0; index < 36; index++) {
            int x = startX + (index % COLUMNS) * SLOT + 1;
            int y = startY + (index / COLUMNS) * SLOT + 1;
            int inventorySlot = inventoryIndexForDisplay(index);
            ItemStack item = mc.thePlayer.inventory.getStackInSlot(inventorySlot);
            refreshCachedEntries(inventorySlot, item);
            int color = hudColor(registeredItemColor(cachedToolItems[inventorySlot],
                    cachedCooldownEntries[inventorySlot], cachedAbsorptionEntries[inventorySlot],
                    cachedHealEntries[inventorySlot],
                    0x70505050, 0xB028A850, 0xB0D03030));
            Gui.drawRect(x - 1, y - 1, x + 17, y + 17, color);
            if (item != null) {
                mc.getRenderItem().renderItemIntoGUI(item, x, y);
                mc.getRenderItem().renderItemOverlays(mc.fontRendererObj, item, x, y);
            }
            CooldownEntry cooldown = getCachedCooldownEntry(inventorySlot);
            if (cooldown != null) {
                drawCooldownProgress(x - 1, y - 1, cooldown);
            }
        }
        RenderHelper.disableStandardItemLighting();
    }

    private static void renderArmorPanel(Minecraft mc, InventoryPlayer inventory, int panelLeft, int panelTop) {
        int itemTop = panelTop + 20;
        Gui.drawRect(panelLeft, panelTop, panelLeft + 72, panelTop + ROWS * SLOT + 25, hudColor(0x80181818));
        Gui.drawRect(panelLeft, panelTop, panelLeft + 72, panelTop + 1, hudColor(0xC0A0A0A0));
        mc.fontRendererObj.drawStringWithShadow("Armadura", panelLeft + 4, panelTop + 5, 0xFFFFFFFF);
        renderArmor(mc, inventory, panelLeft, itemTop);
    }

    private static int hudColor(int color) {
        int alpha = Math.round(((color >>> 24) & 0xFF) * hudOpacity);
        return (alpha << 24) | (color & 0x00FFFFFF);
    }

    private static void refreshCachedEntries(int index, ItemStack item) {
        if (currentFrame != lastRevisionCheckFrame) {
            lastRevisionCheckFrame = currentFrame;
            long cooldownRevision = CooldownManager.getDataRevision();
            long toolsRevision = ToolsManager.getDataRevision();
            if (cachedCooldownRevision != cooldownRevision || cachedToolsRevision != toolsRevision) {
                Arrays.fill(cachedItems, null);
                Arrays.fill(cachedCooldownEntries, null);
                Arrays.fill(cachedAbsorptionEntries, null);
                Arrays.fill(cachedHealEntries, null);
                Arrays.fill(cachedToolItems, false);
                cachedCooldownRevision = cooldownRevision;
                cachedToolsRevision = toolsRevision;
            }
        }
        if (cachedItems[index] != item) {
            cachedItems[index] = item;
            cachedCooldownEntries[index] = CooldownManager.find(item);
            cachedAbsorptionEntries[index] = CooldownManager.find(
                    item, CooldownManager.Category.ABSORPTION);
            cachedHealEntries[index] = CooldownManager.find(item, CooldownManager.Category.HEAL);
            cachedToolItems[index] = ToolsManager.isRegistered(item);
        }
    }

    private static CooldownEntry getCachedCooldownEntry(int inventorySlot) {
        CooldownEntry entry = cachedAbsorptionEntries[inventorySlot];
        if (entry == null) {
            entry = cachedHealEntries[inventorySlot];
        }
        return entry != null ? entry : cachedCooldownEntries[inventorySlot];
    }

    private static int registeredItemColor(boolean isToolItem, CooldownEntry cooldownEntry,
            CooldownEntry absorptionEntry, CooldownEntry healEntry,
            int emptyColor, int readyColor, int cooldownColor) {
        if (isToolItem) return 0xB0E05AC8;
        if (absorptionEntry != null) {
            return cooldownColor(absorptionEntry, 0xB020B040, 0xB020B040, cooldownColor);
        }
        if (healEntry != null) {
            return cooldownColor(healEntry, 0xB020B040, 0xB020B040, cooldownColor);
        }
        return cooldownColor(cooldownEntry, emptyColor, readyColor, cooldownColor);
    }

    private static int cooldownColor(CooldownEntry entry, int emptyColor,
            int readyColor, int cooldownColor) {
        if (entry == null) {
            return emptyColor;
        }
        if (!entry.isOnCooldown()) {
            return readyColor;
        }
        return cooldownColor;
    }

    @Override
    protected void mouseClicked(int mouseX, int mouseY, int mouseButton) throws IOException {
        if (mouseButton == 1 && mouseX >= left - 8 && mouseX <= left + 9 * SLOT + 8
                && mouseY >= top - 28 && mouseY <= top + 4 * SLOT + 8) {
            int column = (mouseX - left) / SLOT;
            int row = (mouseY - top) / SLOT;
            if (column >= 0 && column < 9 && row >= 0 && row < 4) {
                int slotIndex = inventoryIndexForDisplay(row * COLUMNS + column);
                CooldownEntry entry = CooldownManager.findInAnyCategory(
                    mc.thePlayer.inventory.getStackInSlot(slotIndex));
                if (entry != null && !entry.isOnCooldown()) {
                    CooldownEventHandler.requestCooldown(entry,
                        mc.thePlayer.inventory.getStackInSlot(slotIndex), slotIndex);
                }
            }
        }
        super.mouseClicked(mouseX, mouseY, mouseButton);
    }

    private static void renderArmor(Minecraft mc, InventoryPlayer inventory, int armorLeft, int top) {
        HudRenderState renderState = new HudRenderState();

        try {
            GlStateManager.disableLighting();
            GlStateManager.disableDepth();
            GlStateManager.enableBlend();
            GlStateManager.enableAlpha();
            GlStateManager.enableTexture2D();
            GlStateManager.color(1.0F, 1.0F, 1.0F, 1.0F);
            GlStateManager.tryBlendFuncSeparate(770, 771, 1, 0);
            RenderHelper.enableGUIStandardItemLighting();

            for (int displayIndex = 0; displayIndex < 4; displayIndex++) {
                int armorIndex = 3 - displayIndex;
                ItemStack armor = mc.thePlayer.inventory.armorInventory[armorIndex];
                int x = armorLeft + 1;
                int y = top + 1 + displayIndex * SLOT;
                Gui.drawRect(x - 1, y - 1, x + 17, y + 17, 0xB0505050);
                if (armor == null) {
                    mc.fontRendererObj.drawStringWithShadow("-", armorLeft + 28, y + 5, 0xFF888888);
                    continue;
                }
                mc.getRenderItem().renderItemIntoGUI(armor, x, y);
                mc.getRenderItem().renderItemOverlays(mc.fontRendererObj, armor, x, y);
                int percent = durabilityPercent(armor);
                int color = percent <= 25 ? 0xFFFF4444 : percent <= 60 ? 0xFFFFFF44 : 0xFF55DD66;
                mc.fontRendererObj.drawStringWithShadow(percent + "%", armorLeft + 25, y + 5, color);
            }
        } finally {
            RenderHelper.disableStandardItemLighting();
            renderState.restore();
        }
    }

    private static int durabilityPercent(ItemStack item) {
        if (item.getMaxDamage() <= 0) {
            return 100;
        }
        int remaining = Math.max(0, item.getMaxDamage() - item.getItemDamage());
        return Math.max(0, Math.min(100,
            (int) Math.round(remaining * 100.0D / item.getMaxDamage())));
    }

    private static int inventoryIndexForDisplay(int displayIndex) {
        int row = displayIndex / COLUMNS;
        int column = displayIndex % COLUMNS;
        return row < 3 ? (row + 1) * COLUMNS + column : column;
    }

    public static void renderHudOverlay(Minecraft mc) {
        renderHud(mc);
    }
}