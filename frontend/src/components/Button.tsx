import type { ButtonHTMLAttributes } from 'react';

export function Button({ variant = 'secondary', iconOnly = false, className = '', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger'; iconOnly?: boolean;
}) {
  return <button type={type} className={`ui-button ui-button-${variant}${iconOnly ? ' ui-icon-button' : ''} ${className}`} {...props} />;
}
