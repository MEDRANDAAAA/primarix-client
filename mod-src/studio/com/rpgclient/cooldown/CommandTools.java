package com.rpgclient.cooldown;

import net.minecraft.command.CommandBase;
import net.minecraft.command.CommandException;
import net.minecraft.command.ICommandSender;
import net.minecraft.command.WrongUsageException;
import net.minecraft.util.ChatComponentText;

public class CommandTools extends CommandBase {
    @Override
    public String getCommandName() { return "tools"; }

    @Override
    public String getCommandUsage(ICommandSender sender) {
        return "/tools create <perfil> | /tools add <perfil> <nombre_item> | /tools delay <ms>";
    }

    @Override
    public void processCommand(ICommandSender sender, String[] args) throws CommandException {
        if (args.length == 0) {
            ToolsEventHandler.openNextTick(new GuiToolsProfiles());
            return;
        }
        if (args.length == 2 && "delay".equalsIgnoreCase(args[0])) {
            try {
                int delay = Integer.parseInt(args[1]);
                ToolsManager.setSwapDelayMs(delay);
                sender.addChatMessage(new ChatComponentText(
                        "[AnnthModCD] Velocidad de intercambio: "
                                + ToolsManager.getSwapDelayMs() + " ms."));
                return;
            } catch (NumberFormatException exception) {
                throw new CommandException("El delay debe ser un numero entre 250 y 1000.");
            }
        }
        if (args.length == 2 && "create".equalsIgnoreCase(args[0])) {
            if (!ToolsManager.create(args[1])) {
                throw new CommandException("El perfil ya existe o su nombre esta vacio.");
            }
            sender.addChatMessage(new ChatComponentText("[AnnthModCD] Perfil creado y activado: " + args[1]));
            return;
        }
        if (args.length == 3 && "add".equalsIgnoreCase(args[0])) {
            if (!ToolsManager.getProfileNames().contains(args[1])) {
                throw new CommandException("No existe el perfil: " + args[1]);
            }
            if (!ToolsManager.addHeldItem(args[1])) {
                throw new CommandException("Debes tener un item valido en la mano o ya esta registrado.");
            }
            sender.addChatMessage(new ChatComponentText("[AnnthModCD] Item guardado en " + args[1]));
            return;
        }
        throw new WrongUsageException(getCommandUsage(sender));
    }

    @Override
    public int getRequiredPermissionLevel() { return 0; }
}