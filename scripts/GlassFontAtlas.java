import java.awt.AlphaComposite;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.file.Files;
import javax.imageio.ImageIO;

public final class GlassFontAtlas {
    private GlassFontAtlas() {}

    public static void main(String[] args) throws Exception {
        Font font = Font.createFont(Font.TRUETYPE_FONT, new File(args[0])).deriveFont(8f);
        BufferedImage atlas = new BufferedImage(128, 128, BufferedImage.TYPE_INT_ARGB);
        byte[] glyphSizes = new byte[256];
        Graphics2D graphics = atlas.createGraphics();
        graphics.setFont(font);
        graphics.setColor(java.awt.Color.WHITE);
        graphics.setRenderingHint(
                RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_OFF);
        graphics.setRenderingHint(
                RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_OFF);
        FontMetrics metrics = graphics.getFontMetrics();
        for (int character = 0; character < 256; character++) {
            int column = character % 16;
            int row = character / 16;
            if (character >= 32) {
                String glyph = String.valueOf((char) character);
                int glyphWidth = Math.max(1, Math.min(8, metrics.charWidth((char) character)));
                int left = (8 - glyphWidth) / 2;
                int baseline = row * 8 + Math.max(0, (8 - metrics.getHeight()) / 2) + metrics.getAscent();
                graphics.drawString(glyph, column * 8 + left, baseline);
                int min = 8, max = -1;
                for (int x = 0; x < 8; x++) {
                    for (int y = 0; y < 8; y++) {
                        if ((atlas.getRGB(column * 8 + x, row * 8 + y) >>> 24) == 0) continue;
                        min = Math.min(min, x);
                        max = Math.max(max, x);
                    }
                }
                if (max >= min) {
                    left = min;
                    glyphWidth = max - min + 1;
                }
                glyphSizes[character] = (byte) ((left << 4) | Math.min(15, left + glyphWidth));
            }
        }
        graphics.dispose();
        File directory = new File(args[1]);
        Files.createDirectories(directory.toPath());
        ImageIO.write(atlas, "png", new File(directory, "ascii.png"));
        try (FileOutputStream output = new FileOutputStream(new File(directory, "glyph_sizes.bin"))) {
            output.write(glyphSizes);
        }
        styleButtons(new File(directory.getParentFile(), "gui/widgets.png"));
    }

    private static void styleButtons(File widgetsFile) throws Exception {
        BufferedImage widgets = ImageIO.read(widgetsFile);
        if (widgets == null || widgets.getWidth() < 200 || widgets.getHeight() < 106) {
            throw new IllegalStateException("La textura widgets.png no tiene el tamaño esperado.");
        }
        Graphics2D graphics = widgets.createGraphics();
        graphics.setComposite(AlphaComposite.Clear);
        graphics.fillRect(0, 46, 200, 60);
        graphics.setComposite(AlphaComposite.SrcOver);
        graphics.setRenderingHint(
                RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        graphics.setStroke(new BasicStroke(1f));
        Color[] fills = {
            new Color(8, 8, 11, 245), new Color(26, 26, 30, 250), new Color(8, 8, 11, 160)
        };
        Color[] borders = {
            new Color(215, 215, 220, 245),
            new Color(255, 255, 255, 255),
            new Color(130, 130, 136, 180)
        };
        for (int state = 0; state < fills.length; state++) {
            int y = 46 + state * 20;
            graphics.setColor(fills[state]);
            graphics.fillRoundRect(1, y + 1, 198, 18, 8, 8);
            graphics.setColor(borders[state]);
            graphics.drawRoundRect(1, y + 1, 198, 18, 8, 8);
        }
        graphics.dispose();
        if (!ImageIO.write(widgets, "png", widgetsFile)) {
            throw new IllegalStateException("No se pudo guardar la textura de botones.");
        }
    }
}
