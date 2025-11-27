import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { getCurrentTheme, setCurrentTheme, applyTheme, themes } from '../lib/themes';

type ThemeContextType = {
    theme: string;
    setTheme: (theme: string) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState(getCurrentTheme);

    const setTheme = (newTheme: string) => {
        setThemeState(newTheme);
        setCurrentTheme(newTheme);
    };

    useEffect(() => {
        // Apply theme on mount and when it changes
        const currentThemeObj = themes[theme];
        if (currentThemeObj) {
            applyTheme(currentThemeObj);
        }

        // Dispatch event for Monaco editor to update
        window.dispatchEvent(new CustomEvent('theme-changed', { detail: theme }));
    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within ThemeProvider');
    }
    return context;
}
