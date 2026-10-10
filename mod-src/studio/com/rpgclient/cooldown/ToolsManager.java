package com.rpgclient.cooldown;

import net.minecraft.client.Minecraft;
import net.minecraft.entity.player.EntityPlayer;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.util.ResourceLocation;
import net.minecraft.nbt.CompressedStreamTools;
import net.minecraft.nbt.NBTTagCompound;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.util.Base64;

public final class ToolsManager {
    private static final Map<String, ToolsProfile> PROFILES =
            new LinkedHashMap<String, ToolsProfile>();
    private static String activeProfile;
    private static boolean enabled;
    private static int swapDelayMs = 100;
    private static boolean loaded;
    private static long dataRevision;

    private ToolsManager() { }

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
            activeProfile = properties.getProperty("active", "");
            enabled = Boolean.parseBoolean(properties.getProperty("enabled", "false"));
                swapDelayMs = Math.max(250, Math.min(1000,
                    Integer.parseInt(properties.getProperty("swap.delay.ms", "100"))));
            int count = Integer.parseInt(properties.getProperty("profile.count", "0"));
            for (int index = 0; index < count; index++) {
                String prefix = "profile." + index + ".";
                String name = properties.getProperty(prefix + "name", "").trim();
                if (name.isEmpty()) continue;
                ToolsProfile profile = new ToolsProfile(name);
                profile.setToggleKey(Integer.parseInt(properties.getProperty(prefix + "key", "0")));
                int itemCount = Integer.parseInt(properties.getProperty(prefix + "item.count", "0"));
                for (int itemIndex = 0; itemIndex < itemCount; itemIndex++) {
                    String encoded = properties.getProperty(prefix + "item." + itemIndex, "");
                    ItemStack item = decodeItem(encoded);
                    if (item == null) {
                        Object legacy = Item.itemRegistry.getObject(new ResourceLocation(encoded));
                        if (legacy instanceof Item) item = new ItemStack((Item) legacy);
                    }
                        if (item != null && profile.addItem(item)) {
                        profile.setItemDelayMs(profile.getItems().size() - 1,
                            Integer.parseInt(properties.getProperty(
                                prefix + "delay." + itemIndex, "1000")));
                        }
                }
                PROFILES.put(name, profile);
            }
        } catch (Exception ignored) {
            PROFILES.clear();
            activeProfile = null;
            enabled = false;
        }
    }

    public static void save() {
        if (!loaded) return;
        dataRevision++;
        Properties properties = new Properties();
        properties.setProperty("active", activeProfile == null ? "" : activeProfile);
        properties.setProperty("enabled", String.valueOf(enabled));
        properties.setProperty("swap.delay.ms", String.valueOf(swapDelayMs));
        properties.setProperty("profile.count", String.valueOf(PROFILES.size()));
        int index = 0;
        for (ToolsProfile profile : PROFILES.values()) {
            String prefix = "profile." + index++ + ".";
            properties.setProperty(prefix + "name", profile.getName());
            properties.setProperty(prefix + "key", String.valueOf(profile.getToggleKey()));
            properties.setProperty(prefix + "item.count", String.valueOf(profile.getItems().size()));
            for (int itemIndex = 0; itemIndex < profile.getItems().size(); itemIndex++) {
                properties.setProperty(prefix + "item." + itemIndex,
                        encodeItem(profile.getItems().get(itemIndex)));
                properties.setProperty(prefix + "delay." + itemIndex,
                    String.valueOf(profile.getItemDelayMs(itemIndex, swapDelayMs)));
            }
        }
        try {
            File file = storageFile();
            file.getParentFile().mkdirs();
            FileOutputStream output = new FileOutputStream(file);
            properties.store(output, "AnnthModCD quick tool profiles");
            output.close();
        } catch (Exception ignored) { }
    }

    public static boolean create(String name) {
        String clean = name == null ? "" : name.trim();
        if (clean.isEmpty() || PROFILES.containsKey(clean)) return false;
        PROFILES.put(clean, new ToolsProfile(clean));
        activeProfile = clean;
        save();
        return true;
    }

    public static boolean addHeldItem(String profileName) {
        ToolsProfile profile = PROFILES.get(profileName);
        Minecraft mc = Minecraft.getMinecraft();
        if (profile == null || mc.thePlayer == null) return false;
        boolean added = profile.addItem(mc.thePlayer.getHeldItem());
        if (added) save();
        return added;
    }

    public static String getItemId(ItemStack stack) {
        if (stack == null || stack.getItem() == null) return null;
        ResourceLocation key = (ResourceLocation) Item.itemRegistry.getNameForObject(stack.getItem());
        return key == null ? null : key.toString();
    }

    public static ToolsProfile getActiveProfile() {
        return activeProfile == null ? null : PROFILES.get(activeProfile);
    }

    public static List<String> getProfileNames() {
        return new ArrayList<String>(PROFILES.keySet());
    }

    public static ToolsProfile getProfile(String name) { return PROFILES.get(name); }

    public static void delete(String name) {
        PROFILES.remove(name);
        if (name != null && name.equals(activeProfile)) {
            activeProfile = PROFILES.isEmpty() ? null : PROFILES.keySet().iterator().next();
            enabled = false;
        }
        save();
    }

    public static void setProfileKey(String name, int key) {
        ToolsProfile profile = PROFILES.get(name);
        if (profile != null) {
            profile.setToggleKey(key);
            save();
        }
    }

    public static void toggleProfile(String name) {
        if (!PROFILES.containsKey(name)) return;
        boolean sameProfile = name.equals(activeProfile);
        activeProfile = name;
        enabled = sameProfile ? !enabled : true;
        save();
        ToolsEventHandler.showStatus(name + ": " + (enabled ? "On" : "Off"));
    }

    public static void use(String name) {
        if (PROFILES.containsKey(name)) {
            activeProfile = name;
            save();
        }
    }

    public static boolean isEnabled() { return enabled; }

    public static long getDataRevision() { return dataRevision; }

    public static int getSwapDelayMs() { return swapDelayMs; }

    public static void setSwapDelayMs(int delayMs) {
        swapDelayMs = Math.max(250, Math.min(1000, delayMs));
        save();
    }

    public static void setItemDelayMs(String profileName, int index, int delayMs) {
        ToolsProfile profile = PROFILES.get(profileName);
        if (profile != null) {
            profile.setItemDelayMs(index, delayMs);
            save();
        }
    }

    public static int getHeldDelayMs(EntityPlayer player) {
        ToolsProfile profile = getActiveProfile();
        if (profile == null || player == null) return swapDelayMs;
        ItemStack held = player.inventory.getStackInSlot(player.inventory.currentItem);
        if (held == null || held.getItem() == null) return swapDelayMs;
        for (int index = 0; index < profile.getItems().size(); index++) {
            ItemStack registered = profile.getItems().get(index);
            if (registered != null && registered.getItem() != null
                    && CooldownManager.identityFingerprint(registered).equals(
                    CooldownManager.identityFingerprint(held))) {
                return profile.getItemDelayMs(index, swapDelayMs);
            }
        }
        return swapDelayMs;
    }

    public static void setEnabled(boolean value) {
        enabled = value;
        save();
    }

    public static void toggleEnabled() {
        setEnabled(!enabled);
        ToolsProfile profile = getActiveProfile();
        ToolsEventHandler.showStatus((profile == null ? "Tools" : profile.getName())
                + ": " + (enabled ? "On" : "Off"));
    }

    public static boolean isRegistered(ItemStack stack) {
        ToolsProfile profile = getActiveProfile();
        if (profile == null || stack == null || stack.getItem() == null) return false;
        String identity = CooldownManager.identityFingerprint(stack);
        for (ItemStack registered : profile.getItems()) {
            if (registered != null && registered.getItem() != null
                    && CooldownManager.identityFingerprint(registered).equals(identity)) return true;
        }
        return false;
    }

    public static boolean quickSwap(EntityPlayer player) {
        if (!enabled || player == null || player.openContainer != player.inventoryContainer) return false;
        ToolsProfile profile = getActiveProfile();
        if (profile == null || profile.getItems().isEmpty()) return false;
        int current = player.inventory.currentItem;
        ItemStack held = player.inventory.getStackInSlot(current);
        if (!isInProfile(profile, held)) return false;

        String heldIdentity = CooldownManager.identityFingerprint(held);
        int heldProfileIndex = -1;
        for (int profileIndex = 0; profileIndex < profile.getItems().size(); profileIndex++) {
            ItemStack registered = profile.getItems().get(profileIndex);
            if (registered != null && registered.getItem() != null
                    && CooldownManager.identityFingerprint(registered).equals(heldIdentity)) {
                heldProfileIndex = profileIndex;
                break;
            }
        }
        if (heldProfileIndex < 0) return false;

        for (int offset = 1; offset < profile.getItems().size(); offset++) {
            ItemStack nextRegistered = profile.getItems().get(
                    (heldProfileIndex + offset) % profile.getItems().size());
            if (nextRegistered == null || nextRegistered.getItem() == null) continue;
            String nextIdentity = CooldownManager.identityFingerprint(nextRegistered);
            for (int inventoryIndex = 0;
                    inventoryIndex < player.inventory.getSizeInventory(); inventoryIndex++) {
                ItemStack candidate = player.inventory.getStackInSlot(inventoryIndex);
                if (inventoryIndex != current && candidate != null && candidate.getItem() != null
                        && CooldownManager.identityFingerprint(candidate).equals(nextIdentity)) {
                    int target = inventoryIndex < 9 ? 36 + inventoryIndex : inventoryIndex;
                    Minecraft.getMinecraft().playerController.windowClick(
                            0, target, current, 2, player);
                    Minecraft.getMinecraft().playerController.updateController();
                    return true;
                }
            }
        }
        return false;
    }

    private static boolean isInProfile(ToolsProfile profile, ItemStack stack) {
        if (stack == null || stack.getItem() == null) return false;
        String identity = CooldownManager.identityFingerprint(stack);
        for (ItemStack registered : profile.getItems()) {
            if (registered != null && registered.getItem() != null
                    && CooldownManager.identityFingerprint(registered).equals(identity)) return true;
        }
        return false;
    }

    private static String encodeItem(ItemStack item) {
        try {
            NBTTagCompound tag = new NBTTagCompound();
            item.writeToNBT(tag);
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            CompressedStreamTools.writeCompressed(tag, output);
            return Base64.getEncoder().encodeToString(output.toByteArray());
        } catch (Exception ignored) {
            return "";
        }
    }

    private static ItemStack decodeItem(String encoded) {
        try {
            byte[] bytes = Base64.getDecoder().decode(encoded);
                NBTTagCompound tag;
                try {
                    tag = CompressedStreamTools.readCompressed(new ByteArrayInputStream(bytes));
                } catch (Exception compressedFailure) {
                    tag = CompressedStreamTools.read(
                            new DataInputStream(new ByteArrayInputStream(bytes)));
                }
            return ItemStack.loadItemStackFromNBT(tag);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static File storageFile() {
        return new File(new File(Minecraft.getMinecraft().mcDataDir, "config"),
                "annthmodcd-tools.properties");
    }
}