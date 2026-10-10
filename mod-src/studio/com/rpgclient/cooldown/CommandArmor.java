package com.rpgclient.cooldown;

import net.minecraft.command.CommandBase;
import net.minecraft.command.ICommandSender;
import net.minecraft.util.ChatComponentText;

public class CommandArmor extends CommandBase {
    @Override
    public String getCommandName() {
        return "armor";
    }

    @Override
    public String getCommandUsage(ICommandSender sender) {
        return "/armor";
    }

    @Override
    public void processCommand(ICommandSender sender, String[] args) {
        GuiCooldownInventory.toggleArmorOverlay();
        sender.addChatMessage(new ChatComponentText("[RPGClient] HUD de armadura "
                + (GuiCooldownInventory.isArmorOverlayEnabled() ? "activado." : "desactivado.")));
    }

    @Override
    public int getRequiredPermissionLevel() {
        return 0;
    }
}
