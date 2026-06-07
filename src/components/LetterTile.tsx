import { View, Image } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

/**
 * Uniform, polished tile for a single gBOMBS food-letter image. All letters
 * render at the same square size with a glowing colored ring + tinted backing,
 * so landscape (berries/seeds) and portrait (others) source images look matched.
 */
export default function LetterTile({
  image,
  color,
  glow,
  size = 64,
  resizeMode = 'cover',
}: {
  image: ImageSourcePropType;
  color: string;
  glow: string;
  size?: number;
  /** 'cover' fills the tile (may crop edges); 'contain' shows the whole letter. */
  resizeMode?: 'cover' | 'contain';
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        borderWidth: 1.5,
        borderColor: glow + '99',
        backgroundColor: color + '1F', // ~12% tint backing
        // Colored glow (iOS shadow + Android elevation-ish via shadow on web/native)
        shadowColor: glow,
        shadowOpacity: 0.55,
        shadowRadius: size * 0.18,
        shadowOffset: { width: 0, height: 0 },
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <Image
        source={image}
        style={{ width: '100%', height: '100%' }}
        resizeMode={resizeMode}
      />
    </View>
  );
}
