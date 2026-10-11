package com.rpgclient.cooldown;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Gui;
import net.minecraft.client.gui.GuiScreen;
import net.minecraft.client.gui.inventory.GuiContainer;
import net.minecraft.client.renderer.GlStateManager;
import net.minecraft.client.renderer.OpenGlHelper;
import net.minecraft.inventory.Slot;
import net.minecraft.item.ItemStack;
import net.minecraft.util.ResourceLocation;
import net.minecraftforge.client.event.GuiOpenEvent;
import net.minecraftforge.client.event.GuiScreenEvent;
import net.minecraftforge.event.entity.player.AttackEntityEvent;
import net.minecraftforge.fml.client.registry.ClientRegistry;
import net.minecraftforge.fml.common.eventhandler.SubscribeEvent;
import net.minecraftforge.fml.common.gameevent.InputEvent;
import net.minecraftforge.fml.common.gameevent.TickEvent;
import net.minecraftforge.client.event.RenderGameOverlayEvent;

import java.lang.reflect.Field;
import java.util.List;

public class ToolsEventHandler {
    private static final ResourceLocation HUD_ICONS =
            new ResourceLocation("textures/gui/icons.png");
    private static GuiScreen pendingScreen;
        private static final java.util.Map<String, Boolean> PREVIOUS_KEYS =
            new java.util.HashMap<String, Boolean>();
        private static String statusMessage;
        private static long statusUntil;
        private static long nextAttackSwapAt;
    private static Field guiLeftField;
    private static Field guiTopField;
    private static boolean fieldsInitialized;
    private static java.util.Set<String> cachedRegisteredItems = new java.util.HashSet<String>();
    private static long cachedToolsRevision = -1L;
    private static int cachedFrame = 0;
    private static int lastCacheUpdateFrame = -1;

    public static void registerKeys() {
    }

    public static void openNextTick(GuiScreen screen) { pendingScreen = screen; }

    public static void showStatus(String message) {
        statusMessage = message;
        statusUntil = System.currentTimeMillis() + 2000L;
    }

    @SubscribeEvent
    public void onInput(InputEvent.KeyInputEvent event) {
        Minecraft mc = Minecraft.getMinecraft();
        if (mc.currentScreen != null || mc.thePlayer == null) return;
    }

    @SubscribeEvent
    public void onClientTick(TickEvent.ClientTickEvent event) {
        if (event.phase != TickEvent.Phase.END) return;
        Minecraft mc = Minecraft.getMinecraft();
        if (pendingScreen != null && mc.thePlayer != null && mc.currentScreen == null) {
            GuiScreen screen = pendingScreen;
            pendingScreen = null;
            mc.displayGuiScreen(screen);
        }
        if (mc.thePlayer != null && mc.currentScreen == null) {
            for (String name : ToolsManager.getProfileNames()) {
                ToolsProfile profile = ToolsManager.getProfile(name);
                int key = profile.getToggleKey();
                if (key <= 0) continue;
                boolean pressed = org.lwjgl.input.Keyboard.isKeyDown(key);
                boolean previous = Boolean.TRUE.equals(PREVIOUS_KEYS.get(name));
                if (pressed && !previous) ToolsManager.toggleProfile(name);
                PREVIOUS_KEYS.put(name, pressed);
            }
        }
    }

    @SubscribeEvent
    public void onRenderOverlay(RenderGameOverlayEvent.Post event) {
        if (event.type != RenderGameOverlayEvent.ElementType.HEALTH
                || statusMessage == null || System.currentTimeMillis() >= statusUntil) return;
        Minecraft mc = Minecraft.getMinecraft();
        int color = statusMessage.endsWith("On") ? 0xFF55DD66 : 0xFFFF6666;
        int x = event.resolution.getScaledWidth() - mc.fontRendererObj.getStringWidth(statusMessage) - 5;
        try {
            mc.fontRendererObj.drawStringWithShadow(statusMessage, x, 3, color);
        } finally {
            GlStateManager.setActiveTexture(OpenGlHelper.defaultTexUnit);
            mc.getTextureManager().bindTexture(HUD_ICONS);
            GlStateManager.color(1.0F, 1.0F, 1.0F, 1.0F);
        }
    }

    @SubscribeEvent
    public void onGuiOpen(GuiOpenEvent event) {
    }

    @SubscribeEvent
    public void onAttackEntity(AttackEntityEvent event) {
        if (event.isCanceled()) return;
        swapAfterHit(event.entityPlayer);
    }

