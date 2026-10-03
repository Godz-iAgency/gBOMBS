import { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AuthStack';

const introSource = require('../../../assets/images/brand/sixplants-landing.mp4');

// The intro clip is 9:16 (only the aspect ratio matters here, so a higher
// resolution export with the same filename drops in unchanged). BOTTOM_EDGE was
// sampled from the clip's bottom edge so the area under it blends in.
const VIDEO_W = 9;
const VIDEO_H = 16;
const BOTTOM_EDGE = '#0d2613';

type Props = NativeStackScreenProps<AuthStackParamList, 'Landing'>;

export default function LandingScreen({ navigation }: Props) {
  // Plays once, muted, and holds on the final Six Plants logo frame.
  const player = useVideoPlayer(introSource, (p) => {
    p.loop = false;
    p.muted = true;
  });

  // Fit the whole video (never crop — the wordmark spans nearly the full
  // width), pinned to the TOP of the screen. Phones taller than 9:16 get the
  // leftover space below the video, behind the buttons, so there is never a gap
  // above it. Desktop/tablet get a phone-width column on the dark page.
  const { width: winW, height: winH } = useWindowDimensions();
  const scale = Math.min(winW / VIDEO_W, winH / VIDEO_H);
  const frameW = Math.round(VIDEO_W * scale);
  const videoH = Math.round(VIDEO_H * scale);
  const belowH = Math.max(0, winH - videoH);

  // Start playback after the view is mounted (web autoplay needs the
  // player fully attached before play() will take effect).
  useEffect(() => {
    player.play();
  }, [player]);

  return (
    <View className="flex-1 bg-surface">
      <View
        className="flex-1 self-center overflow-hidden"
        style={{ width: frameW }}
      >
        {/* Fills the space below the video on phones taller than 9:16. */}
        {belowH > 0 && (
          <View
            style={{
              position: 'absolute',
              top: videoH - 1,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: BOTTOM_EDGE,
            }}
            pointerEvents="none"
          />
        )}

        {/* Explicit width/height because expo-video's web implementation
            renders a <video> with its native pixel size as literal CSS
            width/height, which beats inset-based sizing. */}
        <VideoView
          player={player}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: videoH }}
          contentFit="contain"
          nativeControls={false}
        />

        {/* Bottom gradient — makes the buttons pop */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.8)']}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '38%' }}
          pointerEvents="none"
        />

        <SafeAreaView
          className="flex-1 justify-between"
          edges={['top', 'bottom']}
        >
          <View />

          {/* Actions — bottom zone */}
          <View className="px-6 pb-10">
            {/* Primary — new users */}
            <TouchableOpacity
              onPress={() => navigation.navigate('SignUp')}
              activeOpacity={0.85}
              className="mb-3 rounded-xl bg-brand-green py-4"
            >
              <Text className="text-center text-base font-bold text-white">
                Create account
              </Text>
            </TouchableOpacity>

            {/* Secondary — returning users */}
            <TouchableOpacity
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.85}
              className="rounded-xl border border-white/70 bg-black/30 py-4"
            >
              <Text className="text-center text-base font-semibold text-white">
                I already have an account
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </View>
  );
}
