package studio.antagon;

final class DamageIndicatorDisplay {
    private static final float HEART_BILLBOARD_SCALE = 0.02666667f;

    private DamageIndicatorDisplay() {}

    static float heartBillboardScale(float size) {
        return HEART_BILLBOARD_SCALE * size;
    }

    static float heartAnchorY(float entityHeight) {
        return entityHeight + 0.18f;
    }

    static String label(String display, float health, float maximum) {
        if (display.equals("vida")) return hearts(health) + "/" + hearts(maximum);
        if (display.equals("porcentaje")) {
            int maxPoints = (int) Math.ceil(maximum);
            if (maxPoints <= 0) return "0%";
            int points = (int) Math.ceil(health);
            return points * 100 / maxPoints + "%";
        }
        return "";
    }

    private static String hearts(float points) {
        double value = Math.ceil(points) / 2d;
        return value == (int) value ? Integer.toString((int) value) : Double.toString(value);
    }
}
