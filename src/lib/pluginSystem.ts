import { Command } from "../types/plugins";

type CommandHandler = () => void;

class CommandRegistry {
    private commands: Map<string, Command> = new Map();
    private listeners: Set<() => void> = new Set();

    register(id: string, title: string, action: CommandHandler) {
        this.commands.set(id, { id, title, action });
        this.notify();
        return {
            dispose: () => {
                this.commands.delete(id);
                this.notify();
            }
        };
    }

    getCommands(): Command[] {
        return Array.from(this.commands.values());
    }

    execute(id: string) {
        const cmd = this.commands.get(id);
        if (cmd) {
            try {
                cmd.action();
            } catch (e) {
                console.error(`Error executing command ${id}:`, e);
            }
        } else {
            console.warn(`Command ${id} not found`);
        }
    }

    subscribe(listener: () => void) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notify() {
        this.listeners.forEach(l => l());
    }
}

export const commandRegistry = new CommandRegistry();

// The API we expose to plugins
export const createNexusAPI = (toast: { success: (m: string) => void; error: (m: string) => void }) => ({
    commands: {
        register: (id: string, title: string, action: () => void) => {
            return commandRegistry.register(id, title, action);
        }
    },
    toast: {
        success: toast.success,
        error: toast.error
    }
});
