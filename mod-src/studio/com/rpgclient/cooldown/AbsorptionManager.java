package com.rpgclient.cooldown;

import net.minecraft.client.Minecraft;
import net.minecraft.entity.player.EntityPlayer;
import net.minecraft.item.ItemStack;
import net.minecraft.util.ChatComponentText;
import org.lwjgl.input.Keyboard;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;

public final class AbsorptionManager {
    private static final Map<String, Configuration> CONFIGURATIONS =
            new LinkedHashMap<String, Configuration>();
    private static final Map<String, Boolean> PREVIOUS_KEYS =
            new LinkedHashMap<String, Boolean>();
    private static boolean loaded;

    private AbsorptionManager() { }

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
            int count = Integer.parseInt(properties.getProperty("instance.count", "0"));
            for (int index = 0; index < count; index++) {
                String prefix = "instance." + index + ".";
                String name = properties.getProperty(prefix + "name", "");
                if (name.isEmpty()) continue;
                Configuration configuration = new Configuration();
                configuration.hotbarSlots.addAll(parseSlots(
                        properties.getProperty(prefix + "hotbar", ""), 1, 9));
                configuration.allInventory = Boolean.parseBoolean(
                        properties.getProperty(prefix + "allInventory", "true"));
                configuration.inventorySlots.addAll(parseSlots(
                        properties.getProperty(prefix + "inventory", ""), 1, 27));
                configuration.toggleKey = Math.max(0, Integer.parseInt(
                        properties.getProperty(prefix + "key", "0")));
                CONFIGURATIONS.put(name, configuration);
            }
        } catch (Exception ignored) {
            CONFIGURATIONS.clear();
        }
    }

    public static void save() {
        if (!loaded) return;
        Properties properties = new Properties();
        properties.setProperty("instance.count", String.valueOf(CONFIGURATIONS.size()));
        int index = 0;
        for (Map.Entry<String, Configuration> entry : CONFIGURATIONS.entrySet()) {
            String prefix = "instance." + index++ + ".";
            Configuration configuration = entry.getValue();
            properties.setProperty(prefix + "name", entry.getKey());
            properties.setProperty(prefix + "hotbar", serialize(configuration.hotbarSlots));
            properties.setProperty(prefix + "allInventory",
                    String.valueOf(configuration.allInventory));
            properties.setProperty(prefix + "inventory", serialize(configuration.inventorySlots));
            properties.setProperty(prefix + "key", String.valueOf(configuration.toggleKey));
        }
        try {
            File file = storageFile();
            File parent = file.getParentFile();
            if (!parent.exists()) parent.mkdirs();
            FileOutputStream output = new FileOutputStream(file);
            properties.store(output, "AnnthModCD Abs configuration");
            output.close();
        } catch (Exception ignored) { }
    }

    public static List<Integer> getHotbarSlots() {
        return new ArrayList<Integer>(activeConfiguration().hotbarSlots);
    }

    public static List<Integer> getInventorySlots() {
        return new ArrayList<Integer>(activeConfiguration().inventorySlots);
    }

    public static boolean isAllInventorySelected() {
        return activeConfiguration().allInventory;
    }

    public static int getToggleKey() {
        return activeConfiguration().toggleKey;
    }

    public static boolean isEnabled() {
        return activeConfiguration().enabled;
    }

    public static void setToggleKey(int key) {
        activeConfiguration().toggleKey = Math.max(0, key);
        save();
    }

    public static void setAllInventorySelected(boolean selected) {
        activeConfiguration().allInventory = selected;
        save();
    }

    public static String saveConfiguration(List<Integer> hotbarSlots,
            boolean allInventory, List<Integer> inventorySlots) {
        String error = validateConfiguration(hotbarSlots, allInventory, inventorySlots);
        if (error != null) return error;
        Configuration configuration = activeConfiguration();
        configuration.hotbarSlots.clear();
        configuration.hotbarSlots.addAll(hotbarSlots);
        configuration.allInventory = allInventory;
        configuration.inventorySlots.clear();
        if (inventorySlots != null) configuration.inventorySlots.addAll(inventorySlots);
        configuration.enabled = false;
        save();
        return null;
    }

    public static String setEnabled(boolean enabled) {
        Configuration configuration = activeConfiguration();
        if (enabled) {
            String error = validateConfiguration(configuration.hotbarSlots,
                    configuration.allInventory, configuration.inventorySlots);
            if (error != null) return error;
        }
        configuration.enabled = enabled;
        save();
        return null;
    }

    public static String toggle() {
        String error = setEnabled(!isEnabled());
        return error;
    }

    public static void tick() {
        Minecraft mc = Minecraft.getMinecraft();
        if (mc.thePlayer == null || mc.theWorld == null) return;
        Configuration configuration = activeConfiguration();
        boolean pressed = configuration.toggleKey > 0
                && Keyboard.isKeyDown(configuration.toggleKey);
        boolean previous = Boolean.TRUE.equals(PREVIOUS_KEYS.get(CooldownManager.getActiveInstanceName()));
        if (mc.currentScreen == null && pressed && !previous) {
            String error = toggle();
            if (error != null) {
                showMessage(error);
            } else {
                showMessage("Abs " + (configuration.enabled ? "activado." : "desactivado."));
            }
        }
        PREVIOUS_KEYS.put(CooldownManager.getActiveInstanceName(), pressed);

        if (!configuration.enabled || mc.currentScreen != null
                || mc.thePlayer.openContainer != mc.thePlayer.inventoryContainer
                || mc.playerController == null) {
            return;
        }
        EntityPlayer player = mc.thePlayer;
        for (Integer hotbarSlot : configuration.hotbarSlots) {
            int hotbarIndex = hotbarSlot - 1;
            ItemStack equipped = player.inventory.getStackInSlot(hotbarIndex);
            CooldownEntry equippedEntry = CooldownManager.find(
                    equipped, CooldownManager.Category.ABSORPTION);
            if (equippedEntry == null || !equippedEntry.isOnCooldown()) continue;
            if (equippedEntry.getCooldownRemainingMillis() > equippedEntry.getSeconds() * 1000 - 50) continue;

            int sourceIndex = findReadyInventoryItem(player, configuration);
            if (sourceIndex < 0) continue;

            mc.playerController.windowClick(player.openContainer.windowId,
                    sourceIndex, hotbarIndex, 2, player);
            mc.playerController.updateController();
            return;
        }
    }

    public static String validateConfiguration(List<Integer> hotbarSlots,
            boolean allInventory, List<Integer> inventorySlots) {
        Minecraft mc = Minecraft.getMinecraft();
        if (mc.thePlayer == null || mc.theWorld == null) {
            return "Entra a un mundo antes de configurar Abs.";
        }
        if (hotbarSlots == null || hotbarSlots.isEmpty() || hotbarSlots.size() > 9) {
            return "Selecciona entre 1 y 9 slots de hotbar.";
        }
        for (int index = 0; index < hotbarSlots.size(); index++) {
            Integer slot = hotbarSlots.get(index);
            if (slot == null || slot < 1 || slot > 9
                    || hotbarSlots.subList(0, index).contains(slot)) {
                return "Los slots de hotbar deben ser unicos y estar entre 1 y 9.";
            }
            ItemStack item = mc.thePlayer.inventory.getStackInSlot(slot - 1);
            if (CooldownManager.find(item, CooldownManager.Category.ABSORPTION) == null) {
                return "El slot de hotbar " + slot + " no tiene un item Abs registrado.";
            }
        }

        EntityPlayer player = mc.thePlayer;
        if (allInventory) {
            for (int inventoryIndex = 9; inventoryIndex < 36; inventoryIndex++) {
                if (CooldownManager.find(player.inventory.getStackInSlot(inventoryIndex),
                        CooldownManager.Category.ABSORPTION) != null) return null;
            }
            return "No hay items Abs registrados en el inventario principal.";
        }
        if (inventorySlots == null || inventorySlots.isEmpty()) {
            return "Selecciona slots del inventario principal.";
        }
        for (int index = 0; index < inventorySlots.size(); index++) {
            Integer slot = inventorySlots.get(index);
            if (slot == null || slot < 1 || slot > 27
                    || inventorySlots.subList(0, index).contains(slot)) {
                return "Los slots de inventario deben ser unicos y estar entre 1 y 27.";
            }
            ItemStack item = player.inventory.getStackInSlot(slot + 8);
            if (CooldownManager.find(item, CooldownManager.Category.ABSORPTION) == null) {
                return "El slot de inventario " + slot + " no tiene un item Abs registrado.";
            }
        }
        return null;
    }

    private static int findReadyInventoryItem(EntityPlayer player, Configuration configuration) {
        int bestIndex = -1;
        long bestRemaining = Long.MAX_VALUE;
        double bestCooldownSeconds = Double.MAX_VALUE;
        List<Integer> sourceSlots = configuration.allInventory
                ? allInventorySlots() : configuration.inventorySlots;
        for (Integer sourceSlot : sourceSlots) {
            int inventoryIndex = sourceSlot + 8;
            ItemStack candidate = player.inventory.getStackInSlot(inventoryIndex);
            CooldownEntry entry = CooldownManager.find(candidate,
                    CooldownManager.Category.ABSORPTION);
            if (entry == null || entry.isOnCooldown()) continue;
            long remaining = entry.getCooldownRemainingMillis();
            if (remaining < bestRemaining
                    || (remaining == bestRemaining && entry.getSeconds() < bestCooldownSeconds)) {
                bestIndex = inventoryIndex;
                bestRemaining = remaining;
                bestCooldownSeconds = entry.getSeconds();
            }
        }
        return bestIndex;
    }

    private static final List<Integer> ALL_INVENTORY_SLOTS;
    static {
        List<Integer> slots = new ArrayList<Integer>();
        for (int slot = 1; slot <= 27; slot++) slots.add(slot);
        ALL_INVENTORY_SLOTS = Collections.unmodifiableList(slots);
    }

    private static List<Integer> allInventorySlots() {
        return ALL_INVENTORY_SLOTS;
    }

    private static Configuration activeConfiguration() {
        if (!loaded) load();
        String name = CooldownManager.getActiveInstanceName();
        Configuration configuration = CONFIGURATIONS.get(name);
        if (configuration == null) {
            configuration = new Configuration();
            CONFIGURATIONS.put(name, configuration);
        }
        return configuration;
    }

    private static void showMessage(String message) {
        Minecraft mc = Minecraft.getMinecraft();
        if (mc.thePlayer != null) {
            mc.thePlayer.addChatMessage(new ChatComponentText("[AnnthModCD] " + message));
        }
    }

    private static List<Integer> parseSlots(String value, int minimum, int maximum) {
        List<Integer> slots = new ArrayList<Integer>();
        if (value == null || value.trim().isEmpty()) return slots;
        for (String part : value.trim().split("[.,;\\s]+")) {
            try {
                int slot = Integer.parseInt(part);
                if (slot >= minimum && slot <= maximum && !slots.contains(slot)) {
                    slots.add(slot);
                }
            } catch (NumberFormatException ignored) { }
        }
        return slots;
    }

    private static String serialize(List<Integer> slots) {
        StringBuilder value = new StringBuilder();
        for (Integer slot : slots) {
            if (value.length() > 0) value.append('.');
            value.append(slot);
        }
        return value.toString();
    }

    private static File storageFile() {
        return new File(new File(Minecraft.getMinecraft().mcDataDir, "config"),
                "annthmodcd-abs.properties");
    }

    private static class Configuration {
        private final List<Integer> hotbarSlots = new ArrayList<Integer>();
        private final List<Integer> inventorySlots = new ArrayList<Integer>();
        private boolean allInventory = true;
        private int toggleKey;
        private boolean enabled;
    }
}