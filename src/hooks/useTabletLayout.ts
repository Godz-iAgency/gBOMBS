import { useWindowDimensions } from 'react-native';

/** Keep compact phone layouts, including phones turned sideways. */
export function useTabletLayout() {
  const { width, height } = useWindowDimensions();
  const tablet = Math.min(width, height) >= 600;
  return { width, height, tablet, landscape: tablet && width > height };
}
