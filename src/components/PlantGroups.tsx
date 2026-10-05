import { View, Text, Image, TouchableOpacity, Platform, StyleSheet, type ViewStyle } from 'react-native';
import { createElement, type ComponentProps, type ElementType } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { GBOMBS_LETTERS } from '@/utils/gbombsImages';
import { PLANT_DETAILS } from '@/utils/plantGroupDetails';
import type { GBombsCategoryKey } from '@/utils/gbombsPresets';
import NativeSvg, { Path as NativePath, Circle as NativeCircle, Ellipse as NativeEllipse, G as NativeG } from 'react-native-svg';

// Flatten interop styles before passing SVG props to browser elements.
function webShape(tag: 'svg' | 'path' | 'circle' | 'ellipse' | 'g'): ElementType {
  return function WebShape(props: ComponentProps<typeof NativeSvg>) {
    return createElement(tag, { ...props, style: StyleSheet.flatten(props.style) });
  };
}
const Svg: ElementType = Platform.OS === 'web' ? webShape('svg') : NativeSvg;
const Path: ElementType = Platform.OS === 'web' ? webShape('path') : NativePath;
const Circle: ElementType = Platform.OS === 'web' ? webShape('circle') : NativeCircle;
const Ellipse: ElementType = Platform.OS === 'web' ? webShape('ellipse') : NativeEllipse;
const G: ElementType = Platform.OS === 'web' ? webShape('g') : NativeG;
export const PLANT_LABELS: Record<GBombsCategoryKey, string> = {
  greens: 'Greens', beans: 'Beans', onion: 'Onions',
  mushroom: 'Mushrooms', berries: 'Berries', seeds: 'Seeds & nuts',
};

/** Crisp, scalable food symbols with one consistent stroke weight. */
export function PlantIcon({ category, color = '#A8A29E', size = 24 }: {
  category: GBombsCategoryKey; color?: string; size?: number;
}) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' })}>
    <G fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {category === 'greens' && <><Path d="M5 19C2 11 7 4 20 4c0 13-7 18-15 15Z" /><Path d="m4 21 11-11m-7 7v-5m3 2h5" /></>}
      {category === 'beans' && <><Path d="M14 3c-6-1-11 4-11 10 0 5 4 8 8 7 4-1 4-5 2-7-2-2-1-4 1-5 3-2 3-4 0-5Z" /><Path d="M19 8c4 2 4 7 1 10-2 3-5 3-6 2m-7-8c-1 2 0 4 2 5" /></>}
      {category === 'onion' && <><Path d="M10 3h4l-1 5c3 2 7 4 7 8 0 4-4 6-8 6s-8-2-8-6c0-4 4-6 7-8Z" /><Path d="M11 9c-4 7-4 10 1 13m1-13c4 7 4 10-1 13" /></>}
      {category === 'mushroom' && <><Path d="M3 13C3 1 21 1 21 13H3Zm7 0-1 8h6l-1-8" /><Circle cx={8} cy={10} r={.7} /><Circle cx={15} cy={8} r={.7} /></>}
      {category === 'berries' && <><Circle cx={8} cy={15} r={5} /><Circle cx={16} cy={15} r={5} /><Path d="M12 10V4m0 3C7 7 6 3 6 3c5 0 6 4 6 4Zm0 0c5 0 6-4 6-4-5 0-6 4-6 4" /></>}
      {category === 'seeds' && <><Ellipse cx={8} cy={12} rx={4} ry={8} transform="rotate(-25 8 12)" /><Ellipse cx={17} cy={14} rx={3.5} ry={6} transform="rotate(25 17 14)" /><Path d="m6 7 4 10m9-7-4 8" /></>}
    </G>
  </Svg>;
}

export function PlantGroupTiles({ hit, logged = false, onSelect, tileHeight, large = false }: {
  hit: string[];
  logged?: boolean;
  onSelect?: (category: GBombsCategoryKey) => void;
  tileHeight?: number;
  large?: boolean;
}) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: large ? 12 : 8 }}>
    {GBOMBS_LETTERS.map(meta => {
      const included = hit.includes(meta.key);
      const label = `${PLANT_LABELS[meta.key]}: ${included ? 'included' : logged ? 'not included' : 'not logged'}`;
      const style: ViewStyle = {
        width: '30%', flexGrow: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12,
        minHeight: onSelect ? tileHeight ?? 70 : undefined, justifyContent: onSelect ? 'center' : undefined,
        overflow: onSelect ? 'hidden' : undefined, borderWidth: 1,
        borderColor: included ? meta.glow + (onSelect ? '88' : '55') : onSelect ? '#3B4235' : '#2B3028',
        backgroundColor: included ? meta.glow + '14' : '#FFFFFF04',
      };
      const content = <>
        {onSelect && <>
          <Image source={PLANT_DETAILS[meta.key].image} accessible={false} resizeMode="cover"
            style={[StyleSheet.absoluteFill, { width: '100%', height: '100%', opacity: logged && !included ? 0.4 : 0.8 }]} />
          <LinearGradient pointerEvents="none" colors={['#0A120A55', '#080E08D9']}
            style={StyleSheet.absoluteFill} />
        </>}
        {onSelect ? (
          <View style={{ zIndex: 1, backgroundColor: '#061006B3', borderRadius: 7,
            paddingHorizontal: large ? 10 : 4, paddingVertical: large ? 8 : 5, maxWidth: '100%' }}>
            <Text style={{ color: '#FFFFFF', fontSize: large ? 14 : 11, fontWeight: '700', textAlign: 'center' }}>
              {PLANT_LABELS[meta.key]}
            </Text>
          </View>
        ) : <>
          <PlantIcon category={meta.key} color={included ? meta.glow : '#979D91'} />
          <Text style={{ color: included ? '#F5F5F4' : '#B6BAB1', fontSize: 11, fontWeight: '600', marginTop: 7 }}>
            {PLANT_LABELS[meta.key]}
          </Text>
        </>}
      </>;
      return onSelect
        ? <TouchableOpacity key={meta.key} onPress={() => onSelect(meta.key)} activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel={`Learn about ${PLANT_LABELS[meta.key]}. ${label}`}
            accessibilityHint="Opens a short food group benefit" style={style}>{content}</TouchableOpacity>
        : <View key={meta.key} accessibilityLabel={label} style={style}>{content}</View>;
    })}
  </View>;
}
