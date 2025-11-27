import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VariableViewer, WatchPanel, StackFrameItem } from './DebugComponents';

describe('DebugComponents - VariableViewer', () => {
    it('renders variables with name and value', () => {
        const variables = [
            { name: 'x', value: '5', type: 'number' },
            { name: 'y', value: '10', type: 'number' },
        ];

        render(<VariableViewer variables={variables} />);

        expect(screen.getByText('x')).toBeInTheDocument();
        expect(screen.getByText('5')).toBeInTheDocument();
        expect(screen.getByText('y')).toBeInTheDocument();
        expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('displays type information when available', () => {
        const variables = [
            { name: 'count', value: '42', type: 'number' },
        ];

        render(<VariableViewer variables={variables} />);

        expect(screen.getByText('(number)')).toBeInTheDocument();
    });

    it('shows message when no variables available', () => {
        render(<VariableViewer variables={[]} />);

        expect(screen.getByText('No variables in current scope')).toBeInTheDocument();
    });

    it('handles expandable variables with variablesReference', () => {
        const variables = [
            { name: 'obj', value: '{...}', variablesReference: 123 },
        ];

        const onExpand = vi.fn();

        render(<VariableViewer variables={variables} onExpand={onExpand} />);

        const variableElement = screen.getByText('obj');
        fireEvent.click(variableElement.parentElement!);

        expect(onExpand).toHaveBeenCalledWith(123);
    });
});

describe('DebugComponents - WatchPanel', () => {
    it('renders watch panel with add button', () => {
        const watches: any[] = [];
        const onAdd = vi.fn();
        const onRemove = vi.fn();
        const onEvaluate = vi.fn();

        render(
            <WatchPanel
                watches={watches}
                onAdd={onAdd}
                onRemove={onRemove}
                onEvaluate={onEvaluate}
            />
        );

        expect(screen.getByText('Watch')).toBeInTheDocument();
        expect(screen.getByText('No watch expressions. Click + to add.')).toBeInTheDocument();
    });

    it('shows input field when clicking add button', () => {
        const watches: any[] = [];
        const onAdd = vi.fn();
        const onRemove = vi.fn();
        const onEvaluate = vi.fn();

        render(
            <WatchPanel
                watches={watches}
                onAdd={onAdd}
                onRemove={onRemove}
                onEvaluate={onEvaluate}
            />
        );

        const addButton = screen.getByTitle('Add expression');
        fireEvent.click(addButton);

        expect(screen.getByPlaceholderText('Expression to watch')).toBeInTheDocument();
    });

    it('calls onAdd when submitting new expression', () => {
        const watches: any[] = [];
        const onAdd = vi.fn();
        const onRemove = vi.fn();
        const onEvaluate = vi.fn();

        render(
            <WatchPanel
                watches={watches}
                onAdd={onAdd}
                onRemove={onRemove}
                onEvaluate={onEvaluate}
            />
        );

        const addButton = screen.getByTitle('Add expression');
        fireEvent.click(addButton);

        const input = screen.getByPlaceholderText('Expression to watch');
        fireEvent.change(input, { target: { value: 'x + y' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(onAdd).toHaveBeenCalledWith('x + y');
    });

    it('displays watch expressions with their values', () => {
        const watches = [
            { id: '1', expression: 'x + y', value: '15' },
            { id: '2', expression: 'count * 2', value: '84' },
        ];
        const onAdd = vi.fn();
        const onRemove = vi.fn();
        const onEvaluate = vi.fn();

        render(
            <WatchPanel
                watches={watches}
                onAdd={onAdd}
                onRemove={onRemove}
                onEvaluate={onEvaluate}
            />
        );

        expect(screen.getByText('x + y')).toBeInTheDocument();
        expect(screen.getByText('15')).toBeInTheDocument();
        expect(screen.getByText('count * 2')).toBeInTheDocument();
        expect(screen.getByText('84')).toBeInTheDocument();
    });

    it('shows error message when evaluation fails', () => {
        const watches = [
            { id: '1', expression: 'invalid', error: 'Undefined variable' },
        ];
        const onAdd = vi.fn();
        const onRemove = vi.fn();
        const onEvaluate = vi.fn();

        render(
            <WatchPanel
                watches={watches}
                onAdd={onAdd}
                onRemove={onRemove}
                onEvaluate={onEvaluate}
            />
        );

        expect(screen.getByText('Undefined variable')).toBeInTheDocument();
    });

    it('calls onRemove when clicking remove button', () => {
        const watches = [
            { id: 'watch-1', expression: 'x + y', value: '15' },
        ];
        const onAdd = vi.fn();
        const onRemove = vi.fn();
        const onEvaluate = vi.fn();

        render(
            <WatchPanel
                watches={watches}
                onAdd={onAdd}
                onRemove={onRemove}
                onEvaluate={onEvaluate}
            />
        );

        const removeButton = screen.getByTitle('Remove');
        fireEvent.click(removeButton);

        expect(onRemove).toHaveBeenCalledWith('watch-1');
    });
});

describe('DebugComponents - StackFrameItem', () => {
    const mockFrame = {
        id: 1,
        name: 'myFunction',
        source: { path: '/home/user/project/src/main.ts' },
        line: 42,
        column: 10,
    };

    it('renders stack frame with function name and location', () => {
        render(
            <StackFrameItem
                frame={mockFrame}
                isActive={false}
                onClick={vi.fn()}
            />
        );

        expect(screen.getByText('myFunction')).toBeInTheDocument();
        expect(screen.getByText(/main.ts :42:10/)).toBeInTheDocument();
    });

    it('highlights active frame', () => {
        const { container } = render(
            <StackFrameItem
                frame={mockFrame}
                isActive={true}
                onClick={vi.fn()}
            />
        );

        const frameElement = container.firstChild as HTMLElement;
        expect(frameElement.className).toContain('bg-primary');
    });

    it('calls onClick when clicked', () => {
        const onClick = vi.fn();

        render(
            <StackFrameItem
                frame={mockFrame}
                isActive={false}
                onClick={onClick}
            />
        );

        const frameElement = screen.getByText('myFunction');
        fireEvent.click(frameElement);

        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('calls onNavigate when double-clicked', () => {
        const onNavigate = vi.fn();

        render(
            <StackFrameItem
                frame={mockFrame}
                isActive={false}
                onClick={vi.fn()}
                onNavigate={onNavigate}
            />
        );

        const frameElement = screen.getByText('myFunction');
        fireEvent.doubleClick(frameElement);

        expect(onNavigate).toHaveBeenCalledWith('/home/user/project/src/main.ts', 42, 10);
    });

    it('handles frames without source path', () => {
        const frameWithoutSource = {
            id: 2,
            name: '<anonymous>',
            line: 10,
            column: 5,
        };

        render(
            <StackFrameItem
                frame={frameWithoutSource}
                isActive={false}
                onClick={vi.fn()}
            />
        );

        expect(screen.getByText('<anonymous>')).toBeInTheDocument();
        expect(screen.getByText('Line 10:5')).toBeInTheDocument();
    });

    it('truncates long file paths to show only filename', () => {
        render(
            <StackFrameItem
                frame={mockFrame}
                isActive={false}
                onClick={vi.fn()}
            />
        );

        // Should show only "main.ts", not the full path
        expect(screen.getByText(/main.ts/)).toBeInTheDocument();
        expect(screen.queryByText('/home/user/project/src/main.ts')).not.toBeInTheDocument();
    });
});
