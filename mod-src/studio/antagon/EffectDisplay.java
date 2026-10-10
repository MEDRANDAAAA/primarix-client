package studio.antagon;

import java.util.Locale;

final class EffectDisplay {
    private EffectDisplay() {}

    static String duration(int ticks) {
        if (ticks < 0) return "INDEF.";
        long seconds = ((long) ticks + 19) / 20;
        if (seconds >= 6000) return "99:99";
        return String.format(Locale.ROOT, "%d:%02d", seconds / 60, seconds % 60);
    }
}
