import { invoke } from "@tauri-apps/api/core";

export enum LogLevel {
    INFO = "info",
    WARN = "warn",
    ERROR = "error",
    DEBUG = "debug",
}

class LoggerService {
    private static instance: LoggerService;

    private constructor() { }

    public static getInstance(): LoggerService {
        if (!LoggerService.instance) {
            LoggerService.instance = new LoggerService();
        }
        return LoggerService.instance;
    }

    public async log(level: LogLevel, message: string, context?: Record<string, any>) {
        try {
            await invoke("log_event", { level, message, context });
        } catch (error) {
            console.error("Failed to send log to backend:", error);
        }
    }

    public info(message: string, context?: Record<string, any>) {
        this.log(LogLevel.INFO, message, context);
    }

    public warn(message: string, context?: Record<string, any>) {
        this.log(LogLevel.WARN, message, context);
    }

    public error(message: string, context?: Record<string, any>) {
        this.log(LogLevel.ERROR, message, context);
    }

    public debug(message: string, context?: Record<string, any>) {
        this.log(LogLevel.DEBUG, message, context);
    }
}

export const Logger = LoggerService.getInstance();
