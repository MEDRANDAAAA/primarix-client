# Damage indicator integration

`damageindicator-main` is a LabyMod addon, not a standalone Forge 1.8.9 mod, so its JAR cannot be loaded by Primarix's Forge client. Primarix includes the compatible implementation in its core client module instead; enable **CORAZONES SOBRE JUGADORES** in the in-game module list and choose **VISTA**:

- **corazones** shows health hearts and optional absorption hearts.
- **vida** shows current/max health in hearts.
- **porcentaje** shows current health as a percentage.

The display modes follow the behavior of DamageIndicator by LabyMedia GmbH. Its source is available at `C:\Users\Usuario\Desktop\damageindicator-main` and is licensed under LGPL-2.1-or-later. The Primarix implementation uses the existing Forge renderer and does not bundle or copy the LabyMod addon classes.
