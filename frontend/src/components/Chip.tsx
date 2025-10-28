interface ChipProps {
  variant?: 'filled' | 'tint' | 'outlined';
  color?: 'brand' | 'success' | 'warning' | 'danger';
  children: React.ReactNode;
}

export default function Chip({ variant = 'tint', color = 'brand', children }: ChipProps) {
  const variantClasses = {
    filled: {
      brand: 'bg-blue-600 text-white',
      success: 'bg-green-600 text-white',
      warning: 'bg-yellow-600 text-white',
      danger: 'bg-red-600 text-white'
    },
    tint: {
      brand: 'bg-blue-100 text-blue-800',
      success: 'bg-green-100 text-green-800',
      warning: 'bg-yellow-100 text-yellow-800',
      danger: 'bg-red-100 text-red-800'
    },
    outlined: {
      brand: 'border-2 border-blue-600 text-blue-600 bg-white',
      success: 'border-2 border-green-600 text-green-600 bg-white',
      warning: 'border-2 border-yellow-600 text-yellow-600 bg-white',
      danger: 'border-2 border-red-600 text-red-600 bg-white'
    }
  };

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${variantClasses[variant][color]}`}>
      {children}
    </span>
  );
}
