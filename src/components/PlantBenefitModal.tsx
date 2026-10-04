import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PlantIcon, PLANT_LABELS } from './PlantGroups';
import { PLANT_DETAILS } from '@/utils/plantGroupDetails';
import { GBOMBS_LETTERS } from '@/utils/gbombsImages';
import type { GBombsCategoryKey } from '@/utils/gbombsPresets';

export default function PlantBenefitModal({ category, onClose }: {
  category: GBombsCategoryKey | null;
  onClose: () => void;
}) {
  const color = GBOMBS_LETTERS.find(group => group.key === category)?.glow ?? '#A8D38D';
  return (
    <Modal visible={category !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Pressable onPress={onClose} accessible={false}
          style={{ position: 'absolute', inset: 0, backgroundColor: '#000000B8' }} />
        {category && (
          <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 380, borderRadius: 20,
            padding: 20, backgroundColor: '#161C12', borderWidth: 1, borderColor: color + '66' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: color + '18',
                alignItems: 'center', justifyContent: 'center' }}>
                <PlantIcon category={category} color={color} size={26} />
              </View>
              <Text accessibilityRole="header" style={{ flex: 1, color: '#FAFAF9', fontSize: 20, fontWeight: '700' }}>
                {PLANT_LABELS[category]}
              </Text>
              <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close plant benefit"
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22,
                  backgroundColor: '#FFFFFF08' }}>
                <Ionicons name="close-outline" size={24} color="#D6D3D1" />
              </TouchableOpacity>
            </View>
            <Text style={{ color: '#D6D3D1', fontSize: 14, lineHeight: 22, marginTop: 16 }}>
              {PLANT_DETAILS[category].benefit}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}
