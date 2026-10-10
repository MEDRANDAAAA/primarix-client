import java.awt.AlphaComposite;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.image.BufferedImage;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.util.Iterator;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.metadata.IIOMetadata;
import javax.imageio.stream.ImageInputStream;
import org.w3c.dom.Node;

public final class GifFrameExtractor {
    private GifFrameExtractor() {}

    public static void main(String[] args) throws Exception {
        File source = new File(args[0]);
        File output = new File(args[1]);
        if (output.exists()) delete(output);
        if (!output.mkdirs()) throw new IllegalStateException("No se pudo crear el directorio de cuadros.");

        Iterator<ImageReader> readers = ImageIO.getImageReadersByFormatName("gif");
        if (!readers.hasNext()) throw new IllegalStateException("No hay un lector GIF disponible.");
        ImageReader reader = readers.next();
        int frameCount;
        try (ImageInputStream input = ImageIO.createImageInputStream(source)) {
            reader.setInput(input, false, false);
            frameCount = reader.getNumImages(true);
            int width = integer(metadataNode(reader.getStreamMetadata(), "LogicalScreenDescriptor"),
                    "logicalScreenWidth");
            int height = integer(metadataNode(reader.getStreamMetadata(), "LogicalScreenDescriptor"),
                    "logicalScreenHeight");
            if (frameCount < 2 || width < 1 || height < 1) {
                throw new IllegalStateException("El GIF animado no tiene dimensiones o cuadros válidos.");
            }

            BufferedImage canvas = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
            Graphics2D graphics = canvas.createGraphics();
            Rectangle previousRectangle = null;
            BufferedImage previousCanvas = null;
            String previousDisposal = "none";
            IIOMetadata streamMetadata = reader.getStreamMetadata();
            int background = backgroundColor(streamMetadata);
            int previousBackground = background;
            int[] delays = new int[frameCount];
            for (int frame = 0; frame < frameCount; frame++) {
                if ("restoreToBackgroundColor".equals(previousDisposal) && previousRectangle != null) {
                    graphics.setComposite(AlphaComposite.Clear);
                    graphics.fill(previousRectangle);
                    if (previousBackground >>> 24 != 0) {
                        graphics.setComposite(AlphaComposite.Src);
                        graphics.setColor(new java.awt.Color(previousBackground, true));
                        graphics.fill(previousRectangle);
                    }
                } else if ("restoreToPrevious".equals(previousDisposal) && previousCanvas != null) {
                    graphics.setComposite(AlphaComposite.Src);
                    graphics.drawImage(previousCanvas, 0, 0, null);
                }

                IIOMetadata metadata = reader.getImageMetadata(frame);
                Node descriptor = metadataNode(metadata, "ImageDescriptor");
                int x = integer(descriptor, "imageLeftPosition");
                int y = integer(descriptor, "imageTopPosition");
                int frameWidth = integer(descriptor, "imageWidth");
                int frameHeight = integer(descriptor, "imageHeight");
                Node control = metadataNode(metadata, "GraphicControlExtension");
                String disposal = attribute(control, "disposalMethod", "none");
                boolean transparent = Boolean.parseBoolean(attribute(control, "transparentColorFlag", "false"));
                int delay = integer(control, "delayTime") * 10;
                delays[frame] = Math.max(20, delay);

                previousCanvas =
                        "restoreToPrevious".equals(disposal) ? copy(canvas) : null;
                BufferedImage image = reader.read(frame);
                graphics.setComposite(AlphaComposite.SrcOver);
                graphics.drawImage(image, x, y, null);

                File frameFile = new File(output, String.format("frame-%03d.png", frame));
                if (!ImageIO.write(canvas, "png", frameFile)) {
                    throw new IllegalStateException("No se pudo escribir " + frameFile.getName());
                }
                previousRectangle = new Rectangle(x, y, frameWidth, frameHeight);
                previousDisposal = disposal;
                previousBackground = transparent
                        && integer(control, "transparentColorIndex")
                                == integer(metadataNode(streamMetadata, "LogicalScreenDescriptor"),
                                        "backgroundColorIndex")
                        ? 0
                        : background;
            }
            graphics.dispose();
            reader.dispose();
            try (BufferedWriter writer = new BufferedWriter(new FileWriter(new File(output, "frame-delays.txt")))) {
                writer.write(width + " " + height + " " + frameCount);
                writer.newLine();
                for (int delay : delays) {
                    writer.write(Integer.toString(delay));
                    writer.newLine();
                }
            }
        }
    }

    private static BufferedImage copy(BufferedImage source) {
        BufferedImage result =
                new BufferedImage(source.getWidth(), source.getHeight(), BufferedImage.TYPE_INT_ARGB);
        Graphics2D graphics = result.createGraphics();
        graphics.drawImage(source, 0, 0, null);
        graphics.dispose();
        return result;
    }

    private static int backgroundColor(IIOMetadata metadata) {
        Node table = metadataNode(metadata, "GlobalColorTable");
        int backgroundIndex =
                integer(metadataNode(metadata, "LogicalScreenDescriptor"), "backgroundColorIndex");
        for (Node entry = table.getFirstChild(); entry != null; entry = entry.getNextSibling()) {
            if (!"ColorTableEntry".equals(entry.getNodeName())
                    || integer(entry, "index") != backgroundIndex) continue;
            int red = integer(entry, "red");
            int green = integer(entry, "green");
            int blue = integer(entry, "blue");
            return 0xff000000 | red << 16 | green << 8 | blue;
        }
        return 0;
    }

    private static Node metadataNode(IIOMetadata metadata, String name) {
        if (metadata == null) throw new IllegalStateException("Faltan metadatos GIF: " + name);
        Node result = find(metadata.getAsTree("javax_imageio_gif_"
                + (name.equals("LogicalScreenDescriptor") || name.equals("GlobalColorTable") ? "stream" : "image")
                + "_1.0"), name);
        if (result == null) throw new IllegalStateException("No se encontraron metadatos GIF: " + name);
        return result;
    }

    private static Node find(Node node, String name) {
        if (name.equals(node.getNodeName())) return node;
        for (Node child = node.getFirstChild(); child != null; child = child.getNextSibling()) {
            Node result = find(child, name);
            if (result != null) return result;
        }
        return null;
    }

    private static String attribute(Node node, String name, String fallback) {
        Node value = node.getAttributes().getNamedItem(name);
        return value == null ? fallback : value.getNodeValue();
    }

    private static int integer(Node node, String name) {
        return Integer.parseInt(attribute(node, name, "0"));
    }

    private static void delete(File path) {
        File[] children = path.listFiles();
        if (children != null) for (File child : children) delete(child);
        if (!path.delete()) throw new IllegalStateException("No se pudo limpiar " + path);
    }
}
