import { QRCodeSVG } from "qrcode.react";

export function VisualQr({ size = 240, value }: { size?: number; value: string }) {
  return (
    <QRCodeSVG
      value={value}
      size={size}
      bgColor="#ffffff"
      fgColor="#0a0a0a"
      level="M"
      marginSize={2}
      role="img"
      aria-label={`Join QR code for ${value}`}
    />
  );
}
