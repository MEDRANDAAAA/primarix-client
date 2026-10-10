package com.rpgclient.cooldown;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiScreen;
import net.minecraft.command.CommandBase;
import net.minecraft.command.CommandException;
import net.minecraft.command.ICommandSender;
import net.minecraft.command.WrongUsageException;
import net.minecraft.item.ItemStack;
import net.minecraft.util.ChatComponentText;

public class CommandCooldown extends CommandBase {
    @Override
    public String getCommandName() {
        return "cd";
    }

    @Override
    public String getCommandUsage(ICommandSender sender) {
        return "/cd <nombre> [segundos] | /cd abs <nombre> | /cd heal <nombre> | /cd inv | /cd gui";
    }

    @Override
    public void processCommand(ICommandSender sender, String[] args) throws CommandException {
        Minecraft mc = Minecraft.getMinecraft();
        if (args.length == 0) {
            sender.addChatMessage(new ChatComponentText("[AnnthModCD] Abriendo menu de cooldowns..."));
            CooldownEventHandler.openNextTick(new GuiCooldownMenu());
            return;
        }
        if (args.length == 1 && (args[0].equalsIgnoreCase("inv") || args[0].equalsIgnoreCase("toggle"))) {
            GuiCooldownInventory.toggleOverlay();
            sender.addChatMessage(new ChatComponentText("[RPGClient] HUD de cooldowns "
                    + (GuiCooldownInventory.isOverlayEnabled() ? "activado." : "desactivado.")));
            return;
        }
        if (args.length == 1 && args[0].equalsIgnoreCase("gui")) {
            GuiCooldownInventory.openLayoutEditor();
            return;
        }
        if (args.length == 2 && (args[0].equalsIgnoreCase("abs")
                || args[0].equalsIgnoreCase("heal"))) {
            if (mc == null || mc.thePlayer == null) {
                sender.addChatMessage(new ChatComponentText("[RPGClient] No hay jugador en el cliente."));
                return;
            }
            ItemStack held = mc.thePlayer.getHeldItem();
            if (held == null || held.getItem() == null) {
                sender.addChatMessage(new ChatComponentText("[RPGClient] Debes tener un item en la mano."));
                return;
            }
            CooldownManager.Category category = args[0].equalsIgnoreCase("abs")
                    ? CooldownManager.Category.ABSORPTION : CooldownManager.Category.HEAL;
            CooldownManager.register(category, args[1], 10.0D, held);
            String section = category == CooldownManager.Category.ABSORPTION
                    ? "absorciones" : "heals";
            if (CooldownManager.wasLastSaveSuccessful()) {
                sender.addChatMessage(new ChatComponentText("[AnnthModCD] Item guardado en "
                        + section + " de la instancia "
                        + CooldownManager.getActiveInstanceName() + " como " + args[1] + "."));
            } else {
                sender.addChatMessage(new ChatComponentText("[AnnthModCD] ERROR: no se pudo guardar. Ruta: "
                        + CooldownManager.getStoragePath()));
            }
            return;
        }
        if (args.length == 1) {
            if (mc == null || mc.thePlayer == null) {
                sender.addChatMessage(new ChatComponentText("[RPGClient] No hay jugador en el cliente."));
                return;
            }
            ItemStack held = mc.thePlayer.getHeldItem();
            if (held == null || held.getItem() == null) {
                sender.addChatMessage(new ChatComponentText("[RPGClient] Debes tener un item en la mano."));
                return;
            }
            double seconds;
            try {
                seconds = args.length > 1 ? parseSeconds(args[1]) : 10.0D;
            } catch (NumberFormatException exception) {
                throw new WrongUsageException("/cd <nombre> [segundos.decimales]");
            }
            CooldownManager.register(args[0], seconds, held);
                if (CooldownManager.wasLastSaveSuccessful()) {
                sender.addChatMessage(new ChatComponentText(
                    "[AnnthModCD] Item guardado como " + args[0]
                    + " en la instancia " + CooldownManager.getActiveInstanceName()
                    + " con cooldown de " + formatSeconds(seconds) + " segundos."));
                } else {
                sender.addChatMessage(new ChatComponentText(
                    "[AnnthModCD] ERROR: no se pudo guardar. Ruta: "
                    + CooldownManager.getStoragePath()));
                }
            return;
        }
        throw new WrongUsageException(getCommandUsage(sender));
    }

    @Override
    public int getRequiredPermissionLevel() {
        return 0;
    }

    private static double parseSeconds(String value) {
        double seconds = Double.parseDouble(value.replace(',', '.'));
        if (seconds < 0.1D || seconds > 500.0D) throw new NumberFormatException();
        return seconds;
    }

    private static String formatSeconds(double seconds) {
        return String.valueOf(seconds).replace('.', ',');
    }
}
