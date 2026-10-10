package studio.antagon;

final class DamageIndicatorDisplay {
    private DamageIndicatorDisplay() {}

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
