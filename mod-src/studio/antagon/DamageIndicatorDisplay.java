package studio.antagon;

final class DamageIndicatorDisplay {
    private static final float HEART_BILLBOARD_SCALE = 0.02666667f;
    private static final int HEARTS_PER_ROW = 10;

    private DamageIndicatorDisplay() {}

    static float heartBillboardScale(float size) {
        return HEART_BILLBOARD_SCALE * size;
    }

    static float heartAnchorY(float entityHeight, float verticalOffset) {
        return entityHeight + 0.18f + verticalOffset;
    }

    static float verticalOffset(String centimeters) {
        try {
            return Float.parseFloat(centimeters.replace("cm", "")) / 100f;
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    static float heartX(int index, int count, float unit, float step) {
        int rowCount = Math.min(HEARTS_PER_ROW, count - index / HEARTS_PER_ROW * HEARTS_PER_ROW);
        float rowWidth = heartWidth(rowCount, unit, step);
        return -rowWidth / 2 + index % HEARTS_PER_ROW * step;
    }

    static float heartY(int index, float rowStep) {
        return -(index / HEARTS_PER_ROW) * rowStep;
    }

    static int heartRows(int count) {
        return count <= 0 ? 0 : (count + HEARTS_PER_ROW - 1) / HEARTS_PER_ROW;
    }

    static float heartWidth(int count, float unit, float step) {
        int columns = Math.min(HEARTS_PER_ROW, Math.max(0, count));
        return columns == 0 ? 0 : (columns - 1) * step + 9 * unit;
    }

    static float heartStackTop(int count, float rowStep) {
        return -Math.max(0, heartRows(count) - 1) * rowStep;
    }

    static float heartStackHeight(int count, float unit, float rowStep) {
        int rows = heartRows(count);
        return rows == 0 ? 0 : (rows - 1) * rowStep + 9 * unit;
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
