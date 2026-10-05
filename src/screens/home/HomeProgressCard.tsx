import { View, Text, TouchableOpacity, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TrendPoint } from '@/lib/reports';

export default function HomeProgressCard({ trend, streak, weekDays, onPress, tablet = false, chartHeight = 70, style }: {
  trend: TrendPoint[]; streak: number; weekDays: number; onPress: () => void;
  tablet?: boolean; chartHeight?: number; style?: ViewStyle;
}) {
  const logged = trend.some(point => point.score !== null);
  return <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel="View progress report" activeOpacity={0.9}
    style={[{ marginTop: 16, backgroundColor: '#161816', borderColor: '#30352D', borderWidth: 1, borderRadius: 20, padding: tablet ? 24 : 20 }, style]}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <View style={tablet ? { flex: 1 } : undefined}><Text style={{ color: '#FAFAF9', fontSize: tablet ? 22 : 18, fontWeight: '700' }}>Your progress</Text>
        <Text style={{ color: '#A8A29E', fontSize: 12, marginTop: 4 }}>Plant groups logged over the last 7 days</Text></View>
      <Ionicons name="bar-chart-outline" color="#8BBF6C" size={22} />
    </View>
    <View style={{ flexDirection: 'row', marginTop: 20, gap: 24 }}>
      <View style={{ flex: 1 }}><Text style={{ color: '#FAFAF9', fontSize: 26, fontWeight: '700' }}>{streak}<Text style={{ fontSize: 12, color: '#A8A29E' }}> day streak</Text></Text></View>
      <View style={{ flex: 1 }}><Text style={{ color: '#FAFAF9', fontSize: 26, fontWeight: '700' }}>{weekDays}/7</Text><Text style={{ fontSize: 11, color: '#A8A29E' }}>Days logged this week</Text></View>
    </View>
    <View style={{ flexDirection: 'row', gap: tablet ? 16 : 10, marginTop: tablet ? 24 : 18, flexGrow: tablet ? 1 : undefined, alignItems: tablet ? 'flex-end' : undefined }}>
      {trend.map(point => {
        const date = new Date(`${point.date}T12:00:00`);
        const label = date.toLocaleDateString('en-US', { weekday: 'short' });
        return <View key={point.date} style={{ flex: 1, alignItems: 'center' }} accessibilityLabel={`${label}: ${point.score === null ? 'not logged' : `${point.score} of 6 plant groups`}`}>
          <View style={{ height: chartHeight, width: '100%', justifyContent: 'flex-end', alignItems: 'center' }}>
            <View style={{ width: '70%', maxWidth: tablet ? 60 : 44, height: point.score === null ? 3 : Math.max(5, point.score / 6 * chartHeight),
              backgroundColor: point.score === null ? '#40463B' : point.score === 6 ? '#AAD786' : '#6DA64F', borderRadius: 5 }} />
          </View><Text style={{ fontSize: 10, color: '#A8A29E', marginTop: 8 }}>{label}</Text>
        </View>;
      })}
    </View>
    <Text style={{ color: '#92988B', fontSize: 11, marginTop: 12 }}>{logged ? 'Gaps mark days you haven’t logged.' : 'Your first check-in starts your chart.'}</Text>
    <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderColor: '#30352D', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ color: '#A8D38D', fontSize: 13, fontWeight: '600' }}>View progress report</Text><Ionicons name="arrow-forward" size={18} color="#A8D38D" />
    </View>
  </TouchableOpacity>;
}
