import { useMemo } from "react";

export function VisualQr({ size = 240 }: { size?: number }) {
  const modules = 25;
  const cell = size / modules;
  const cells = useMemo(() => {
    let seed = 7 * 9301 + 49297;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const out: Array<[number, number]> = [];
    const reserved = (x: number, y: number) =>
      (x < 7 && y < 7) || (x >= modules - 7 && y < 7) || (x < 7 && y >= modules - 7);

    for (let y = 0; y < modules; y += 1) {
      for (let x = 0; x < modules; x += 1) {
        if (!reserved(x, y) && rand() > 0.52) {
          out.push([x, y]);
        }
      }
    }
    return out;
  }, []);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label="Join QR code" role="img">
      <rect width={size} height={size} fill="#fff" />
      {cells.map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x * cell + cell * 0.08}
          y={y * cell + cell * 0.08}
          width={cell * 0.84}
          height={cell * 0.84}
          rx={cell * 0.3}
          fill="#0a0a0a"
        />
      ))}
      {[
        [0, 0],
        [modules - 7, 0],
        [0, modules - 7],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`} transform={`translate(${x * cell} ${y * cell})`}>
          <rect width={cell * 7} height={cell * 7} rx={cell * 1.6} fill="#0a0a0a" />
          <rect x={cell} y={cell} width={cell * 5} height={cell * 5} rx={cell * 1.1} fill="#fff" />
          <rect x={cell * 2} y={cell * 2} width={cell * 3} height={cell * 3} rx={cell * 0.7} fill="#0a0a0a" />
        </g>
      ))}
      <rect x={1} y={1} width={size - 2} height={size - 2} fill="none" stroke="#0a0a0a" strokeOpacity="0.15" />
    </svg>
  );
}

