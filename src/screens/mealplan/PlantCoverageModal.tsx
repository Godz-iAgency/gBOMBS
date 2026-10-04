import { useState } from 'react';
import { Modal, ScrollView, Text, View, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PlantIcon, PLANT_LABELS } from '@/components/PlantGroups';
import { GBOMBS_LETTERS } from '@/utils/gbombsImages';
import type { MealSummary, WeeklyMealPlan } from '@/services/gemini';

export default function PlantCoverageModal({ plan, visible, onClose, onSelectMeal }: {
  plan: WeeklyMealPlan; visible: boolean; onClose: () => void; onSelectMeal: (meal: MealSummary) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: '#0A0A0A', paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <ScrollView style={{ width: '100%', maxWidth: 760, alignSelf: 'center' }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: '#FAFAF9', fontSize: 22, fontWeight: '700', flex: 1 }}>Your plan’s plant groups</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close plant group details" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close-outline" size={24} color="#D6D3D1" />
          </TouchableOpacity>
        </View>
        <Text style={{ color: '#A8A29E', fontSize: 14, lineHeight: 21, marginTop: 12, marginBottom: 24 }}>Each group counts once when it appears in a planned meal this week. This shows your plan’s variety, rather than what you’ve logged eating.</Text>
        {GBOMBS_LETTERS.map(meta => {
          const meals = plan.days.flatMap(day => day.meals.filter(meal => meal.gbombs.includes(meta.key)).map(meal => ({ meal, day: day.label })));
          const open = expanded === meta.key;
          return <View key={meta.key} style={{ backgroundColor: '#161816', borderWidth: 1, borderColor: open ? meta.glow + '66' : '#30352D', borderRadius: 16, marginBottom: 12, overflow: 'hidden' }}>
            <TouchableOpacity onPress={() => setExpanded(open ? null : meta.key)} accessibilityRole="button" accessibilityState={{ expanded: open }} aria-expanded={open} accessibilityLabel={`${PLANT_LABELS[meta.key]}, ${meals.length} planned meals`}
              style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: meta.glow + '14', alignItems: 'center', justifyContent: 'center' }}><PlantIcon category={meta.key} color={meta.glow} /></View>
              <View style={{ flex: 1 }}><Text style={{ color: '#FAFAF9', fontSize: 15, fontWeight: '600' }}>{PLANT_LABELS[meta.key]}</Text>
                <Text style={{ color: '#A8A29E', fontSize: 12, marginTop: 4 }}>{meals.length ? `${meals.length} planned ${meals.length === 1 ? 'meal' : 'meals'}` : 'Not included in this plan'}</Text></View>
              <Ionicons name={open ? 'chevron-up-outline' : 'chevron-down-outline'} size={18} color="#A8A29E" />
            </TouchableOpacity>
            {open && <View style={{ borderTopWidth: 1, borderColor: '#30352D', paddingHorizontal: 16 }}>
              {meals.length ? meals.map(({ meal, day }, index) => <TouchableOpacity key={`${day}-${meal.id}-${index}`} onPress={() => onSelectMeal(meal)} accessibilityRole="button"
                style={{ paddingVertical: 14, borderBottomWidth: index < meals.length - 1 ? 1 : 0, borderColor: '#292D26', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}><Text style={{ color: '#8DB873', fontSize: 11, marginBottom: 4 }}>{day} · {meal.slot}</Text><Text style={{ color: '#FAFAF9', fontSize: 14, fontWeight: '600' }}>{meal.name}</Text></View>
                <Ionicons name="chevron-forward-outline" size={18} color="#A8A29E" />
              </TouchableOpacity>) : <Text style={{ color: '#A8A29E', paddingVertical: 16, fontSize: 13 }}>Choose or swap a meal containing {PLANT_LABELS[meta.key].toLowerCase()} to include this group.</Text>}
            </View>}
          </View>;
        })}
      </ScrollView>
    </View>
  </Modal>;
}
