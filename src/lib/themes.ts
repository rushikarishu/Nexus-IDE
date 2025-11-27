// Theme definitions for Nexus IDE
export interface Theme {
    name: string;
    displayName: string;
    colors: {
        background: string;
        foreground: string;
        card: string;
        cardForeground: string;
        primary: string;
        primaryForeground: string;
        secondary: string;
        secondaryForeground: string;
        muted: string;
        mutedForeground: string;
        accent: string;
        accentForeground: string;
        border: string;
        input: string;
        ring: string;
        // Editor specific
        editorBackground: string;
        editorForeground: string;
        editorLineHighlight: string;
        editorLineNumber: string;
        editorIndentGuide: string;
        editorSelection: string;
        editorCursor: string;
    };
}

export const darkTheme: Theme = {
    name: 'dark',
    displayName: 'Dark',
    colors: {
        background: '#020817',
        foreground: '#f8fafc',
        card: '#0f172a',
        cardForeground: '#f8fafc',
        primary: '#3b82f6',
        primaryForeground: '#f8fafc',
        secondary: '#1e293b',
        secondaryForeground: '#f8fafc',
        muted: '#1e293b',
        mutedForeground: '#94a3b8',
        accent: '#1e293b',
        accentForeground: '#f8fafc',
        border: '#1e293b',
        input: '#1e293b',
        ring: '#3b82f6',
        // Editor
        editorBackground: '#020817',
        editorForeground: '#f8fafc',
        editorLineHighlight: '#1e293b',
        editorLineNumber: '#64748b',
        editorIndentGuide: '#1e293b',
        editorSelection: '#334155',
        editorCursor: '#3b82f6',
    },
};

export const lightTheme: Theme = {
    name: 'light',
    displayName: 'Light',
    colors: {
        background: '#ffffff',
        foreground: '#020817',
        card: '#f8fafc',
        cardForeground: '#020817',
        primary: '#3b82f6',
        primaryForeground: '#ffffff',
        secondary: '#f1f5f9',
        secondaryForeground: '#020817',
        muted: '#f1f5f9',
        mutedForeground: '#64748b',
        accent: '#f1f5f9',
        accentForeground: '#020817',
        border: '#e2e8f0',
        input: '#f1f5f9',
        ring: '#3b82f6',
        // Editor
        editorBackground: '#ffffff',
        editorForeground: '#020817',
        editorLineHighlight: '#f8fafc',
        editorLineNumber: '#94a3b8',
        editorIndentGuide: '#e2e8f0',
        editorSelection: '#dbeafe',
        editorCursor: '#3b82f6',
    },
};

export const themes: Record<string, Theme> = {
    dark: darkTheme,
    light: lightTheme,
};

export function getCurrentTheme(): string {
    return localStorage.getItem('nexus-theme') || 'dark';
}

export function setCurrentTheme(themeName: string): void {
    localStorage.setItem('nexus-theme', themeName);
    applyTheme(themes[themeName]);
}

export function applyTheme(theme: Theme): void {
    const root = document.documentElement;

    // Apply CSS variables
    root.style.setProperty('--background', theme.colors.background);
    root.style.setProperty('--foreground', theme.colors.foreground);
    root.style.setProperty('--card', theme.colors.card);
    root.style.setProperty('--card-foreground', theme.colors.cardForeground);
    root.style.setProperty('--primary', theme.colors.primary);
    root.style.setProperty('--primary-foreground', theme.colors.primaryForeground);
    root.style.setProperty('--secondary', theme.colors.secondary);
    root.style.setProperty('--secondary-foreground', theme.colors.secondaryForeground);
    root.style.setProperty('--muted', theme.colors.muted);
    root.style.setProperty('--muted-foreground', theme.colors.mutedForeground);
    root.style.setProperty('--accent', theme.colors.accent);
    root.style.setProperty('--accent-foreground', theme.colors.accentForeground);
    root.style.setProperty('--border', theme.colors.border);
    root.style.setProperty('--input', theme.colors.input);
    root.style.setProperty('--ring', theme.colors.ring);
}
