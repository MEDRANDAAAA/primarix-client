package com.rpgclient.cooldown;

import net.minecraft.client.Minecraft;
import net.minecraft.command.CommandBase;
import net.minecraft.command.CommandException;
import net.minecraft.command.ICommandSender;
import net.minecraft.command.WrongUsageException;
import net.minecraft.util.ChatComponentText;

public class CommandHand extends CommandBase {
    @Override
    public String getCommandName() {
        return "hand";
    }

    @Override
    public String getCommandUsage(ICommandSender sender) {
        return "/hand [on|off|toggle]";
    }

    @Override
    public void processCommand(ICommandSender sender, String[] args) throws CommandException {
        if (args.length == 0) {
            GuiCooldownInventory.toggleOverlay();
            sender.addChatMessage(new ChatComponentText("[RPGClient] Hand "
                    + (GuiCooldownInventory.isOverlayEnabled() ? "activado." : "desactivado.")));
            return;
        }

        String mode = args[0].toLowerCase();
        if ("on".equals(mode)) {
            GuiCooldownInventory.setOverlayEnabled(true);
            sender.addChatMessage(new ChatComponentText("[RPGClient] Hand activado."));
            return;
        }
        if ("off".equals(mode)) {
            GuiCooldownInventory.setOverlayEnabled(false);
            sender.addChatMessage(new ChatComponentText("[RPGClient] Hand desactivado."));
            return;
        }
        if ("toggle".equals(mode) || "inv".equals(mode)) {
            GuiCooldownInventory.toggleOverlay();
            sender.addChatMessage(new ChatComponentText("[RPGClient] Hand "
                    + (GuiCooldownInventory.isOverlayEnabled() ? "activado." : "desactivado.")));
            return;
        }

        throw new WrongUsageException(getCommandUsage(sender));
    }

    @Override
    public int getRequiredPermissionLevel() {
        return 0;
    }
}
