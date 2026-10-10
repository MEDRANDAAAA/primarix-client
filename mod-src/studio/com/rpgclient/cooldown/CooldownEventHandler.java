package com.rpgclient.cooldown;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiScreen;
import net.minecraft.client.renderer.GlStateManager;
import net.minecraft.client.renderer.OpenGlHelper;
import net.minecraft.entity.EntityLivingBase;
import net.minecraft.potion.Potion;
import net.minecraft.potion.PotionEffect;
import net.minecraft.item.ItemStack;
import net.minecraft.util.MovingObjectPosition;
import net.minecraft.util.ResourceLocation;
import net.minecraftforge.event.entity.player.PlayerInteractEvent;
import net.minecraftforge.fml.common.eventhandler.Event;
import net.minecraftforge.fml.common.eventhandler.SubscribeEvent;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

public class CooldownEventHandler {
    private static final ResourceLocation HUD_ICONS =
            new ResourceLocation("textures/gui/icons.png");
    private static GuiScreen pendingScreen;
        private static final List<PendingAttempt> pendingAttempts =
                new ArrayList<PendingAttempt>();
            private static Map<Integer, EntityState> lastTickStates;

        private static final int EFFECT_CHECK_TICKS = 40;
        private static final int SNAPSHOT_INTERVAL = 5;
    private static int snapshotCounter;
    private static int lastEntityCount = -1;

    public static void openNextTick(GuiScreen screen) {
        pendingScreen = screen;
    }

    @SubscribeEvent
    public void onPlayerInteract(PlayerInteractEvent event) {
        Minecraft mc = Minecraft.getMinecraft();
        if (event.entity != mc.thePlayer || mc.thePlayer == null
                || mc.currentScreen != null || event.isCanceled()
                || event.useItem == Event.Result.DENY
                || (event.action != PlayerInteractEvent.Action.RIGHT_CLICK_AIR
                && event.action != PlayerInteractEvent.Action.RIGHT_CLICK_BLOCK)) {
            return;
        }
        ItemStack held = mc.thePlayer.getHeldItem();
        CooldownEntry entry = CooldownManager.findInAnyCategory(held);
        if (entry != null && !entry.isOnCooldown()) {
            requestCooldown(entry, held, mc.thePlayer.inventory.currentItem);
        }
    }

    public static void requestCooldown(CooldownEntry entry, ItemStack item) {
        Minecraft mc = Minecraft.getMinecraft();
        int hotbarSlot = mc.thePlayer == null ? -1 : mc.thePlayer.inventory.currentItem;
        requestCooldown(entry, item, hotbarSlot);
    }

    public static void requestCooldown(CooldownEntry entry, ItemStack item, int inventorySlot) {
        Minecraft mc = Minecraft.getMinecraft();
        if (mc.thePlayer == null || entry == null || item == null
                || entry.isOnCooldown() || inventorySlot < 0 || inventorySlot >= 36) {
            return;
        }
        for (PendingAttempt attempt : pendingAttempts) {
            if (attempt.entry == entry) return;
        }

        Map<Integer, Integer> watchedEntities = new HashMap<Integer, Integer>();
        watchedEntities.put(mc.thePlayer.getEntityId(), mc.thePlayer.getEntityId());
        MovingObjectPosition mouseOver = mc.objectMouseOver;
        if (mouseOver != null && mouseOver.entityHit instanceof EntityLivingBase) {
            EntityLivingBase target = (EntityLivingBase) mouseOver.entityHit;
            watchedEntities.put(target.getEntityId(), target.getEntityId());
        }
        Map<Integer, EntityState> baseline = snapshotStates(mc);
        pendingAttempts.add(new PendingAttempt(entry, baseline, watchedEntities,
            inventorySlot, item,
            CooldownManager.find(item, CooldownManager.Category.ABSORPTION) == entry,
            EFFECT_CHECK_TICKS));
    }

    @SubscribeEvent
    public void onClientTick(net.minecraftforge.fml.common.gameevent.TickEvent.ClientTickEvent event) {
        if (event.phase != net.minecraftforge.fml.common.gameevent.TickEvent.Phase.END) {
            return;
        }
        Minecraft mc = Minecraft.getMinecraft();

        HealManager.tick();

        if (mc.thePlayer != null && !pendingAttempts.isEmpty()) {
            confirmPendingAttempts(mc);
            removeExpiredAttempts();
        }

        AbsorptionManager.tick();

        if (mc.theWorld != null && mc.thePlayer != null) {
            int currentEntityCount = mc.theWorld.loadedEntityList.size();
            if (currentEntityCount != lastEntityCount) {
                lastEntityCount = currentEntityCount;
                lastTickStates = snapshotStates(mc);
            }
        }

        if (pendingScreen != null && mc.thePlayer != null && mc.currentScreen == null) {
            GuiScreen screen = pendingScreen;
            pendingScreen = null;
            mc.displayGuiScreen(screen);
        }
    }

