package com.rpgclient.cooldown;

import net.minecraft.command.CommandBase;
import net.minecraft.command.CommandException;
import net.minecraft.command.ICommandSender;
import net.minecraft.command.WrongUsageException;
import net.minecraft.util.ChatComponentText;

public class CommandAbs extends CommandBase {
    @Override
    public String getCommandName() {
        return "abs";
    }

    @Override
    public String getCommandUsage(ICommandSender sender) {
        return "/abs [on|off|toggle]";
    }

    @Override
    public void processCommand(ICommandSender sender, String[] args) throws CommandException {
        if (args.length == 0) {
            CooldownEventHandler.openNextTick(new GuiAbsConfig());
            return;
        }
        if (args.length != 1) throw new WrongUsageException(getCommandUsage(sender));

        String action = args[0].toLowerCase(java.util.Locale.ROOT);
        String error;
        if ("on".equals(action)) {
            error = AbsorptionManager.setEnabled(true);
        } else if ("off".equals(action)) {
            error = AbsorptionManager.setEnabled(false);
        } else if ("toggle".equals(action)) {
            error = AbsorptionManager.toggle();
        } else {
            throw new WrongUsageException(getCommandUsage(sender));
        }
        sender.addChatMessage(new ChatComponentText(error == null
                ? "[AnnthModCD] Abs " + (AbsorptionManager.isEnabled() ? "activado." : "desactivado.")
                : "[AnnthModCD] " + error));
    }

    @Override
    public int getRequiredPermissionLevel() {
        return 0;
    }
}