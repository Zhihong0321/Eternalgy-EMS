interface BadgeProps {
  variant?: 'sm' | 'md' | 'lg';
  color?: 'available' | 'offline' | 'default';
  text: string;
}

export default function Badge({ variant = 'md', color = 'default', text }: BadgeProps) {
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base'
  };

  const colorClasses = {
    available: 'bg-green-100 text-green-800 border-green-300',
    offline: 'bg-gray-100 text-gray-800 border-gray-300',
    default: 'bg-blue-100 text-blue-800 border-blue-300'
  };

  return (
    <span className={`inline-flex items-center rounded-full border font-medium ${sizeClasses[variant]} ${colorClasses[color]}`}>
      {text}
    </span>
  );
}
