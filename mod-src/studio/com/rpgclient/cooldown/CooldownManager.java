package com.rpgclient.cooldown;

import net.minecraft.client.Minecraft;
import net.minecraft.item.ItemStack;
import net.minecraft.nbt.CompressedStreamTools;
import net.minecraft.nbt.NBTTagCompound;
import net.minecraft.nbt.NBTTagList;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.io.File;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Base64;
import java.util.regex.Pattern;

public final class CooldownManager {
    private static final String DEFAULT_INSTANCE = "Principal";
    private static final Map<String, Map<String, CooldownEntry>> INSTANCES =
            new LinkedHashMap<String, Map<String, CooldownEntry>>();
        private static final Map<String, Map<String, CooldownEntry>> ABSORPTIONS =
            new LinkedHashMap<String, Map<String, CooldownEntry>>();
        private static final Map<String, Map<String, CooldownEntry>> HEALS =
            new LinkedHashMap<String, Map<String, CooldownEntry>>();
    private static String activeInstance = DEFAULT_INSTANCE;
    private static boolean loaded;
    private static boolean lastSaveSuccessful = true;
    private static long dataRevision;

    public enum Category {
        COOLDOWN,
        ABSORPTION,
        HEAL
    }

    private CooldownManager() {
    }

    public static void register(String id, double seconds, ItemStack item) {
        register(Category.COOLDOWN, id, seconds, item);
    }

    public static void register(Category category, String id, double seconds, ItemStack item) {
        ensureLoaded();
        if (item == null || item.getItem() == null) {
            return;
        }
        String cleanId = id == null ? "" : id.trim();
        if (cleanId.isEmpty()) {
            return;
        }
        String key = cleanId.toLowerCase(Locale.ROOT);
        Map<String, CooldownEntry> entries = activeEntries(category);
        CooldownEntry old = entries.get(key);
        if (old == null) {
            entries.put(key, new CooldownEntry(cleanId, seconds, item));
        } else {
            old.setSeconds(seconds);
            old.updateItem(item);
        }
        dataRevision++;
        save();
    }

    public static void delete(String id) {
        delete(Category.COOLDOWN, id);
    }

    public static void delete(Category category, String id) {
        ensureLoaded();
        if (id == null) {
            return;
        }
        if (activeEntries(category).remove(id.toLowerCase(Locale.ROOT)) != null) {
            dataRevision++;
        }
        save();
    }

    public static List<CooldownEntry> getEntries() {
        return getEntries(Category.COOLDOWN);
    }

    public static List<CooldownEntry> getEntries(Category category) {
        ensureLoaded();
        return Collections.unmodifiableList(
                new ArrayList<CooldownEntry>(activeEntries(category).values()));
    }

    public static List<String> getInstanceNames() {
        ensureLoaded();
        return Collections.unmodifiableList(new ArrayList<String>(INSTANCES.keySet()));
    }

    public static String getActiveInstanceName() {
        ensureLoaded();
        return activeInstance;
    }

    public static long getDataRevision() {
        ensureLoaded();
        return dataRevision;
    }

    public static boolean wasLastSaveSuccessful() {
        return lastSaveSuccessful;
    }

    public static String getStoragePath() {
        return storageFile().getAbsolutePath();
    }

    public static boolean createInstance(String name) {
        ensureLoaded();
        String cleanName = name == null ? "" : name.trim();
        if (cleanName.isEmpty() || INSTANCES.containsKey(cleanName)) {
            return false;
        }
        createEmptyInstance(cleanName);
        activeInstance = cleanName;
        dataRevision++;
        save();
        return true;
    }

    public static void useInstance(String name) {
        ensureLoaded();
        if (name != null && INSTANCES.containsKey(name)) {
            if (!name.equals(activeInstance)) {
                activeInstance = name;
                dataRevision++;
            }
            save();
        }
    }

    public static void deleteInstance(String name) {
        ensureLoaded();
        if (name == null || !INSTANCES.containsKey(name) || INSTANCES.size() <= 1) {
            return;
        }
        INSTANCES.remove(name);
        ABSORPTIONS.remove(name);
        HEALS.remove(name);
        dataRevision++;
        if (name.equals(activeInstance)) {
            activeInstance = INSTANCES.keySet().iterator().next();
        }
        save();
    }

    public static CooldownEntry find(ItemStack item) {
        return find(item, Category.COOLDOWN);
    }

    public static CooldownEntry findInAnyCategory(ItemStack item) {
        CooldownEntry entry = find(item, Category.ABSORPTION);
        if (entry != null) return entry;
        entry = find(item, Category.HEAL);
        return entry != null ? entry : find(item, Category.COOLDOWN);
    }

