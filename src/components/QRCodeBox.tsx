import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

/**
 * A brand-styled QR code on a white tile (QR codes need a light background and a
 * quiet border to scan reliably on a dark UI). Renders the same on web and
 * native via react-native-svg.
 */
export default function QRCodeBox({
  value,
  size = 200,
}: {
  value: string;
  size?: number;
}) {
  return (
    <View
      className="self-center rounded-2xl bg-white p-4"
      accessibilityRole="image"
      accessibilityLabel="Invite QR code"
    >
      <QRCode
        value={value}
        size={size}
        color="#0A0A0A"
        backgroundColor="#FFFFFF"
      />
    </View>
  );
}
