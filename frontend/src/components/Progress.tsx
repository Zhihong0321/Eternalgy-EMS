interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
}

export default function Progress({ value, className = '', ...props }: ProgressProps) {
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div className={`w-full bg-gray-200 rounded-full overflow-hidden ${className}`} {...props}>
      <div
        className="bg-blue-600 h-full transition-all duration-300 ease-in-out"
        style={{ width: `${clampedValue}%` }}
      />
    </div>
  );
}