    @SubscribeEvent
    public void onRenderGameOverlay(
            net.minecraftforge.client.event.RenderGameOverlayEvent.Post event) {
        if (event.type != net.minecraftforge.client.event.RenderGameOverlayEvent.ElementType.HEALTH) {
            return;
        }
        Minecraft mc = Minecraft.getMinecraft();
        if (mc.thePlayer != null) {
            String status = AbsorptionManager.isEnabled() ? "Abs: ON" : "Abs: OFF";
            int color = AbsorptionManager.isEnabled() ? 0xFF55DD66 : 0xFFFF6666;
            int x = (event.resolution.getScaledWidth()
                    - mc.fontRendererObj.getStringWidth(status)) / 2;
            try {
                mc.fontRendererObj.drawStringWithShadow(status, x, 3, color);
            } finally {
                GlStateManager.setActiveTexture(OpenGlHelper.defaultTexUnit);
                mc.getTextureManager().bindTexture(HUD_ICONS);
                GlStateManager.color(1.0F, 1.0F, 1.0F, 1.0F);
            }
        }
    }

    private static void confirmPendingAttempts(Minecraft mc) {
        boolean absorptionConfirmed = false;
        for (int index = pendingAttempts.size() - 1; index >= 0; index--) {
            PendingAttempt attempt = pendingAttempts.get(index);
            if (attempt.age < 1 && !attempt.absorptionItem) continue;
            if (attempt.absorptionItem && absorptionConfirmed) continue;
            boolean confirmed;
            if (attempt.absorptionItem) {
                confirmed = absorptionEffectConfirmed(mc, attempt)
                        || attempt.itemWasConsumedOrDamaged(mc);
            } else {
                confirmed = attempt.wasItemConsumedOrDamaged(mc)
                        || stateWasChanged(mc, attempt)
                        || attempt.age >= 1;
            }
            if (!confirmed) continue;
            pendingAttempts.remove(index);
            attempt.entry.startCooldown();
            absorptionConfirmed |= attempt.absorptionItem;
        }
        if (absorptionConfirmed) {
            Iterator<PendingAttempt> attempts = pendingAttempts.iterator();
            while (attempts.hasNext()) {
                if (attempts.next().absorptionItem) {
                    attempts.remove();
                }
            }
        }
    }

    private static void removeExpiredAttempts() {
        Iterator<PendingAttempt> attempts = pendingAttempts.iterator();
        while (attempts.hasNext()) {
            PendingAttempt attempt = attempts.next();
            attempt.age++;
            if (--attempt.ticks <= 0) {
                attempts.remove();
            }
        }
    }

    private static Map<Integer, EntityState> snapshotStates(Minecraft mc) {
        Map<Integer, EntityState> states = new HashMap<Integer, EntityState>();
        for (Object entityObject : mc.theWorld.loadedEntityList) {
            if (!(entityObject instanceof EntityLivingBase)) {
                continue;
            }
            EntityLivingBase entity = (EntityLivingBase) entityObject;
            if (entity.getDistanceSqToEntity(mc.thePlayer) > 32.0D * 32.0D) {
                continue;
            }
            Map<Integer, PotionState> entityEffects = new HashMap<Integer, PotionState>();
            for (Object effectObject : entity.getActivePotionEffects()) {
                PotionEffect effect = (PotionEffect) effectObject;
                entityEffects.put(effect.getPotionID(),
                        new PotionState(effect.getDuration(), effect.getAmplifier()));
            }
            states.put(entity.getEntityId(), new EntityState(entity.getHealth(),
                    entity.getAbsorptionAmount(), entityEffects));
        }
        return states;
    }

    private static boolean stateWasChanged(Minecraft mc,
            Map<Integer, EntityState> previousStates,
            Map<Integer, Integer> watchedEntities) {
        for (Object entityObject : mc.theWorld.loadedEntityList) {
            if (!(entityObject instanceof EntityLivingBase)) {
                continue;
            }
            EntityLivingBase entity = (EntityLivingBase) entityObject;
            if (!watchedEntities.containsKey(entity.getEntityId())) {
                continue;
            }
            if (entity.getDistanceSqToEntity(mc.thePlayer) > 32.0D * 32.0D) {
                continue;
            }
            EntityState previousState = previousStates.get(entity.getEntityId());
            if (previousState == null) {
                continue;
            }
            if (Math.abs(entity.getHealth() - previousState.health) > 0.05F) {
                return true;
            }
            if (Math.abs(entity.getAbsorptionAmount() - previousState.absorption) > 0.05F) {
                return true;
            }
            if (effectsWereApplied(entity, previousState)) return true;
        }
        return false;
    }

