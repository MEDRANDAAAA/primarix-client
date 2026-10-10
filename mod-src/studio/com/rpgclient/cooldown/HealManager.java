package com.rpgclient.cooldown;

import net.minecraft.client.Minecraft;
import net.minecraft.entity.player.EntityPlayer;
import net.minecraft.item.ItemStack;
import org.lwjgl.input.Keyboard;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;

public final class HealManager {
    private static final Map<String, HealProfile> PROFILES =
            new LinkedHashMap<String, HealProfile>();
    private static final Map<String, Boolean> PREVIOUS_KEYS =
            new LinkedHashMap<String, Boolean>();
    private static HealProfile runningProfile;
    private static int runningStep;
    private static int runningPhase;
    private static long nextStepAt;
    private static int originalHotbarSlot;
    private static int currentInventoryIndex = -1;
    private static int currentContainerSlot = -1;
    private static boolean currentItemSwapped;
    private static String currentItemIdentity;
    private static boolean loaded;

    private HealManager() { }

    public static void load() {
        if (loaded) return;
        loaded = true;
        File file = storageFile();
        if (!file.isFile()) return;
        Properties properties = new Properties();
        try {
            FileInputStream input = new FileInputStream(file);
            properties.load(input);
            input.close();
            int slotMappingVersion = Integer.parseInt(
                    properties.getProperty("slot.mapping.version", "1"));
            int count = Integer.parseInt(properties.getProperty("profile.count", "0"));
            for (int index = 0; index < count; index++) {
                String prefix = "profile." + index + ".";
                String name = properties.getProperty(prefix + "name", "").trim();
                if (name.isEmpty()) continue;
                HealProfile profile = new HealProfile(name);
                profile.setTriggerKey(Integer.parseInt(properties.getProperty(prefix + "key", "0")));
                profile.setFirstSlot(Integer.parseInt(properties.getProperty(prefix + "item1", "1")));
                profile.setSecondSlot(Integer.parseInt(properties.getProperty(prefix + "item2", "2")));
                int slotCount = Integer.parseInt(properties.getProperty(prefix + "slot.count", "0"));
                if (slotCount > 0) {
                    List<Integer> slots = new ArrayList<Integer>();
                    for (int slotIndex = 0; slotIndex < slotCount; slotIndex++) {
                        slots.add(Integer.parseInt(properties.getProperty(
                                prefix + "slot." + slotIndex, "1")));
                    }
                    profile.setSlots(slots);
                }
                if (slotMappingVersion >= 2) {
                    List<Integer> restoredSlots = new ArrayList<Integer>();
                    for (Integer slot : profile.getSlots()) {
                        restoredSlots.add(restoreLegacySlotMapping(slot));
                    }
                    profile.setSlots(restoredSlots);
                }
                PROFILES.put(name, profile);
            }
        } catch (Exception ignored) {
            PROFILES.clear();
        }
    }

    public static void save() {
        if (!loaded) return;
        Properties properties = new Properties();
        properties.setProperty("slot.mapping.version", "1");
        properties.setProperty("profile.count", String.valueOf(PROFILES.size()));
        int index = 0;
        for (HealProfile profile : PROFILES.values()) {
            String prefix = "profile." + index++ + ".";
            properties.setProperty(prefix + "name", profile.getName());
            properties.setProperty(prefix + "key", String.valueOf(profile.getTriggerKey()));
            properties.setProperty(prefix + "item1", String.valueOf(profile.getFirstSlot()));
            properties.setProperty(prefix + "item2", String.valueOf(profile.getSecondSlot()));
            List<Integer> slots = profile.getSlots();
            properties.setProperty(prefix + "slot.count", String.valueOf(slots.size()));
            for (int slotIndex = 0; slotIndex < slots.size(); slotIndex++) {
                properties.setProperty(prefix + "slot." + slotIndex,
                        String.valueOf(slots.get(slotIndex)));
            }
        }
        try {
            File file = storageFile();
            file.getParentFile().mkdirs();
            FileOutputStream output = new FileOutputStream(file);
            properties.store(output, "AnnthModCD Heal profiles");
            output.close();
        } catch (Exception ignored) { }
    }

