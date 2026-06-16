import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  loadReport,
  type ReportData,
  type ReportRange,
  type TrendPoint,
  type CategoryCoverage,
} from '@/lib/reports';
import { LETTER_BY_KEY } from '@/utils/gbombsImages';

/**
 * Progress & Reports — a full-screen sheet (same pattern as the trophy case)
 * that visualizes the user's gBOMBS history. Charts are built from plain Views
 * (no native chart dependency → no extra EAS rebuild): a daily score TREND of
 * vertical bars, per-category COVERAGE as horizontal bars, and summary stats.
 * Reads daily_scores for the selected 7- or 30-day window on open / range change.
 */
export default function ReportsScreen({
  visible,
  userId,
  onClose,
}: {
  visible: boolean;
  userId: string;
  onClose: () => void;
}) {
  const [range, setRange] = useState<ReportRange>(7);
  const [data, setData] = useState<ReportData | null>(null);

  useEffect(() => {
    if (!visible) {
      setData(null);
      setRange(7);
      return;
    }
    let active = true;
    setData(null);
    loadReport(userId, range).then((d) => {
      if (active) setData(d);
    });
    return () => {
      active = false;
    };
  }, [visible, userId, range]);

  const loading = data === null;
  const hasData = !!data && data.daysLogged > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        {/* Header */}
        <View className="flex-row items-center justify-between border-b border-surface-border px-5 pb-3 pt-1">
          <TouchableOpacity onPress={onClose} className="py-1 pr-3">
            <Ionicons name="close" size={24} color="#A8A29E" />
          </TouchableOpacity>
          <Text className="text-content text-base font-bold">
            Progress &amp; Reports
          </Text>
          <View className="w-9" />
        </View>

        {/* Range toggle */}
        <View className="flex-row justify-center gap-2 px-5 pt-4">
          <RangeTab
            label="7 days"
            active={range === 7}
            onPress={() => setRange(7)}
          />
          <RangeTab
            label="30 days"
            active={range === 30}
            onPress={() => setRange(30)}
          />
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#5A9A3A" />
          </View>
        ) : !hasData ? (
          <EmptyState />
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Summary stats */}
            <View className="-mx-1 flex-row">
              <StatCard value={`${data.avgScore}`} label="Avg score" />
              <StatCard value={`${data.perfectDays} ⭐`} label="Perfect days" />
              <StatCard
                value={`${data.daysLogged}`}
                label={`of ${data.range} days`}
              />
            </View>

            {/* Score trend */}
            <SectionLabel>Daily score · out of 6</SectionLabel>
            <View className="rounded-2xl bg-surface-card p-4">
              <TrendChart trend={data.trend} />
            </View>

            {/* Category coverage */}
            <SectionLabel>Category coverage</SectionLabel>
            <View className="rounded-2xl bg-surface-card p-4 pt-5">
              {data.coverage.map((c) => (
                <CoverageBar key={c.key} c={c} />
              ))}
              <Text className="text-content-muted mt-1 text-xs leading-4">
                Share of your {data.daysLogged} logged{' '}
                {data.daysLogged === 1 ? 'day' : 'days'} that hit each group.
                Aim to lift your lowest bars.
              </Text>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ---- Range toggle --------------------------------------------------------

function RangeTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className="rounded-full border px-5 py-2"
      style={{
        backgroundColor: active ? '#5A9A3A' : 'transparent',
        borderColor: active ? '#5A9A3A' : '#2D2D2D',
      }}
    >
      <Text
        className="text-xs font-bold"
        style={{ color: active ? '#fff' : '#A8A29E' }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ---- Trend (vertical bars) ----------------------------------------------

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function weekdayInitial(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

function TrendChart({ trend }: { trend: TrendPoint[] }) {
  const CHART_H = 132;
  const many = trend.length > 7; // 30-day view → thin bars, sparse labels

  return (
    <View>
      <View className="flex-row items-end" style={{ height: CHART_H }}>
        {trend.map((p) => {
          const logged = p.score != null;
          const ratio = logged ? (p.score as number) / 6 : 0;
          const h = logged ? Math.max(5, ratio * CHART_H) : 3;
          const perfect = p.score === 6;
          return (
            <View
              key={p.date}
              className="flex-1 items-center justify-end"
              style={{ marginHorizontal: many ? 1 : 3 }}
            >
              <View
                style={{
                  width: '100%',
                  height: h,
                  borderRadius: 4,
                  backgroundColor: logged
                    ? perfect
                      ? '#6FBF4A'
                      : '#5A9A3A'
                    : '#222',
                }}
              />
            </View>
          );
        })}
      </View>

      {/* X-axis labels */}
      {many ? (
        <View className="mt-2 flex-row justify-between">
          <Text className="text-content-muted text-[10px]">
            {shortDate(trend[0].date)}
          </Text>
          <Text className="text-content-muted text-[10px]">Today</Text>
        </View>
      ) : (
        <View className="mt-2 flex-row">
          {trend.map((p) => (
            <View
              key={p.date}
              className="flex-1 items-center"
              style={{ marginHorizontal: 3 }}
            >
              <Text className="text-content-muted text-[10px]">
                {weekdayInitial(p.date)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ---- Coverage (horizontal bars) -----------------------------------------

function CoverageBar({ c }: { c: CategoryCoverage }) {
  const meta = LETTER_BY_KEY[c.key];
  return (
    <View className="mb-3.5 flex-row items-center">
      <View
        className="mr-3 h-7 w-7 items-center justify-center rounded-full"
        style={{ backgroundColor: meta.glow }}
      >
        <Text className="text-xs font-bold" style={{ color: '#000' }}>
          {meta.letter}
        </Text>
      </View>
      <View className="flex-1">
        <View className="mb-1 flex-row items-center justify-between">
          <Text className="text-content text-xs font-semibold">{meta.word}</Text>
          <Text className="text-content-muted text-xs font-semibold">
            {c.pct}%
          </Text>
        </View>
        <View
          className="h-2.5 w-full overflow-hidden rounded-full"
          style={{ backgroundColor: '#222' }}
        >
          <View
            style={{
              width: `${c.pct}%`,
              height: '100%',
              borderRadius: 999,
              backgroundColor: meta.glow,
            }}
          />
        </View>
      </View>
    </View>
  );
}

// ---- Shared bits ---------------------------------------------------------

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <View className="mx-1 flex-1 rounded-2xl bg-surface-card p-4">
      <Text className="text-content text-2xl font-extrabold">{value}</Text>
      <Text className="text-content-muted mt-1 text-xs font-semibold">
        {label}
      </Text>
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="text-content-muted mb-2 mt-7 px-1 text-xs font-semibold uppercase tracking-wide">
      {children}
    </Text>
  );
}

function EmptyState() {
  return (
    <View className="flex-1 items-center justify-center px-10">
      <Ionicons name="bar-chart-outline" size={48} color="#5A9A3A" />
      <Text className="text-content mt-4 text-center text-base font-bold">
        No progress yet
      </Text>
      <Text className="text-content-muted mt-2 text-center text-sm leading-5">
        Log your gBOMBS for a few days and your score trend and category
        coverage will show up here.
      </Text>
    </View>
  );
}