    private static boolean stateWasChanged(Minecraft mc, PendingAttempt attempt) {
        if (!attempt.absorptionItem) {
            return stateWasChanged(mc, attempt.states, attempt.watchedEntities);
        }
        if (mc.thePlayer == null) return false;
        EntityState previousState = attempt.states.get(mc.thePlayer.getEntityId());
        if (previousState == null) return false;
        return mc.thePlayer.getAbsorptionAmount() > previousState.absorption + 0.05F
            || absorptionEffectWasApplied(mc.thePlayer, previousState);
    }

    private static boolean absorptionEffectConfirmed(Minecraft mc, PendingAttempt attempt) {
        if (mc.thePlayer == null) return false;
        EntityState previousState = attempt.states.get(mc.thePlayer.getEntityId());
        if (previousState == null) return false;
        if (mc.thePlayer.getAbsorptionAmount() > previousState.absorption + 0.05F) {
            return true;
        }
        int absorptionId = Potion.absorption.getId();
        for (Object effectObject : mc.thePlayer.getActivePotionEffects()) {
            PotionEffect effect = (PotionEffect) effectObject;
            if (effect.getPotionID() != absorptionId) continue;
            PotionState previous = previousState.effects == null
                ? null : previousState.effects.get(absorptionId);
            if (previous == null || effect.getDuration() > previous.duration + 1
                || effect.getAmplifier() > previous.amplifier) return true;
        }
        return false;
    }

    private static boolean absorptionEffectWasApplied(EntityLivingBase entity,
            EntityState previousState) {
        int absorptionId = Potion.absorption.getId();
        for (Object effectObject : entity.getActivePotionEffects()) {
            PotionEffect effect = (PotionEffect) effectObject;
            if (effect.getPotionID() != absorptionId) continue;
            PotionState previous = previousState.effects == null
                ? null : previousState.effects.get(absorptionId);
            if (previous == null || effect.getDuration() > previous.duration + 1
                || effect.getAmplifier() > previous.amplifier) return true;
        }
        return false;
    }

    private static boolean effectsWereApplied(EntityLivingBase entity, EntityState previousState) {
        for (Object effectObject : entity.getActivePotionEffects()) {
            PotionEffect effect = (PotionEffect) effectObject;
            PotionState previous = previousState.effects == null
                    ? null : previousState.effects.get(effect.getPotionID());
            if (previous == null || effect.getDuration() > previous.duration + 1
                    || effect.getAmplifier() > previous.amplifier) {
                return true;
            }
        }
        return false;
    }

    private static class PotionState {
        private final int duration;
        private final int amplifier;

        private PotionState(int duration, int amplifier) {
            this.duration = duration;
            this.amplifier = amplifier;
        }
    }

    private static class EntityState {
        private final float health;
        private final float absorption;
        private final Map<Integer, PotionState> effects;

        private EntityState(float health, float absorption,
                Map<Integer, PotionState> effects) {
            this.health = health;
            this.absorption = absorption;
            this.effects = effects;
        }
    }

    private static class PendingAttempt {
        private final CooldownEntry entry;
        private final Map<Integer, EntityState> states;
        private final Map<Integer, Integer> watchedEntities;
        private final int hotbarSlot;
        private final String itemIdentity;
        private final int initialStackSize;
        private final int initialDamage;
        private final boolean absorptionItem;
        private int age;
        private int ticks;

        private PendingAttempt(CooldownEntry entry,
                Map<Integer, EntityState> states,
                Map<Integer, Integer> watchedEntities, int hotbarSlot,
                ItemStack item, boolean absorptionItem, int ticks) {
            this.entry = entry;
            this.states = states;
            this.watchedEntities = watchedEntities;
            this.hotbarSlot = hotbarSlot;
            this.itemIdentity = CooldownManager.identityFingerprint(item);
            this.initialStackSize = item.stackSize;
            this.initialDamage = item.getItemDamage();
            this.absorptionItem = absorptionItem;
            this.ticks = ticks;
        }

        private boolean wasItemConsumedOrDamaged(Minecraft mc) {
            return itemWasConsumedOrDamaged(mc) || age >= 2;
        }

        private boolean itemWasConsumedOrDamaged(Minecraft mc) {
            ItemStack current = mc.thePlayer.inventory.getStackInSlot(hotbarSlot);
            if (current == null || current.getItem() == null) {
                return initialStackSize > 0;
            }
            if (!CooldownManager.identityFingerprint(current).equals(itemIdentity)) return false;
            if (current.stackSize < initialStackSize || current.getItemDamage() != initialDamage) {
                return true;
            }
            return false;
        }
    }
}
