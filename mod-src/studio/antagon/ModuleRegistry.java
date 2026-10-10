package studio.antagon;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

final class ModuleRegistry {
    static final String[] MODS = {
        "fps",
        "cps",
        "keys",
        "coords",
        "ping",
        "clock",
        "nohurtcam",
        "togglesprint",
        "perspective",
        "crosshair",
        "chat",
        "notitles",
        "radio",
        "reach",
        "combo",
        "hitbox",
        "hitcolor",
        "autotext",
        "scoreboard",
        "hitdelay",
        "fullbright",
        "ownnametag",
        "itemphysics",
        "effects",
        "damageindicator"
    };
    static final String[] NAMES = {
        "FPS",
        "CPS",
        "TECLAS",
        "COORDENADAS",
        "PING",
        "RELOJ",
        "SIN HURT CAM",
        "SPRINT TOGGLE",
        "PERSPECTIVA",
        "MIRA",
        "CHAT",
        "SIN TÍTULOS",
        "RADIO PRIMARIX",
        "ALCANCE",
        "CONTADOR DE COMBOS",
        "HITBOX",
        "COLOR DE IMPACTO",
        "TEXTO AUTOMÁTICO",
        "TABLERO",
        "CORRECCIÓN DE HIT DELAY",
        "BRILLO MÁXIMO",
        "TU NOMBRE",
        "FÍSICA DE OBJETOS",
        "EFECTOS",
        "CORAZONES SOBRE JUGADORES"
    };
    static final boolean[] DEFAULT_ON = {
        true, true, true, false, true, false, false, false, false, false, false, false, false,
        false, false, false, false, false, false, false, false, true, false, true, false
    };
    static final int AUTOTEXT_SLOTS = 6;
    static final String COLOR_VALUES = "blanco,rojo,amarillo,verde,celeste";
    static final String[] SIZE = {"size", "TAMAÑO", "range:50:200:5:%", "100%"};
    static final String[] COLOR_NAMES = {"blanco", "rojo", "amarillo", "verde", "celeste"};
    static final int[] COLORS = {0xFFF0EEE8, 0xFFEE1515, 0xFFFFD23F, 0xFF7BD66A, 0xFF5FD4E8};

    static final String[] CATEGORIES = {"TODOS", "HUD", "PVP", "UTILIDADES"};
    static final String[] DESCRIPTIONS = {
        "Cuadros por segundo", "Clics por segundo", "Teclas y clics en pantalla",
        "Posición X, Y y Z", "Latencia de conexión", "Hora dentro del juego",
        "Cámara estable al recibir daño", "Sprint con una tecla", "Mira a tu alrededor libremente",
        "Forma, color y tamaño", "Hora y mensajes repetidos", "Oculta los títulos",
        "Spotify dentro del juego", "Distancia del último golpe", "Golpes consecutivos",
        "Límites visuales de entidades", "Color del efecto de daño", "Atajos para mensajes",
        "Tamaño, fondo y números", "Elimina el bloqueo de clic", "Brillo máximo",
        "Tu nombre en tercera persona", "Objetos animados en el suelo",
        "Efectos activos y tiempo restante",
        "Corazones normales y de absorción sobre jugadores"
    };
    private static final int[] CATEGORY = {
        1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 2, 2, 2, 2, 3, 1, 2, 3, 3, 3, 1, 2
    };

    static int[] filter(int category) {
        int count = 0;
        for (int value : CATEGORY) if (category == 0 || value == category) count++;
        int[] matches = new int[count];
        int cursor = 0;
        for (int i = 0; i < MODS.length; i++)
            if (category == 0 || CATEGORY[i] == category) matches[cursor++] = i;
        return matches;
    }

    private static final Map<String, String[][]> OPTIONS = new HashMap<String, String[][]>();
    private static final Map<String, String> DEFAULT_VALUES = new HashMap<String, String>();
    private static final Map<String, Boolean> ENABLED = new HashMap<String, Boolean>();

    static {
        for (int i = 0; i < MODS.length; i++) {
            String mod = MODS[i];
            ENABLED.put(mod, DEFAULT_ON[i]);
            String[][] options = createOptions(mod);
            OPTIONS.put(mod, options);
            for (String[] option : options) {
                DEFAULT_VALUES.put(
                        mod + "." + option[0],
                        option.length > 3 ? option[3] : option[2].split(",")[0]);
            }
        }
    }

    private ModuleRegistry() {}

    static boolean defaultEnabled(String mod) {
        return Boolean.TRUE.equals(ENABLED.get(mod));
    }

    static String defaultValue(String key) {
        String value = DEFAULT_VALUES.get(key);
        return value == null ? "" : value;
    }

    static String[][] options(String mod) {
        String[][] options = OPTIONS.get(mod);
        return options == null ? new String[0][] : options;
    }