    private static void swapAfterHit(net.minecraft.entity.player.EntityPlayer player) {
        Minecraft mc = Minecraft.getMinecraft();
        if (player == mc.thePlayer && mc.currentScreen == null
            && ToolsManager.isEnabled()
            && System.currentTimeMillis() >= nextAttackSwapAt) {
            int heldDelayMs = ToolsManager.getHeldDelayMs(player);
            if (ToolsManager.quickSwap(player)) {
                nextAttackSwapAt = System.currentTimeMillis()
                    + heldDelayMs;
            }
        }
    }

    @SubscribeEvent
    public void onDrawContainer(GuiScreenEvent.DrawScreenEvent.Post event) {
        if (!(event.gui instanceof GuiContainer)) return;
        if (!ToolsManager.isEnabled()) return;
        GuiContainer gui = (GuiContainer) event.gui;
        List<Slot> slots = gui.inventorySlots.inventorySlots;
        if (slots == null) return;

        if (cachedFrame != lastCacheUpdateFrame) {
            lastCacheUpdateFrame = cachedFrame;
            long toolsRevision = ToolsManager.getDataRevision();
            if (cachedToolsRevision != toolsRevision) {
                cachedRegisteredItems.clear();
                ToolsProfile profile = ToolsManager.getActiveProfile();
                if (profile != null) {
                    for (ItemStack item : profile.getItems()) {
                        if (item != null && item.getItem() != null) {
                            cachedRegisteredItems.add(CooldownManager.identityFingerprint(item));
                        }
                    }
                }
                cachedToolsRevision = toolsRevision;
            }
        }
        cachedFrame++;

        for (Slot slot : slots) {
            ItemStack stack = slot.getStack();
            if (stack != null && stack.getItem() != null
                    && cachedRegisteredItems.contains(CooldownManager.identityFingerprint(stack))) {
                int left = getGuiOffset(gui, "guiLeft") + slot.xDisplayPosition;
                int top = getGuiOffset(gui, "guiTop") + slot.yDisplayPosition;
                drawOverlay(left, top);
            }
        }
    }

    private static int getGuiOffset(GuiContainer gui, String fieldName) {
        if (!fieldsInitialized) {
            try {
                guiLeftField = GuiContainer.class.getDeclaredField("guiLeft");
                guiLeftField.setAccessible(true);
                guiTopField = GuiContainer.class.getDeclaredField("guiTop");
                guiTopField.setAccessible(true);
            } catch (Exception ignored) {
                return fieldName.equals("guiLeft") ? (gui.width - 176) / 2 : (gui.height - 166) / 2;
            }
            fieldsInitialized = true;
        }
        try {
            return fieldName.equals("guiLeft") ? guiLeftField.getInt(gui) : guiTopField.getInt(gui);
        } catch (Exception ignored) {
            return fieldName.equals("guiLeft") ? (gui.width - 176) / 2 : (gui.height - 166) / 2;
        }
    }

    private static void drawOverlay(int left, int top) {
        // Save vanilla state
        final boolean lightingEnabled = true;
        final boolean depthEnabled = true;
        final boolean blendEnabled = true;
        final boolean alphaTestEnabled = true;
        final boolean texture2DEnabled = true;
        final int blendSrc = 770;
        final int blendDst = 771;
        float[] color = {1.0F, 1.0F, 1.0F, 1.0F};

        try {
            GlStateManager.disableLighting();
            GlStateManager.disableDepth();
            GlStateManager.enableBlend();
            GlStateManager.enableAlpha();
            GlStateManager.enableTexture2D();
            GlStateManager.tryBlendFuncSeparate(770, 771, 1, 0);
            GlStateManager.color(1.0F, 1.0F, 1.0F, 1.0F);
            net.minecraft.client.gui.Gui.drawRect(left, top, left + 16, top + 16, 0x66990099);
        } finally {
            // Restore to exact vanilla state
            GlStateManager.color(color[0], color[1], color[2], color[3]);
            GlStateManager.tryBlendFuncSeparate(blendSrc, blendDst, 1, 0);
            if (texture2DEnabled) GlStateManager.enableTexture2D(); else GlStateManager.disableTexture2D();
            if (blendEnabled) GlStateManager.enableBlend(); else GlStateManager.disableBlend();
            if (depthEnabled) GlStateManager.enableDepth(); else GlStateManager.disableDepth();
            if (lightingEnabled) GlStateManager.enableLighting(); else GlStateManager.disableLighting();
            GlStateManager.enableRescaleNormal();
        }
    }
}
