interface Props {
  size?: number;
  className?: string;
}

export default function SchoolLogo({ size = 32, className = '' }: Props) {
  return (
    <img
      src="/logo.png"
      alt="СОШ №44"
      width={size}
      height={size}
      className={['rounded-[10px] object-contain shrink-0', className].join(' ')}
      style={{ width: size, height: size }}
    />
  );
}
