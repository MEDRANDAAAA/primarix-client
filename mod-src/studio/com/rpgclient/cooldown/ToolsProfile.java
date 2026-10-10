package com.rpgclient.cooldown;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.item.ItemStack;

public class ToolsProfile {
    private final String name;
    private final List<ItemStack> items = new ArrayList<ItemStack>();
    private final List<Integer> itemDelaysMs = new ArrayList<Integer>();
    private int toggleKey;

    public ToolsProfile(String name) {
        this.name = name;
    }

    public String getName() { return name; }

    public List<ItemStack> getItems() { return items; }

    public int getToggleKey() { return toggleKey; }

    public void setToggleKey(int toggleKey) { this.toggleKey = Math.max(0, toggleKey); }

    public boolean addItem(ItemStack item) {
        if (item == null || item.getItem() == null) {
            return false;
        }
        String identity = CooldownManager.identityFingerprint(item);
        for (ItemStack stored : items) {
            if (CooldownManager.identityFingerprint(stored).equals(identity)) return false;
        }
        items.add(item.copy());
        itemDelaysMs.add(1000);
        return true;
    }

    public int getItemDelayMs(int index, int fallback) {
        if (index < 0 || index >= itemDelaysMs.size()) return fallback;
        return itemDelaysMs.get(index);
    }

    public void setItemDelayMs(int index, int delayMs) {
        if (index < 0 || index >= items.size()) return;
        while (itemDelaysMs.size() < items.size()) itemDelaysMs.add(1000);
        itemDelaysMs.set(index, Math.max(250, Math.min(10000, delayMs)));
    }

    public boolean removeItem(int index) {
        if (index < 0 || index >= items.size()) return false;
        items.remove(index);
        if (index < itemDelaysMs.size()) itemDelaysMs.remove(index);
        return true;
    }
}