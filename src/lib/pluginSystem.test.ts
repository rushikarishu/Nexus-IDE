import { describe, it, expect, vi, beforeEach } from 'vitest';
import { commandRegistry, createNexusAPI } from './pluginSystem';

describe('commandRegistry', () => {
    const anyRegistry = commandRegistry as any;

    beforeEach(() => {
        // Reset internal singleton state between tests
        anyRegistry.commands.clear();
        anyRegistry.listeners.clear();
    });

    it('registers commands and executes them', () => {
        const action = vi.fn();

        commandRegistry.register('test', 'Test Command', action);

        const commands = commandRegistry.getCommands();
        expect(commands).toHaveLength(1);
        expect(commands[0]).toMatchObject({ id: 'test', title: 'Test Command' });

        commandRegistry.execute('test');
        expect(action).toHaveBeenCalledTimes(1);
    });

    it('disposes commands and removes them from the registry', () => {
        const action = vi.fn();
        const disposable = commandRegistry.register('test', 'Test Command', action);

        expect(commandRegistry.getCommands()).toHaveLength(1);
        disposable.dispose();
        expect(commandRegistry.getCommands()).toHaveLength(0);
    });

    it('notifies subscribers on register and dispose', () => {
        const listener = vi.fn();
        commandRegistry.subscribe(listener);

        const disposable = commandRegistry.register('test', 'Test Command', () => { });
        expect(listener).toHaveBeenCalledTimes(1);

        disposable.dispose();
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('logs a warning when executing an unknown command', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

        commandRegistry.execute('missing');

        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('catches errors thrown by command handlers', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        commandRegistry.register('boom', 'Boom', () => {
            throw new Error('fail');
        });

        commandRegistry.execute('boom');

        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});

describe('createNexusAPI', () => {
    it('registers commands and forwards toast calls', () => {
        const anyRegistry = commandRegistry as any;
        anyRegistry.commands.clear();
        anyRegistry.listeners.clear();

        const success = vi.fn();
        const error = vi.fn();

        const api = createNexusAPI({ success, error });

        const action = vi.fn();
        const disposable = api.commands.register('plugin.cmd', 'Plugin Command', action);

        expect(commandRegistry.getCommands()).toHaveLength(1);

        // Executing through the registry should invoke the registered action
        commandRegistry.execute('plugin.cmd');
        expect(action).toHaveBeenCalledTimes(1);

        api.toast.success('ok');
        api.toast.error('bad');

        expect(success).toHaveBeenCalledWith('ok');
        expect(error).toHaveBeenCalledWith('bad');

        disposable.dispose();
        expect(commandRegistry.getCommands()).toHaveLength(0);
    });
});
