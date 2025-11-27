import { ChevronRight, Home } from "lucide-react";

interface BreadcrumbsProps {
    path: string | null;
}

export function Breadcrumbs({ path }: BreadcrumbsProps) {
    if (!path) return null;

    // Normalize path separators
    const parts = path.split(/[/\\]/).filter(Boolean);

    return (
        <div className="flex items-center text-xs text-muted-foreground px-4 py-2 border-b border-border/50 bg-background/50 backdrop-blur-sm">
            <Home size={12} className="mr-1" />
            {parts.map((part, index) => (
                <div key={index} className="flex items-center">
                    <ChevronRight size={12} className="mx-1 text-muted-foreground/50" />
                    <span className={index === parts.length - 1 ? "text-foreground font-medium" : ""}>
                        {part}
                    </span>
                </div>
            ))}
        </div>
    );
}
