package studio.antagon;

final class MenuLayout {
    static final int WIDTH = 546, CARD_HEIGHT = 62, ROW_HEIGHT = 70;
    static final int CONTENT_TOP = 82, FOOTER = 28, PADDING = 16;

    private MenuLayout() {}

    static float scale(int screenWidth, int screenHeight, int contentHeight) {
        float scale = Math.min(1, Math.max(1, screenWidth - 24) / (float) WIDTH);
        return contentHeight == 0
                ? scale
                : Math.min(scale, Math.max(1, screenHeight - 24) / (float) contentHeight);
    }

    static int homeHeight(int screenWidth, int screenHeight) {
        return Math.max(
                1,
                Math.min(416, (int) ((screenHeight - 24) / scale(screenWidth, screenHeight, 0))));
    }

    static float viewport(int height) {
        return Math.max(1, height - CONTENT_TOP - FOOTER);
    }

    static float maxScroll(int count, int height) {
        int rows = (count + 2) / 3;
        return Math.max(0, rows * ROW_HEIGHT - (ROW_HEIGHT - CARD_HEIGHT) - viewport(height));
    }

    static float homeScale(int screenWidth, int screenHeight) {
        return Math.min(1f, Math.min(screenWidth / 854f, screenHeight / 480f));
    }

    static int centeredLogoX(int screenWidth, int logoWidth) {
        return (screenWidth - logoWidth) / 2;
    }

    static int[] profileSelector(int screenWidth, int screenHeight) {
        float scale = homeScale(screenWidth, screenHeight);
        int margin = Math.round(8 * scale);
        int width = Math.min(Math.round(196 * scale), Math.max(1, screenWidth - 3 * margin));
        return new int[] {
            Math.max(margin / 2, screenWidth - width - margin),
            margin,
            width,
            Math.round(30 * scale)
        };
    }

    static int[] homeButton(int slot, int screenWidth, int screenHeight) {
        int x, y, width;
        switch (slot) {
            case 0:
                x = 226;
                y = 206;
                width = 400;
                break;
            case 1:
                x = 226;
                y = 249;
                width = 400;
                break;
            case 2:
                x = 226;
                y = 292;
                width = 196;
                break;
            case 3:
                x = 430;
                y = 292;
                width = 196;
                break;
            case 4:
                x = 178;
                y = 356;
                width = 40;
                break;
            case 5:
                x = 226;
                y = 356;
                width = 196;
                break;
            case 6:
                x = 430;
                y = 356;
                width = 196;
                break;
            case 7:
                x = 226;
                y = 400;
                width = 400;
                break;
            default:
                return null;
        }
        float scale = homeScale(screenWidth, screenHeight);
        return new int[] {
            homeCoordinate(x, screenWidth, 427, scale),
            Math.round(y * scale),
            Math.round(width * scale),
            Math.round(36 * scale)
        };
    }

    private static int homeCoordinate(int coordinate, int screenSize, float center, float scale) {
        float screenCenter = screenSize / 2f;
        return Math.round(screenCenter + (coordinate - center) * scale);
    }

    static float clampScroll(float scroll, int count, int height) {
        return Math.max(0, Math.min(scroll, maxScroll(count, height)));
    }

    static int profilePageCount(int count, int rows) {
        return Math.max(1, (count + rows - 1) / rows);
    }

    static int clampProfilePage(int page, int count, int rows) {
        return Math.max(0, Math.min(page, profilePageCount(count, rows) - 1));
    }

    static int profilePageStart(int page, int rows) {
        return page * rows;
    }

    static int profileScrollOffset(int offset, int count, int visibleRows) {
        return Math.max(0, Math.min(offset, Math.max(0, count - visibleRows)));
    }

    static int profileScrollbarThumbSize(
            int trackHeight, int count, int visibleRows, int minimumThumbHeight) {
        if (trackHeight <= 0 || count <= 0 || visibleRows <= 0) return 0;
        return Math.min(
                trackHeight,
                Math.max(
                        minimumThumbHeight,
                        trackHeight * Math.min(visibleRows, count) / count));
    }

    static int profileScrollbarThumbOffset(
            int trackTravel, int offset, int count, int visibleRows) {
        int maxOffset = Math.max(0, count - visibleRows);
        if (trackTravel <= 0 || maxOffset == 0) return 0;
        return Math.round(
                trackTravel
                        * (float) profileScrollOffset(offset, count, visibleRows)
                        / maxOffset);
    }

    static int profileScrollOffsetFromThumb(
            int thumbOffset, int trackTravel, int count, int visibleRows) {
        int maxOffset = Math.max(0, count - visibleRows);
        if (trackTravel <= 0 || maxOffset == 0) return 0;
        int boundedOffset = Math.max(0, Math.min(thumbOffset, trackTravel));
        return Math.round(boundedOffset * (float) maxOffset / trackTravel);
    }

    static float[] card(int index, float x, float y, float scroll) {
        float width = (WIDTH - PADDING * 2 - 16) / 3f;
        return new float[] {
            x + PADDING + index % 3 * (width + 8),
            y + CONTENT_TOP + index / 3 * ROW_HEIGHT - scroll,
            width,
            CARD_HEIGHT
        };
    }
}
