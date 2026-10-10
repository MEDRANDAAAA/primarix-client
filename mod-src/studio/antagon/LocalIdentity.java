package studio.antagon;

import static studio.antagon.Reflect.*;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

final class LocalIdentity {
    private LocalIdentity() {}

    static String offlineUuid(String nickname) {
        if (nickname == null || !nickname.matches("[A-Za-z0-9_]{3,16}"))
            throw new IllegalArgumentException("Invalid offline nickname.");
        return UUID.nameUUIDFromBytes(("OfflinePlayer:" + nickname).getBytes(StandardCharsets.UTF_8))
                .toString()
                .replace("-", "");
    }

    static void applyOffline(Object minecraft, String nickname) throws Exception {
        String uuid = offlineUuid(nickname);
        Class<?> sessionClass = Class.forName("net.minecraft.util.Session");
        Object session =
                sessionClass
                        .getConstructor(String.class, String.class, String.class, String.class)
                        .newInstance(nickname, uuid, "0", "legacy");
        setField(minecraft, session, "field_71449_j", "session");
        Object applied = field(minecraft, "field_71449_j", "session");
        String appliedName = (String) call(applied, new String[] {"func_111285_a", "getUsername"});
        if (!nickname.equals(appliedName))
            throw new IllegalStateException("Minecraft did not accept the selected offline nickname.");
    }
}