    public static List<HealProfile> getProfiles() {
        return new ArrayList<HealProfile>(PROFILES.values());
    }

    public static HealProfile get(String name) { return PROFILES.get(name); }

    public static boolean add(String name) {
        String clean = name == null ? "" : name.trim();
        if (clean.isEmpty() || PROFILES.containsKey(clean)) return false;
        PROFILES.put(clean, new HealProfile(clean));
        save();
        return true;
    }

    public static void remove(String name) {
        if (runningProfile != null && runningProfile.getName().equals(name)) stop();
        PROFILES.remove(name);
        PREVIOUS_KEYS.remove(name);
        save();
    }

    public static boolean isRunning() { return runningProfile != null; }

    public static void stop() {
        if (runningProfile != null) {
            restoreCurrentItem(Minecraft.getMinecraft());
            runningProfile = null;
        }
    }

    public static void tick() {
        Minecraft mc = Minecraft.getMinecraft();
        if (mc.thePlayer == null || mc.theWorld == null) return;
        if (mc.currentScreen != null) {
            if (runningProfile != null) {
                restoreCurrentItem(mc);
                runningProfile = null;
                showMessage("AutoH cancelado porque se abrio una pantalla.");
            }
            return;
        }
        for (HealProfile profile : PROFILES.values()) {
            int key = profile.getTriggerKey();
            if (key <= 0) continue;
            boolean pressed = Keyboard.isKeyDown(key);
            boolean previous = Boolean.TRUE.equals(PREVIOUS_KEYS.get(profile.getName()));
            if (pressed && !previous && runningProfile == null) {
                start(profile);
            }
            PREVIOUS_KEYS.put(profile.getName(), pressed);
        }
        if (runningProfile != null && System.currentTimeMillis() >= nextStepAt) {
            runNextStep(mc);
        }
    }

    private static void start(HealProfile profile) {
        Minecraft mc = Minecraft.getMinecraft();
        if (profile.getSlots().isEmpty()) {
            showMessage("El perfil " + profile.getName() + " no tiene slots configurados.");
            return;
        }
        for (Integer slot : profile.getSlots()) {
            if (slot == null || !isValidSlot(slot)) {
                showMessage("El perfil " + profile.getName() + " tiene un slot invalido.");
                return;
            }
            ItemStack item = mc.thePlayer.inventory.getStackInSlot(toInventoryIndex(slot));
            if (item == null || item.getItem() == null) {
                showMessage("AutoH " + profile.getName() + ": slot " + slot
                        + " esta vacio; revisa el orden de slots.");
                return;
            }
        }
        runningProfile = profile;
        runningStep = 0;
        runningPhase = 0;
        originalHotbarSlot = mc.thePlayer.inventory.currentItem;
        currentInventoryIndex = -1;
        currentContainerSlot = -1;
        currentItemSwapped = false;
        currentItemIdentity = null;
        nextStepAt = 0L;
        showMessage("AutoH " + profile.getName() + ": usando "
                + profile.getSlots().size() + " item(s).");
    }

    private static void runNextStep(Minecraft mc) {
        if (runningStep >= runningProfile.getSlots().size()) {
            restoreCurrentItem(mc);
            runningProfile = null;
            return;
        }

        int configuredSlot = runningProfile.getSlots().get(runningStep);
        if (runningPhase == 0) {
            if (!equipInventorySlot(mc, configuredSlot)) {
                showMessage("AutoH: el slot " + configuredSlot + " quedo vacio.");
                advanceStep();
                return;
            }
            runningPhase = 1;
            nextStepAt = System.currentTimeMillis() + 50L;
            return;
        }

        if (runningPhase == 1) {
            ItemStack held = mc.thePlayer.getHeldItem();
            if (held == null || held.getItem() == null
                    || !CooldownManager.identityFingerprint(held).equals(currentItemIdentity)) {
                showMessage("AutoH no pudo equipar el item del slot " + configuredSlot + ".");
                restoreCurrentItem(mc);
                advanceStep();
                return;
            }
            useHeldItem(mc);
            runningPhase = 2;
            nextStepAt = System.currentTimeMillis() + 100L;
            return;
        }

        if (runningPhase == 2) {
            restoreCurrentItem(mc);
            advanceStep();
            return;
        }
    }