    public static CooldownEntry find(ItemStack item, Category category) {
        ensureLoaded();
        if (item == null || item.getItem() == null) {
            return null;
        }
        String fallback = identityFingerprint(item);
        for (CooldownEntry entry : activeEntries(category).values()) {
            if (entry.getIdentityFingerprint().equals(fallback)) {
                return entry;
            }
        }
        String baseIdentity = baseIdentityFingerprint(item);
        CooldownEntry compatible = null;
        for (CooldownEntry entry : activeEntries(category).values()) {
            if (entry.getBaseIdentityFingerprint().equals(baseIdentity)) {
                if (compatible != null) {
                    return null;
                }
                compatible = entry;
            }
        }
        if (compatible != null) {
            return compatible;
        }
        String fingerprint = fingerprint(item);
        for (CooldownEntry entry : activeEntries(category).values()) {
            if (entry.getFingerprint().equals(fingerprint)) {
                return entry;
            }
        }
        return null;
    }

    public static String baseIdentityFingerprint(ItemStack item) {
        StringBuilder result = new StringBuilder();
        result.append(item.getItem().getClass().getName()).append('|');
        result.append(stableMetadata(item)).append('|');
        NBTTagCompound display = item.getTagCompound() == null
                ? null : item.getTagCompound().getCompoundTag("display");
        if (display != null && display.hasKey("Name")) {
            result.append(normalize(display.getString("Name")));
        }
        return result.toString();
    }

    public static String fingerprint(ItemStack item) {
        StringBuilder result = new StringBuilder();
        result.append(item.getItem().getClass().getName()).append('|');
        result.append(stableMetadata(item)).append('|');
        result.append(stableTag(item).toString());
        return result.toString();
    }

    public static String identityFingerprint(ItemStack item) {
        StringBuilder result = new StringBuilder();
        result.append(item.getItem().getClass().getName()).append('|');
        result.append(stableMetadata(item)).append('|');
        NBTTagCompound display = item.getTagCompound() == null
                ? null : item.getTagCompound().getCompoundTag("display");
        if (display != null && display.hasKey("Name")) {
            result.append(normalize(display.getString("Name")));
        }
        if (display != null && display.hasKey("Lore")) {
            NBTTagList lore = display.getTagList("Lore", 8);
            for (int index = 0; index < lore.tagCount(); index++) {
                String line = lore.getStringTagAt(index);
                if (!isDynamicLore(line)) {
                    result.append('|').append(normalize(line));
                }
            }
        }
        return result.toString();
    }


    private static int stableMetadata(ItemStack item) {
        return item.isItemStackDamageable() ? 0 : item.getMetadata();
    }

    private static NBTTagCompound stableTag(ItemStack item) {
        NBTTagCompound source = item.getTagCompound();
        NBTTagCompound stable = new NBTTagCompound();
        if (source == null) {
            return stable;
        }
        for (String key : source.getKeySet()) {
            if (!"display".equals(key)) {
                stable.setTag(key, source.getTag(key).copy());
            }
        }
        if (source.hasKey("display")) {
            NBTTagCompound sourceDisplay = source.getCompoundTag("display");
            NBTTagCompound stableDisplay = new NBTTagCompound();
            if (sourceDisplay.hasKey("Name")) {
                stableDisplay.setTag("Name", sourceDisplay.getTag("Name").copy());
            }
            if (sourceDisplay.hasKey("Lore")) {
                NBTTagList sourceLore = sourceDisplay.getTagList("Lore", 8);
                NBTTagList stableLore = new NBTTagList();
                for (int index = 0; index < sourceLore.tagCount(); index++) {
                    String line = sourceLore.getStringTagAt(index);
                    if (!isDynamicLore(line)) {
                        stableLore.appendTag(new net.minecraft.nbt.NBTTagString(line));
                    }
                }
                stableDisplay.setTag("Lore", stableLore);
            }
            stable.setTag("display", stableDisplay);
        }
        return stable;
    }

    private static boolean isDynamicLore(String line) {
        String normalized = normalize(line);
        return normalized.contains("capacidad de resistir")
                && (normalized.contains("golpe") || normalized.contains("hit"))
                && normalized.matches(".*[0-9].*");
    }

    private static final Pattern COLOR_PATTERN = Pattern.compile("\\u00a7.");
    private static final Pattern WHITESPACE_PATTERN = Pattern.compile("\\s+");

    private static String normalize(String text) {
        if (text == null) {
            return "";
        }
        return WHITESPACE_PATTERN.matcher(
                COLOR_PATTERN.matcher(text).replaceAll(""))
                .replaceAll(" ")
                .trim()
                .toLowerCase(Locale.ROOT);
    }

