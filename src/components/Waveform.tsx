export function Waveform({
  active = false,
  bars = 17,
}: {
  active?: boolean;
  bars?: number;
}) {
  const heights = [
    8, 22, 12, 27, 15, 30, 14, 21, 9, 25, 12, 28, 17, 23, 10, 20, 14,
  ];
  return (
    <span
      className={`waveform ${active ? "waveform--active" : ""}`}
      aria-hidden="true"
    >
      {Array.from({ length: bars }, (_, index) => (
        <span
          key={index}
          style={{
            height: heights[index % heights.length],
            animationDelay: `${(index % 6) * -0.13}s`,
          }}
        />
      ))}
    </span>
  );
}
