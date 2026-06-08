import './global.css';
import React from 'react';
import { Text, TextInput } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';
import { AuthProvider } from '@/contexts/AuthContext';
import AppNavigator from '@/navigation/AppNavigator';

// Make Poppins the base font for every <Text> / <TextInput> in the app.
// Weight classes (font-medium / font-bold / font-extrabold …) override the
// family via the Tailwind config, so bold text uses the proper Poppins weight
// file rather than a faux-bold of the regular face.
function patchDefaultFont(Component: any) {
  if (Component.__poppinsPatched) return;
  const oldRender = Component.render;
  Component.render = function (...args: any[]) {
    const el = oldRender.apply(this, args);
    return React.cloneElement(el, {
      style: [{ fontFamily: 'Poppins_400Regular' }, el.props.style],
    });
  };
  Component.__poppinsPatched = true;
}
patchDefaultFont(Text);
patchDefaultFont(TextInput);

export default function App() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  // Hold the UI until the fonts are ready to avoid a flash of system font.
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <AppNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