    public static void clear() {
        ensureLoaded();
        if (!activeEntries().isEmpty()) {
            activeEntries().clear();
            dataRevision++;
        }
    }

    public static void load() {
        if (loaded) {
            return;
        }
        loaded = true;
        INSTANCES.clear();
        ABSORPTIONS.clear();
        HEALS.clear();
        File file = storageFile();
        if (!file.isFile()) {
            createEmptyInstance(DEFAULT_INSTANCE);
            dataRevision++;
            return;
        }
        boolean migrateExistingEntries = false;
        try {
            NBTTagCompound root = CompressedStreamTools.read(file);
            migrateExistingEntries = !root.getBoolean("categoriesMigrated");
            if (root.hasKey("instances")) {
                NBTTagCompound instances = root.getCompoundTag("instances");
                activeInstance = root.getString("activeInstance");
                for (String instanceName : instances.getKeySet()) {
                    NBTTagCompound instance = instances.getCompoundTag(instanceName);
                    if (instance.hasKey("cooldowns", 10)
                            || instance.hasKey("absorptions", 10)
                            || instance.hasKey("heals", 10)) {
                        INSTANCES.put(instanceName, readEntries(instance.getCompoundTag("cooldowns")));
                        ABSORPTIONS.put(instanceName,
                                readEntries(instance.getCompoundTag("absorptions")));
                        HEALS.put(instanceName, readEntries(instance.getCompoundTag("heals")));
                    } else {
                        INSTANCES.put(instanceName, readEntries(instance));
                        ABSORPTIONS.put(instanceName, new LinkedHashMap<String, CooldownEntry>());
                        HEALS.put(instanceName, new LinkedHashMap<String, CooldownEntry>());
                    }
                }
            } else {
                createEmptyInstance(DEFAULT_INSTANCE);
                INSTANCES.put(DEFAULT_INSTANCE, readEntries(root));
                activeInstance = DEFAULT_INSTANCE;
            }
        } catch (Exception ignored) {
            INSTANCES.clear();
            ABSORPTIONS.clear();
            HEALS.clear();
        }
        if (INSTANCES.isEmpty()) {
            createEmptyInstance(DEFAULT_INSTANCE);
        }
        if (!INSTANCES.containsKey(activeInstance)) {
            activeInstance = INSTANCES.keySet().iterator().next();
        }
        for (String name : INSTANCES.keySet()) {
            if (!ABSORPTIONS.containsKey(name)) {
                ABSORPTIONS.put(name, new LinkedHashMap<String, CooldownEntry>());
            }
            if (!HEALS.containsKey(name)) {
                HEALS.put(name, new LinkedHashMap<String, CooldownEntry>());
            }
        }
        dataRevision++;
        if (migrateExistingEntries) {
            migrateExistingEntriesToAbsorptions();
            save();
        }
    }

    private static void save() {
        if (!loaded) {
            return;
        }
        File file = storageFile();
        File parent = file.getParentFile();
        if (!parent.exists() && !parent.mkdirs()) {
            lastSaveSuccessful = false;
            return;
        }
        NBTTagCompound root = new NBTTagCompound();
        NBTTagCompound instances = new NBTTagCompound();
        for (Map.Entry<String, Map<String, CooldownEntry>> instanceEntry : INSTANCES.entrySet()) {
            NBTTagCompound instance = new NBTTagCompound();
            String name = instanceEntry.getKey();
            instance.setTag("cooldowns", writeEntries(instanceEntry.getValue()));
            instance.setTag("absorptions", writeEntries(ABSORPTIONS.get(name)));
            instance.setTag("heals", writeEntries(HEALS.get(name)));
            instances.setTag(instanceEntry.getKey(), instance);
        }
        root.setTag("instances", instances);
        root.setString("activeInstance", activeInstance);
        root.setBoolean("categoriesMigrated", true);
        try {
            File temporary = new File(file.getParentFile(), file.getName() + ".tmp");
            CompressedStreamTools.write(root, temporary);
            if (file.exists() && !file.delete()) {
                lastSaveSuccessful = false;
                return;
            }
            if (!temporary.renameTo(file)) {
                lastSaveSuccessful = false;
                return;
            }
            lastSaveSuccessful = file.isFile() && file.length() > 0L;
        } catch (IOException ignored) {
            lastSaveSuccessful = false;
        }
    }

    private static File storageFile() {
        return new File(new File(Minecraft.getMinecraft().mcDataDir, "config"),
                "rpgclient-cooldowns.dat");
    }

    private static Map<String, CooldownEntry> activeEntries() {
        return activeEntries(Category.COOLDOWN);
    }

