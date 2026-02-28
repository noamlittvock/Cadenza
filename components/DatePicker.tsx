import React, { useRef } from 'react';

interface DatePickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
    type?: 'date' | 'datetime-local';
}

export const DatePicker = React.forwardRef<HTMLInputElement, DatePickerProps>(
    ({ type = 'date', onChange, ...props }, forwardedRef) => {
        const internalRef = useRef<HTMLInputElement>(null);

        // Merge forwarded ref and internal ref
        const setRefs = (node: HTMLInputElement) => {
            internalRef.current = node;
            if (typeof forwardedRef === 'function') {
                forwardedRef(node);
            } else if (forwardedRef) {
                forwardedRef.current = node;
            }
        };

        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            if (onChange) {
                onChange(e);
            }
            // Instantly blur the input so the native date picker popover closes
            if (internalRef.current) {
                internalRef.current.blur();
            }
        };

        return (
            <input
                type={type}
                ref={setRefs}
                onChange={handleChange}
                {...props}
            />
        );
    }
);

DatePicker.displayName = 'DatePicker';
