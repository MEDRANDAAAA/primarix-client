package studio.antagon;

public final class CoreTest {
    private static class Parent {
        private float amount = 3f;
    }

    private static final class Target extends Parent {
        private String overloaded(String value) {
            return "string:" + value;
        }

        private String overloaded(Integer value) {
            return "integer:" + value;
        }

        private String overloaded(Runnable value) {
            value.run();
            return "task";
        }

        private static long numeric(long value) {
            return value + 1;
        }

        private String noArgument() {
            return "ok";
        }
    }

    private static void check(boolean value) {
        if (!value) throw new AssertionError();
    }

    public static void main(String[] args) throws Exception {
        Target target = new Target();
        check(
                "string:test"
                        .equals(
                                Reflect.call(
                                        target, new String[] {"missing", "overloaded"}, "test")));
        check(
                "integer:42"
                        .equals(Reflect.call(target, new String[] {"missing", "overloaded"}, 42)));
        check(
                "string:again"
                        .equals(
                                Reflect.call(
                                        target, new String[] {"missing", "overloaded"}, "again")));
        check(
                "task"
                        .equals(
                                Reflect.call(
                                        target, new String[] {"overloaded"}, (Runnable) () -> {})));
        check(((Long) Reflect.invoke(Target.class, null, new String[] {"numeric"}, 4)) == 5L);
        check("ok".equals(Reflect.call(target, new String[] {"noArgument"})));
        check(Reflect.getF(target, "amount") == 3f);
        Reflect.setF(target, "amount", 7f);
        check(Reflect.getF(target, "amount") == 7f);
        check(
                "b50ad385829d3141a2167e7d7539ba7f".equals(LocalIdentity.offlineUuid("Notch")));
        check(
                "a4c469dc8a5a39c39ecdaea5fe35ede3".equals(LocalIdentity.offlineUuid("Gaius")));
        check(ModuleRegistry.MODS.length == ModuleRegistry.NAMES.length);
        check(ModuleRegistry.MODS.length == ModuleRegistry.DESCRIPTIONS.length);
        for (String mod : ModuleRegistry.MODS) check(!mod.equals("armor"));
        check(!ModuleRegistry.defaultEnabled("armor"));
        check(ModuleRegistry.defaultEnabled("effects"));
        check(!ModuleRegistry.defaultEnabled("damageindicator"));
        check(ModuleRegistry.options("armor").length == 0);
        check(ModuleRegistry.options("effects").length == 6);
        check("75%".equals(ModuleRegistry.defaultValue("effects.size")));
        check("compacto".equals(ModuleRegistry.defaultValue("effects.style")));
        check("off".equals(ModuleRegistry.defaultValue("effects.name")));
        check("off".equals(ModuleRegistry.defaultValue("effects.level")));
        check(ModuleRegistry.options("damageindicator").length == 5);
        check("32".equals(ModuleRegistry.defaultValue("damageindicator.range")));
        check("corazones".equals(ModuleRegistry.defaultValue("damageindicator.display")));
        check("on".equals(ModuleRegistry.defaultValue("damageindicator.absorption")));
        check("9.5/10".equals(DamageIndicatorDisplay.label("vida", 19, 20)));
        check("75%".equals(DamageIndicatorDisplay.label("porcentaje", 15, 20)));
        check("0%".equals(DamageIndicatorDisplay.label("porcentaje", 0, 0)));
        check("off".equals(ModuleRegistry.defaultValue("chat.transparent")));
        check(MenuLayout.homeScale(854, 480) == 1f);
        check(MenuLayout.homeScale(1360, 719) == 1f);
        check(MenuLayout.homeScale(427, 240) == .5f);
        int[] profileSelector = MenuLayout.profileSelector(854, 480);
        check(profileSelector[0] + profileSelector[2] + 8 == 854);
        check(profileSelector[1] == 8 && profileSelector[3] == 30);
        int[] compactProfileSelector = MenuLayout.profileSelector(427, 240);
        check(compactProfileSelector[2] == 98 && compactProfileSelector[3] == 15);
        check(compactProfileSelector[0] + compactProfileSelector[2] + 4 == 427);
        int[] referenceButton = MenuLayout.homeButton(0, 854, 480);
        check(referenceButton[0] == 226 && referenceButton[1] == 206);
        check(referenceButton[2] == 400 && referenceButton[3] == 36);
        boolean armorInHud = false, effectsInHud = false, damageInPvp = false;
        int[] hudModules = ModuleRegistry.filter(1), pvpModules = ModuleRegistry.filter(2);
        for (int index : hudModules) {
            armorInHud |= ModuleRegistry.MODS[index].equals("armor");
            effectsInHud |= ModuleRegistry.MODS[index].equals("effects");
        }
        check(!armorInHud && effectsInHud);
        for (int index : pvpModules) damageInPvp |= ModuleRegistry.MODS[index].equals("damageindicator");
        check(damageInPvp);
        for (int[] size :
                new int[][] {{320, 240}, {427, 240}, {640, 400}, {960, 540}, {1280, 720}}) {
            int logoWidth = Math.round(430 * MenuLayout.homeScale(size[0], size[1]));
            check(
                    Math.abs(
                                    MenuLayout.centeredLogoX(size[0], logoWidth) * 2
                                            + logoWidth
                                            - size[0])
                            <= 1);
            int[][] homeButtons = new int[8][];
            for (int slot = 0; slot < homeButtons.length; slot++) {
                homeButtons[slot] = MenuLayout.homeButton(slot, size[0], size[1]);
                int[] button = homeButtons[slot];
                if (button == null) continue;
                check(button[0] >= 0 && button[1] >= 0);
                check(button[0] + button[2] <= size[0]);
                check(button[1] + button[3] <= size[1]);
            }
            check(homeButtons[0][1] + homeButtons[0][3] < homeButtons[1][1]);
            check(homeButtons[1][1] + homeButtons[1][3] < homeButtons[2][1]);
            check(homeButtons[2][0] + homeButtons[2][2] < homeButtons[3][0]);
            check(homeButtons[4][0] + homeButtons[4][2] < homeButtons[5][0]);
            check(homeButtons[5][0] + homeButtons[5][2] < homeButtons[6][0]);
            check(homeButtons[7][1] > homeButtons[6][1]);
            check(MenuLayout.homeButton(8, size[0], size[1]) == null);
            int height = MenuLayout.homeHeight(size[0], size[1]);
            float scale = MenuLayout.scale(size[0], size[1], 0);
            int[] selector = MenuLayout.profileSelector(size[0], size[1]);
            check(selector[0] >= 0 && selector[1] >= 0);
            check(selector[0] + selector[2] <= size[0]);
            check(selector[1] + selector[3] <= size[1]);
            check(MenuLayout.WIDTH * scale <= size[0] - 23);
            check(height * scale <= size[1] - 23);
            float max = MenuLayout.maxScroll(26, height);
            float[] last = MenuLayout.card(25, 0, 0, max);
            check(last[1] + last[3] <= height - MenuLayout.FOOTER + .01f);
            check(MenuLayout.clampScroll(9999, 26, height) == max);
            check(MenuLayout.clampScroll(-1, 26, height) == 0);
        }
        System.out.println("Java OK: reflection overloads, inherited fields and menu bounds.");
    }
}
