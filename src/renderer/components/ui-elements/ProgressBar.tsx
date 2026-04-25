export function ProgressBar({ value }: { value: number }) {
  return (
    <div
      className="h-2 rounded-full bg-gray-200"
      style={{
        background: 'linear-gradient(270deg, #f43f5e, #8b5cf6, #3b82f6)',
        width: `${value}%`,
      }}
    />
  )
}
