package com.rpgclient.cooldown;

import net.minecraft.item.ItemStack;

public class CooldownEntry {
    private final String id;
    private String fingerprint;
    private String identityFingerprint;
    private String baseIdentityFingerprint;
    private ItemStack sample;
    private double seconds;
    private long cooldownUntil;

    public CooldownEntry(String id, double seconds, ItemStack sample) {
        this.id = id;
        this.seconds = seconds;
        this.sample = sample.copy();
        this.fingerprint = CooldownManager.fingerprint(sample);
        this.identityFingerprint = CooldownManager.identityFingerprint(sample);
        this.baseIdentityFingerprint = CooldownManager.baseIdentityFingerprint(sample);
    }

    public String getId() {
        return id;
    }

    public String getFingerprint() {
        return fingerprint;
    }

    public String getIdentityFingerprint() {
        return identityFingerprint;
    }

    public String getBaseIdentityFingerprint() {
        return baseIdentityFingerprint;
    }

    public ItemStack getSample() {
        return sample;
    }

    public double getSeconds() {
        return seconds;
    }

    public void setSeconds(double seconds) {
        this.seconds = Math.max(0.1D, Math.min(500.0D, seconds));
    }

    public void updateItem(ItemStack item) {
        this.sample = item.copy();
        this.fingerprint = CooldownManager.fingerprint(item);
        this.identityFingerprint = CooldownManager.identityFingerprint(item);
        this.baseIdentityFingerprint = CooldownManager.baseIdentityFingerprint(item);
    }

    public boolean isOnCooldown() {
        return System.currentTimeMillis() < cooldownUntil;
    }

    public void startCooldown() {
        cooldownUntil = System.currentTimeMillis() + Math.round(seconds * 1000.0D);
    }

    public void cancelCooldown() {
        cooldownUntil = 0L;
    }

    public long getCooldownRemainingMillis() {
        if (!isOnCooldown()) {
            return 0L;
        }
        return cooldownUntil - System.currentTimeMillis();
    }
}
