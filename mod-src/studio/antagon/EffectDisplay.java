package studio.antagon;

import java.util.Locale;

final class EffectDisplay {
    private static final String[] LEVELS = {
        "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"
    };

    private EffectDisplay() {}

    static String level(int amplifier) {
        int level = Math.max(1, amplifier + 1);
        return level <= LEVELS.length ? LEVELS[level - 1] : Integer.toString(level);
    }

    static float rowHeight(float availableHeight, int count, float preferredHeight) {
        if (availableHeight <= 0 || count <= 0 || preferredHeight <= 0) return 0;
        return Math.max(1, Math.min(preferredHeight, availableHeight / count));
    }

    static String duration(int ticks) {
        if (ticks < 0) return "INDEF.";
        long seconds = ((long) ticks + 19) / 20;
        if (seconds >= 6000) return "99:99";
        return String.format(Locale.ROOT, "%d:%02d", seconds / 60, seconds % 60);
    }
}