    private static String[][] createOptions(String mod) {
        if (mod.equals("nohurtcam")) return new String[0][];
        if (mod.equals("effects"))
            return new String[][] {
                {"size", "TAMAÑO", "range:50:200:5:%", "75%"},
                {"style", "VISTA", "compacto,detallado", "compacto"},
                {"label", "NOMBRE Y NIVEL", "on,off", "off"},
                {"bg", "FONDO", "on,off"},
                {"bar", "BARRA DE COLOR", "on,off"}
            };
        if (mod.equals("damageindicator"))
            return new String[][] {
                SIZE,
                {"range", "DISTANCIA", "8,16,24,32,48", "32"},
                {"display", "VISTA", "corazones,vida,porcentaje", "corazones"},
                {"absorption", "CORAZONES DE ABSORCIÓN", "on,off"},
                {"bg", "FONDO", "on,off"}
            };
        if (mod.equals("perspective"))
            return new String[][] {
                {"key", "TECLA", "key", "F"}, {"mode", "MODO", "mantener,alternar"}
            };
        if (mod.equals("crosshair"))
            return new String[][] {
                {"style", "ESTILO", "cruz,punto,cruz + punto"},
                {"color", "COLOR", COLOR_VALUES},
                {"size", "TAMANHO", "range:2:24:1:", "8"},
                {"thick", "GROSOR", "range:1:6:1:", "2"},
                {"gap", "ESPACIO", "range:0:12:1:", "2"},
                {"outline", "CONTORNO", "on,off"}
            };
        if (mod.equals("chat"))
            return new String[][] {
                {"time", "HORÁRIO", "off,on"},
                {"stack", "AGRUPAR REPETIDOS", "on,off"},
                {"transparent", "FONDO TRANSPARENTE", "off,on"},
                {"scale", "TAMAÑO DEL TEXTO", "range:25:100:5:%", "100%"},
                {"width", "ANCHO", "range:25:100:5:%", "100%"},
                {"lines", "LÍNEAS VISIBLES", "range:3:20:1:", "10"}
            };
        if (mod.equals("radio")) {
            List<String[]> radio =
                    new ArrayList<String[]>(
                            Arrays.asList(
                                    new String[][] {
                                        {"playlist", "LISTA O JAM", "action"},
                                        {"controls", "CONTROLES", "action"},
                                        {"volume", "VOLUMEN", "slider"},
                                        SIZE,
                                        {"art", "PORTADA DEL ÁLBUM", "on,off"},
                                        {"bg", "FONDO", "on,off"},
                                        {"bar", "BARRA DE COLOR", "on,off"},
                                        {"prev", "TECLA: ANTERIOR", "key", "NINGUNA"},
                                        {"pause", "TECLA: PAUSAR", "key", "NINGUNA"},
                                        {"next", "TECLA: SIGUIENTE", "key", "NINGUNA"}
                                    }));
            if (!Spotify.HAS_VOLUME) radio.remove(2);
            return radio.toArray(new String[0][]);
        }
        if (mod.equals("hitbox"))
            return new String[][] {
                {"color", "COLOR", COLOR_VALUES},
                {"thick", "GROSOR", "range:1:6:1:", "2"},
                {"players", "SOLO JUGADORES", "off,on"},
                {"margin", "HITBOX REAL (+0.1)", "on,off"}
            };
        if (mod.equals("hitcolor"))
            return new String[][] {
                {"color", "COLOR", COLOR_VALUES, "rojo"},
                {"alpha", "INTENSIDAD", "range:5:80:5:%", "30%"}
            };
        if (mod.equals("autotext")) {
            String[][] slots = new String[AUTOTEXT_SLOTS][];
            for (int i = 0; i < AUTOTEXT_SLOTS; i++)
                slots[i] = new String[] {"" + (i + 1), "", "autotext"};
            return slots;
        }
        if (mod.equals("scoreboard"))
            return new String[][] {
                SIZE,
                {"bg", "FONDO", "on,off"},
                {"numbers", "NÚMEROS ROJOS", "on,off"},
                {"hide", "OCULTAR TABLERO", "off,on"}
            };
        if (mod.equals("hitdelay")) return new String[0][];
        if (mod.equals("ownnametag") || mod.equals("itemphysics")) return new String[0][];
        if (mod.equals("fullbright"))
            return new String[][] {{"shadows", "SIN SOMBRAS DE ENTIDADES", "on,off"}};
        if (mod.equals("notitles"))
            return new String[][] {{"actionbar", "BARRA DE ACCIÓN", "off,on"}};
        if (mod.equals("keys"))
            return new String[][] {
                SIZE,
                {"bg", "FONDO", "on,off"},
                {"mouse", "BOTONES DEL RATÓN", "on,off"},
                {"space", "BARRA ESPACIADORA", "on,off"},
                {"active", "COLOR AL PULSAR", "rojo,blanco,amarillo,verde,celeste"}
            };
        List<String[]> list =
                new ArrayList<String[]>(
                        Arrays.asList(
                                new String[][] {
                                    SIZE,
                                    {"bg", "FONDO", "on,off"},
                                    {"bar", "BARRA DE COLOR", "on,off"},
                                    {"color", "COLOR DEL TEXTO", COLOR_VALUES}
                                }));
        if (mod.equals("cps")) list.add(new String[] {"right", "CLIQUE DIREITO", "on,off"});
        if (mod.equals("clock")) list.add(new String[] {"format", "FORMATO", "24h,12h"});
        if (mod.equals("togglesprint"))
            list.add(0, new String[] {"hud", "MOSTRAR EN EL HUD", "on,off"});
        return list.toArray(new String[0][]);
    }
}
