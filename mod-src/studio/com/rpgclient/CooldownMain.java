package com.rpgclient;

import com.rpgclient.cooldown.CommandCooldown;
import com.rpgclient.cooldown.CommandAbs;
import com.rpgclient.cooldown.CommandArmor;
import com.rpgclient.cooldown.CommandHand;
import com.rpgclient.cooldown.AbsorptionManager;
import com.rpgclient.cooldown.CooldownEventHandler;
import com.rpgclient.cooldown.CooldownManager;
import com.rpgclient.cooldown.GuiCooldownInventory;
import com.rpgclient.cooldown.HealManager;
import com.rpgclient.cooldown.CommandTools;
import com.rpgclient.cooldown.CommandRMenu;
import com.rpgclient.cooldown.ToolsEventHandler;
import com.rpgclient.cooldown.ToolsManager;
import net.minecraftforge.client.ClientCommandHandler;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.common.event.FMLInitializationEvent;

@Mod(
        modid = CooldownMain.MOD_ID,
        name = CooldownMain.NAME,
        version = CooldownMain.VERSION,
        clientSideOnly = true,
        acceptedMinecraftVersions = "[1.8.9]"
)
public class CooldownMain {
    public static final String MOD_ID = "annthmodcd";
    public static final String NAME = "AnnthModCD";
    public static final String VERSION = "1.1.63";

    @Mod.EventHandler
    public void init(FMLInitializationEvent event) {
        CooldownManager.load();
        AbsorptionManager.load();
        HealManager.load();
        ToolsManager.load();
        ClientCommandHandler.instance.registerCommand(new CommandCooldown());
        ClientCommandHandler.instance.registerCommand(new CommandAbs());
        ClientCommandHandler.instance.registerCommand(new CommandArmor());
        ClientCommandHandler.instance.registerCommand(new CommandHand());
        ClientCommandHandler.instance.registerCommand(new CommandTools());
        ClientCommandHandler.instance.registerCommand(new CommandRMenu());
        MinecraftForge.EVENT_BUS.register(new CooldownEventHandler());
        ToolsEventHandler.registerKeys();
        MinecraftForge.EVENT_BUS.register(new ToolsEventHandler());
        MinecraftForge.EVENT_BUS.register(new GuiCooldownInventory());
        System.out.println("[AnnthModCD] Original 1.1.63 integrado; comandos y eventos registrados.");
    }
}