    private static Map<String, CooldownEntry> activeEntries(Category category) {
        Map<String, Map<String, CooldownEntry>> categoryInstances = entriesFor(category);
        Map<String, CooldownEntry> entries = categoryInstances.get(activeInstance);
        if (entries == null) {
            entries = new LinkedHashMap<String, CooldownEntry>();
            categoryInstances.put(activeInstance, entries);
        }
        return entries;
    }

    private static Map<String, Map<String, CooldownEntry>> entriesFor(Category category) {
        if (category == Category.ABSORPTION) return ABSORPTIONS;
        if (category == Category.HEAL) return HEALS;
        return INSTANCES;
    }

    private static void createEmptyInstance(String name) {
        INSTANCES.put(name, new LinkedHashMap<String, CooldownEntry>());
        ABSORPTIONS.put(name, new LinkedHashMap<String, CooldownEntry>());
        HEALS.put(name, new LinkedHashMap<String, CooldownEntry>());
    }

    private static void migrateExistingEntriesToAbsorptions() {
        for (String name : INSTANCES.keySet()) {
            Map<String, CooldownEntry> previousEntries = INSTANCES.get(name);
            Map<String, CooldownEntry> absorptionEntries = ABSORPTIONS.get(name);
            for (Map.Entry<String, CooldownEntry> previous : previousEntries.entrySet()) {
                String key = previous.getKey();
                CooldownEntry entry = previous.getValue();
                if (absorptionEntries.containsKey(key)) {
                    CooldownEntry existing = absorptionEntries.get(key);
                    if (existing.getFingerprint().equals(entry.getFingerprint())) {
                        continue;
                    }
                    String migratedId = entry.getId() + "_anterior";
                    int suffix = 2;
                    while (absorptionEntries.containsKey(migratedId.toLowerCase(Locale.ROOT))) {
                        migratedId = entry.getId() + "_anterior" + suffix++;
                    }
                    entry = new CooldownEntry(migratedId, entry.getSeconds(), entry.getSample());
                    key = migratedId.toLowerCase(Locale.ROOT);
                }
                absorptionEntries.put(key, entry);
            }
            previousEntries.clear();
        }
    }

    private static void ensureLoaded() {
        if (!loaded) {
            load();
        }
        if (INSTANCES.isEmpty()) {
            createEmptyInstance(DEFAULT_INSTANCE);
        }
        if (activeInstance == null || !INSTANCES.containsKey(activeInstance)) {
            activeInstance = INSTANCES.keySet().iterator().next();
        }
        for (String name : INSTANCES.keySet()) {
            if (!ABSORPTIONS.containsKey(name)) {
                ABSORPTIONS.put(name, new LinkedHashMap<String, CooldownEntry>());
            }
            if (!HEALS.containsKey(name)) {
                HEALS.put(name, new LinkedHashMap<String, CooldownEntry>());
            }
        }
    }

    private static NBTTagCompound writeEntries(Map<String, CooldownEntry> entries) {
        NBTTagCompound tag = new NBTTagCompound();
        if (entries == null) return tag;
        for (Map.Entry<String, CooldownEntry> entry : entries.entrySet()) {
            NBTTagCompound data = writeEntry(entry.getValue());
            if (data != null) tag.setTag(entry.getKey(), data);
        }
        return tag;
    }

    private static Map<String, CooldownEntry> readEntries(NBTTagCompound root) {
        Map<String, CooldownEntry> entries = new LinkedHashMap<String, CooldownEntry>();
        for (String key : root.getKeySet()) {
            CooldownEntry entry = readEntry(root.getCompoundTag(key));
            if (entry != null) {
                entries.put(key, entry);
            }
        }
        return entries;
    }

    private static CooldownEntry readEntry(NBTTagCompound data) {
        try {
            byte[] bytes = Base64.getDecoder().decode(data.getString("item"));
            NBTTagCompound itemTag = CompressedStreamTools.readCompressed(
                    new ByteArrayInputStream(bytes));
            ItemStack item = ItemStack.loadItemStackFromNBT(itemTag);
                double seconds = data.hasKey("seconds.double", 6)
                    ? data.getDouble("seconds.double") : data.getInteger("seconds");
                return item == null || item.getItem() == null ? null
                    : new CooldownEntry(data.getString("id"), seconds, item);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static NBTTagCompound writeEntry(CooldownEntry entry) {
        try {
            NBTTagCompound data = new NBTTagCompound();
            data.setString("id", entry.getId());
            data.setDouble("seconds.double", entry.getSeconds());
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            CompressedStreamTools.writeCompressed(
                    entry.getSample().writeToNBT(new NBTTagCompound()), output);
            data.setString("item", Base64.getEncoder().encodeToString(output.toByteArray()));
            return data;
        } catch (IOException ignored) {
            return null;
        }
    }
}
