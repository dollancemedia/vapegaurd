import React from 'react';
import { cn } from '../utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'gradient';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export const Button = ({
  className,
  variant = 'primary',
  size = 'md',
  children,
  ...props
}: ButtonProps) => {
  const variants = {
    primary: 'bg-mistio-teal text-white hover:bg-opacity-90 shadow-md',
    secondary: 'bg-white text-mistio-dark border border-gray-200 hover:bg-gray-50',
    ghost: 'bg-transparent text-gray-600 hover:text-mistio-teal hover:bg-gray-50',
    gradient: 'bg-gradient-to-r from-[#2DD4BF] to-[#0F766E] text-white shadow-lg hover:opacity-90 hover:shadow-xl transition-all duration-300', // Adjusted gradient colors
  };

  const sizes = {
    sm: 'px-4 py-1.5 text-sm',
    md: 'px-6 py-2.5 text-base',
    lg: 'px-8 py-3 text-lg',
  };

  return (
    <button
      className={cn(
        'rounded-full font-medium transition-colors flex items-center justify-center gap-2',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};