    private static boolean equipInventorySlot(Minecraft mc, int configuredSlot) {
        EntityPlayer player = mc.thePlayer;
        currentInventoryIndex = toInventoryIndex(configuredSlot);
        ItemStack item = player.inventory.getStackInSlot(currentInventoryIndex);
        if (item == null || item.getItem() == null) return false;
        currentItemIdentity = CooldownManager.identityFingerprint(item);
        currentItemSwapped = currentInventoryIndex >= 9;
        int hotbarIndex = originalHotbarSlot;
        player.inventory.currentItem = hotbarIndex;
        if (currentItemSwapped) {
            currentContainerSlot = containerSlot(currentInventoryIndex);
            mc.playerController.windowClick(player.openContainer.windowId,
                    currentContainerSlot, hotbarIndex, 2, player);
        } else {
            player.inventory.currentItem = currentInventoryIndex;
        }
        mc.playerController.updateController();
        return true;
    }

    private static void useHeldItem(Minecraft mc) {
        ItemStack held = mc.thePlayer.getHeldItem();
        if (held == null || held.getItem() == null) return;
        CooldownEntry entry = CooldownManager.findInAnyCategory(held);
        if (entry != null) {
            CooldownEventHandler.requestCooldown(entry, held, currentInventoryIndex);
        }
        mc.playerController.sendUseItem(mc.thePlayer, mc.theWorld, held);
    }

    private static void advanceStep() {
        runningStep++;
        runningPhase = 0;
        currentInventoryIndex = -1;
        currentContainerSlot = -1;
        currentItemIdentity = null;
        nextStepAt = System.currentTimeMillis() + 40L;
    }

    private static void restoreCurrentItem(Minecraft mc) {
        if (mc.thePlayer == null) return;
        if (currentItemSwapped && currentContainerSlot >= 0) {
            mc.playerController.windowClick(mc.thePlayer.openContainer.windowId,
                    currentContainerSlot, originalHotbarSlot, 2, mc.thePlayer);
            mc.playerController.updateController();
        }
        currentItemSwapped = false;
        restoreSelectedSlot(mc);
    }

    private static void restoreSelectedSlot(Minecraft mc) {
        if (mc.thePlayer != null) mc.thePlayer.inventory.currentItem = originalHotbarSlot;
        if (mc.thePlayer != null) mc.playerController.updateController();
        if (mc.thePlayer != null) mc.entityRenderer.itemRenderer.resetEquippedProgress();
    }

    private static int toInventoryIndex(int configuredSlot) {
        return configuredSlot <= 27 ? configuredSlot + 8 : configuredSlot - 28;
    }

    private static int restoreLegacySlotMapping(int currentSlot) {
        return currentSlot <= 9 ? currentSlot + 27 : currentSlot - 9;
    }

    private static int containerSlot(int inventoryIndex) {
        return inventoryIndex < 9 ? 36 + inventoryIndex : inventoryIndex;
    }

    public static boolean isValidSlot(int slot) { return slot >= 1 && slot <= 36; }

    private static void showMessage(String message) {
        Minecraft mc = Minecraft.getMinecraft();
        if (mc.thePlayer != null) {
            mc.thePlayer.addChatMessage(new net.minecraft.util.ChatComponentText(
                    "[AnnthModCD] " + message));
        }
    }

    private static File storageFile() {
        return new File(new File(Minecraft.getMinecraft().mcDataDir, "config"),
                "annthmodcd-heal.properties");
    }
}
