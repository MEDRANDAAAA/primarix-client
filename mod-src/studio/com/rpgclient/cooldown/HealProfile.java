package com.rpgclient.cooldown;

import java.util.ArrayList;
import java.util.List;

public class HealProfile {
    private final String name;
    private int triggerKey;
    private int firstSlot = 1;
    private int secondSlot = 2;
    private final List<Integer> slots = new ArrayList<Integer>();

    public HealProfile(String name) {
        this.name = name;
    }

    public String getName() { return name; }
    public int getTriggerKey() { return triggerKey; }
    public void setTriggerKey(int triggerKey) { this.triggerKey = Math.max(0, triggerKey); }
    public int getFirstSlot() { return firstSlot; }
    public void setFirstSlot(int firstSlot) { this.firstSlot = firstSlot; }
    public int getSecondSlot() { return secondSlot; }
    public void setSecondSlot(int secondSlot) { this.secondSlot = secondSlot; }

    public List<Integer> getSlots() {
        if (slots.isEmpty()) {
            slots.add(firstSlot);
            if (secondSlot != firstSlot) slots.add(secondSlot);
        }
        return slots;
    }

    public void setSlots(List<Integer> values) {
        slots.clear();
        if (values != null) slots.addAll(values);
        if (!slots.isEmpty()) firstSlot = slots.get(0);
        if (slots.size() > 1) secondSlot = slots.get(1);
    }

    public void addSlot(int slot) { slots.add(slot); }
    public void removeSlot(int index) { slots.remove(index); }
}
