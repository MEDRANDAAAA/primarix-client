package com.rpgclient.cooldown;

import net.minecraft.command.CommandBase;
import net.minecraft.command.CommandException;
import net.minecraft.command.ICommandSender;
import net.minecraft.util.ChatComponentText;

public class CommandRMenu extends CommandBase {
    @Override
    public String getCommandName() {
        return "rmenu";
    }

    @Override
    public String getCommandUsage(ICommandSender sender) {
        return "/rmenu";
    }

    @Override
    public void processCommand(ICommandSender sender, String[] args) throws CommandException {
        CooldownEventHandler.openNextTick(new GuiRMenu());
        sender.addChatMessage(new ChatComponentText("[AnnthModCD] Abriendo menu RPGClient..."));
    }

    @Override
    public int getRequiredPermissionLevel() {
        return 0;
    }
}
