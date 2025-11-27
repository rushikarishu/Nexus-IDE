import { useEffect, useRef } from "react";

export interface MenuItem {
    label?: string;
    shortcut?: string;
    onClick?: () => void;
    separator?: boolean;
    disabled?: boolean;
}

interface MenuDropdownProps {
    trigger: React.ReactNode;
    items: MenuItem[];
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

export function MenuDropdown({ trigger, items, isOpen, onOpenChange }: MenuDropdownProps) {
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                onOpenChange(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onOpenChange(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [isOpen, onOpenChange]);

    return (
        <div className="relative" ref={dropdownRef}>
            <div onClick={() => onOpenChange(!isOpen)}>
                {trigger}
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 min-w-[200px] bg-popover border border-border rounded-md shadow-lg z-[100] py-1">
                    {items.map((item, index) => {
                        if (item.separator) {
                            return <div key={index} className="h-px bg-border my-1" />;
                        }

                        return (
                            <button
                                key={index}
                                disabled={item.disabled}
                                onClick={() => {
                                    if (item.onClick && !item.disabled) {
                                        item.onClick();
                                        onOpenChange(false);
                                    }
                                }}
                                className="w-full px-3 py-1.5 text-left text-sm flex items-center justify-between hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <span>{item.label}</span>
                                {item.shortcut && (
                                    <span className="text-xs text-muted-foreground ml-4">{item.shortcut}</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
