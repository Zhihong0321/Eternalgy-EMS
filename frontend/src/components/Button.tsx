interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'filled' | 'border' | 'plain';
  color?: 'primary' | 'secondary' | 'warning';
  children: React.ReactNode;
}

export default function Button({ variant = 'filled', color = 'primary', children, className = '', ...props }: ButtonProps) {
  const variantClasses = {
    filled: {
      primary: 'bg-blue-600 hover:bg-blue-700 text-white',
      secondary: 'bg-gray-600 hover:bg-gray-700 text-white',
      warning: 'bg-yellow-600 hover:bg-yellow-700 text-white'
    },
    border: {
      primary: 'border-2 border-blue-600 text-blue-600 hover:bg-blue-50',
      secondary: 'border-2 border-gray-600 text-gray-600 hover:bg-gray-50',
      warning: 'border-2 border-yellow-600 text-yellow-600 hover:bg-yellow-50'
    },
    plain: {
      primary: 'text-blue-600 hover:bg-blue-50',
      secondary: 'text-gray-600 hover:bg-gray-50',
      warning: 'text-yellow-600 hover:bg-yellow-50'
    }
  };

  return (
    <button
      className={`px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant][color]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
