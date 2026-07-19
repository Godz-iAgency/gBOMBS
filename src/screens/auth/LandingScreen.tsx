import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AuthStack';

const introSource = require('../../../assets/images/gbombs-landing.mp4');

type Props = NativeStackScreenProps<AuthStackParamList, 'Landing'>;

export default function LandingScreen({ navigation }: Props) {
  // Loops continuously as a muted background animation.
  const player = useVideoPlayer(introSource, (p) => {
    p.loop = true;
    p.muted = true;
  });

  // Start playback after the view is mounted (web autoplay needs the
  // player fully attached before play() will take effect).
  useEffect(() => {
    player.play();
  }, [player]);

  return (
    // Page background — fills the whole window; on desktop the dark
    // surface shows on the sides of the centered phone-width frame.
    <View className="flex-1 bg-surface">
      {/* Width-capped frame, centered — keeps a giant desktop monitor from
          stretching this into an absurdly wide single column. 480 was sized
          for that desktop case but also caught tablets (e.g. a ~497-1024px
          iPad/Galaxy Tab), squeezing them into the same narrow phone-width
          column instead of using their real screen width, and forcing the
          `contentFit="contain"` video to shrink dramatically to fit that
          narrow-but-full-height box — which is what read as a large empty/
          black area top and bottom on tablet. 900 comfortably covers tablet
          widths as full-bleed while still capping true desktop. */}
      <View
        className="flex-1 w-full self-center overflow-hidden"
        style={{ maxWidth: 900 }}
      >
        {/* Full-screen animation. `contain` guarantees the whole G-BOMBS logo
            stays visible (G…S) on every screen ratio — `cover` was cropping the
            outer letters on taller/narrower phones. Letterbox areas fall back to
            the dark page background, which blends with the gradients below.
            width/height:'100%' are explicit here (not just absoluteFill's
            top/left/right/bottom:0) because expo-video's web implementation
            renders an actual <video> tag with its native pixel dimensions
            (e.g. 720x1280) as literal CSS width/height — which, in CSS, wins
            over inset-based sizing even with all four offsets at 0. Confirmed
            on the live tablet build: the video rendered unscaled at its native
            720x1280 instead of filling the container, leaving a gap on the
            right and running 256px past the bottom of the screen. */}
        <VideoView
          player={player}
          style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
          contentFit="contain"
          nativeControls={false}
        />

        {/* Dark scrim so the slogan + buttons stay readable */}
        <View
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          className="bg-black/30"
        />

        {/* Top gradient — makes the headline pop */}
        <LinearGradient
          colors={['rgba(0,0,0,0.65)', 'transparent']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '30%' }}
          pointerEvents="none"
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
          {/* Slogan — top zone, big text */}
          <Text className="px-6 pt-10 text-center text-4xl font-extrabold uppercase tracking-wide text-white">
            Healthy Eating Made Simple
          </Text>

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
