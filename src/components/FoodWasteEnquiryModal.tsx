import React, { useState } from 'react';
import {
  View,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { AutoText } from './AutoText';
import { ScaledSheet } from 'react-native-size-matters';

interface FoodWasteEnquiryModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (kgPerWeek: string, timings: string[]) => Promise<void>;
  selectedKgPerWeek: string;
  setSelectedKgPerWeek: (value: string) => void;
  selectedTimings: string[];
  setSelectedTimings: (value: string[]) => void;
  isSubmitting: boolean;
  theme: any;
}

const KG_OPTIONS = ['1-5 kg', '5-10 kg', '10-20 kg', '20-50 kg', '50+ kg'];
const TIMING_OPTIONS = [
  'Morning (6 AM - 10 AM)',
  'Mid-Morning (10 AM - 12 PM)',
  'Afternoon (12 PM - 3 PM)',
  'Evening (3 PM - 6 PM)',
  'Night (6 PM - 9 PM)',
];

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export const FoodWasteEnquiryModal: React.FC<FoodWasteEnquiryModalProps> = ({
  visible,
  onClose,
  onSubmit,
  selectedKgPerWeek,
  setSelectedKgPerWeek,
  selectedTimings,
  setSelectedTimings,
  isSubmitting,
  theme,
}) => {
  const styles = getStyles(theme);

  const handleTimingToggle = (timing: string) => {
    if (selectedTimings.includes(timing)) {
      setSelectedTimings(selectedTimings.filter(t => t !== timing));
    } else {
      setSelectedTimings([...selectedTimings, timing]);
    }
  };

  const handleSubmit = async () => {
    if (!selectedKgPerWeek) {
      Alert.alert('Required', 'Please select the amount of food waste per week.');
      return;
    }
    if (selectedTimings.length === 0) {
      Alert.alert('Required', 'Please select at least one preferred timing.');
      return;
    }
    await onSubmit(selectedKgPerWeek, selectedTimings);
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <AutoText style={styles.modalTitle}>Food Waste Collection Enquiry</AutoText>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              disabled={isSubmitting}
            >
              <MaterialCommunityIcons
                name="close"
                size={24}
                color={theme.textPrimary}
              />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalBody}
            contentContainerStyle={styles.modalBodyContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Kg Per Week Selection */}
            <View style={styles.section}>
              <AutoText style={styles.sectionTitle} numberOfLines={0}>
                How much food waste per week? *
              </AutoText>
              <View style={styles.optionsContainer}>
                {KG_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.optionButton,
                      selectedKgPerWeek === option && styles.optionButtonSelected,
                    ]}
                    onPress={() => setSelectedKgPerWeek(option)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.optionContent}>
                      <View
                        style={[
                          styles.radioCircle,
                          selectedKgPerWeek === option && styles.radioCircleSelected,
                        ]}
                      >
                        {selectedKgPerWeek === option && (
                          <View style={styles.radioInner} />
                        )}
                      </View>
                      <AutoText
                        style={[
                          styles.optionText,
                          selectedKgPerWeek === option && styles.optionTextSelected,
                        ]}
                        numberOfLines={0}
                      >
                        {option}
                      </AutoText>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Preferred Timings Selection */}
            <View style={styles.section}>
              <AutoText style={styles.sectionTitle} numberOfLines={0}>
                Preferred Collection Timings * (Select all that apply)
              </AutoText>
              <View style={styles.optionsContainer}>
                {TIMING_OPTIONS.map((timing) => {
                  const isSelected = selectedTimings.includes(timing);
                  return (
                    <TouchableOpacity
                      key={timing}
                      style={[
                        styles.checkboxButton,
                        isSelected && styles.checkboxButtonSelected,
                      ]}
                      onPress={() => handleTimingToggle(timing)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.checkboxContent}>
                        <View
                          style={[
                            styles.checkbox,
                            isSelected && styles.checkboxSelected,
                          ]}
                        >
                          {isSelected && (
                            <MaterialCommunityIcons
                              name="check"
                              size={16}
                              color="#FFFFFF"
                            />
                          )}
                        </View>
                        <AutoText
                          style={[
                            styles.checkboxText,
                            isSelected && styles.checkboxTextSelected,
                          ]}
                          numberOfLines={0}
                        >
                          {timing}
                        </AutoText>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </ScrollView>

          {/* Submit Button */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[
                styles.submitButton,
                (!selectedKgPerWeek || selectedTimings.length === 0 || isSubmitting) &&
                  styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!selectedKgPerWeek || selectedTimings.length === 0 || isSubmitting}
              activeOpacity={0.7}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <AutoText style={styles.submitButtonText}>Submit Enquiry</AutoText>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const getStyles = (theme: any) =>
  ScaledSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: theme.background,
      borderTopLeftRadius: '24@ms',
      borderTopRightRadius: '24@ms',
      maxHeight: SCREEN_HEIGHT * 0.85,
      height: SCREEN_HEIGHT * 0.75,
      flexDirection: 'column',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: '20@s',
      paddingTop: '20@vs',
      paddingBottom: '16@vs',
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      flexShrink: 0,
    },
    modalTitle: {
      fontFamily: 'Poppins-Bold',
      fontSize: '18@s',
      color: theme.textPrimary,
      flex: 1,
    },
    closeButton: {
      padding: '4@s',
    },
    modalBody: {
      flex: 1,
    },
    modalBodyContent: {
      paddingHorizontal: '20@s',
      paddingTop: '20@vs',
      paddingBottom: '20@vs',
    },
    section: {
      marginBottom: '24@vs',
    },
    sectionTitle: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      color: theme.textPrimary,
      marginBottom: '12@vs',
    },
    optionsContainer: {
      gap: '10@vs',
    },
    optionButton: {
      borderRadius: '12@ms',
      borderWidth: 1.5,
      borderColor: theme.border,
      backgroundColor: theme.card,
      padding: '14@s',
    },
    optionButtonSelected: {
      borderColor: theme.primary,
      backgroundColor: theme.primary + '10',
    },
    optionContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    radioCircle: {
      width: '20@s',
      height: '20@vs',
      borderRadius: '10@ms',
      borderWidth: 2,
      borderColor: theme.border,
      marginRight: '12@s',
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioCircleSelected: {
      borderColor: theme.primary,
    },
    radioInner: {
      width: '10@s',
      height: '10@vs',
      borderRadius: '5@ms',
      backgroundColor: theme.primary,
    },
    optionText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textPrimary,
    },
    optionTextSelected: {
      fontFamily: 'Poppins-SemiBold',
      color: theme.primary,
    },
    checkboxButton: {
      borderRadius: '12@ms',
      borderWidth: 1.5,
      borderColor: theme.border,
      backgroundColor: theme.card,
      padding: '14@s',
    },
    checkboxButtonSelected: {
      borderColor: theme.primary,
      backgroundColor: theme.primary + '10',
    },
    checkboxContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    checkbox: {
      width: '20@s',
      height: '20@vs',
      borderRadius: '4@ms',
      borderWidth: 2,
      borderColor: theme.border,
      marginRight: '12@s',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    checkboxSelected: {
      borderColor: theme.primary,
      backgroundColor: theme.primary,
    },
    checkboxText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textPrimary,
      flex: 1,
    },
    checkboxTextSelected: {
      fontFamily: 'Poppins-Medium',
    },
    modalFooter: {
      paddingHorizontal: '20@s',
      paddingTop: '16@vs',
      paddingBottom: '20@vs',
      borderTopWidth: 1,
      borderTopColor: theme.border,
      flexShrink: 0,
    },
    submitButton: {
      backgroundColor: theme.primary,
      borderRadius: '12@ms',
      paddingVertical: '14@vs',
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitButtonDisabled: {
      backgroundColor: theme.textSecondary,
      opacity: 0.5,
    },
    submitButtonText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '16@s',
      color: '#FFFFFF',
    },
  });

