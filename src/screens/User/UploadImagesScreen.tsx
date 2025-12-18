import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../components/ThemeProvider';
import { AutoText } from '../../components/AutoText';
import { ScaledSheet } from 'react-native-size-matters';
import { useTabBar } from '../../context/TabBarContext';
import { launchImageLibrary, launchCamera, ImagePickerResponse, MediaType } from 'react-native-image-picker';
import type { UserRootStackParamList } from '../../navigation/UserTabNavigator';

interface UploadedImage {
  uri: string;
  type?: string;
  fileName?: string;
}

const UploadImagesScreen = () => {
  const { theme, isDark, themeName } = useTheme();
  const { setTabBarVisible } = useTabBar();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const routeParams = route.params as UserRootStackParamList['UploadImages'];
  
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [showImageViewer, setShowImageViewer] = useState(false);
  
  const styles = useMemo(() => getStyles(theme, themeName, isDark), [theme, themeName, isDark]);

  useFocusEffect(
    React.useCallback(() => {
      setTabBarVisible(false);
      return () => {
        setTabBarVisible(true);
      };
    }, [setTabBarVisible])
  );

  const handleImagePicker = () => {
    Alert.alert(
      'Select Image',
      'Choose an option',
      [
        { text: 'Camera', onPress: () => openCamera() },
        { text: 'Gallery', onPress: () => openGallery() },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const openCamera = () => {
    if (uploadedImages.length >= 9) {
      Alert.alert('Limit Reached', 'You can upload up to 9 images (3x3 grid)');
      return;
    }

    const options = {
      mediaType: 'photo' as MediaType,
      quality: 0.8,
      saveToPhotos: false,
    };

    launchCamera(options, (response: ImagePickerResponse) => {
      if (response.didCancel) {
        return;
      }
      if (response.errorMessage) {
        Alert.alert('Error', response.errorMessage);
        return;
      }
      if (response.assets && response.assets[0]) {
        const asset = response.assets[0];
        if (uploadedImages.length < 9) {
          setUploadedImages(prev => [...prev, {
            uri: asset.uri || '',
            type: asset.type,
            fileName: asset.fileName,
          }]);
        } else {
          Alert.alert('Limit Reached', 'You can upload up to 9 images (3x3 grid)');
        }
      }
    });
  };

  const openGallery = () => {
    if (uploadedImages.length >= 9) {
      Alert.alert('Limit Reached', 'You can upload up to 9 images (3x3 grid)');
      return;
    }

    const remainingSlots = 9 - uploadedImages.length;
    const options = {
      mediaType: 'photo' as MediaType,
      quality: 0.8,
      selectionLimit: remainingSlots,
    };

    launchImageLibrary(options, (response: ImagePickerResponse) => {
      if (response.didCancel) {
        return;
      }
      if (response.errorMessage) {
        Alert.alert('Error', response.errorMessage);
        return;
      }
      if (response.assets) {
        const newImages = response.assets
          .slice(0, remainingSlots)
          .map(asset => ({
            uri: asset.uri || '',
            type: asset.type,
            fileName: asset.fileName,
          }));
        setUploadedImages(prev => {
          const total = prev.length + newImages.length;
          if (total > 9) {
            Alert.alert('Limit Reached', 'You can upload up to 9 images (3x3 grid)');
            return prev;
          }
          return [...prev, ...newImages];
        });
      }
    });
  };

  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
    if (selectedImageIndex === index) {
      setShowImageViewer(false);
      setSelectedImageIndex(null);
    } else if (selectedImageIndex !== null && selectedImageIndex > index) {
      setSelectedImageIndex(selectedImageIndex - 1);
    }
  };

  const openImageViewer = (index: number) => {
    setSelectedImageIndex(index);
    setShowImageViewer(true);
  };

  const closeImageViewer = () => {
    setShowImageViewer(false);
    setSelectedImageIndex(null);
  };

  const handleContinue = () => {
    console.log('Uploaded images:', uploadedImages);
    console.log('Note:', note);
    // Navigate to request summary screen
    (navigation as any).navigate('RequestSummary', {
      selectedMaterials: routeParams?.selectedSubcategories || [],
      uploadedImages: uploadedImages,
      note: note,
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={isDark ? theme.background : '#FFFFFF'}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <AutoText style={styles.headerTitle} numberOfLines={1}>
          Upload Images
        </AutoText>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <AutoText style={styles.title}>
          Upload scrap items pictures
        </AutoText>

        {/* Upload Area */}
        <TouchableOpacity
          style={styles.uploadArea}
          onPress={handleImagePicker}
          activeOpacity={0.8}
          disabled={uploading}
        >
          <View style={styles.uploadedImagesContainer}>
            <View style={styles.imagesGrid}>
              {uploadedImages.map((image, index) => (
                <View key={index} style={styles.uploadedImageWrapper}>
                  <TouchableOpacity
                    onPress={() => openImageViewer(index)}
                    activeOpacity={0.9}
                    style={styles.imageTouchable}
                  >
                    <Image source={{ uri: image.uri }} style={styles.uploadedImage} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => removeImage(index)}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name="close-circle" size={22} color="#EF5350" />
                  </TouchableOpacity>
                </View>
              ))}
              {uploadedImages.length > 0 && uploadedImages.length < 9 && (
                <TouchableOpacity
                  style={styles.addMoreButton}
                  onPress={handleImagePicker}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="plus-circle" size={40} color={theme.primary} />
                  <AutoText style={styles.addMoreText}>Add more</AutoText>
                </TouchableOpacity>
              )}
            </View>
          </View>
          {uploadedImages.length === 0 && (
            <View style={styles.uploadPlaceholder}>
              <View style={styles.uploadIconContainer}>
                <MaterialCommunityIcons name="image-plus" size={48} color={theme.primary} />
                <View style={styles.uploadIconBadge}>
                  <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
                </View>
              </View>
              <AutoText style={styles.uploadText}>
                Tap here to upload images
              </AutoText>
              <AutoText style={styles.uploadSubtext}>
                You can upload up to 10 images
              </AutoText>
            </View>
          )}
        </TouchableOpacity>

        {/* Tip Section */}
        <View style={styles.tipContainer}>
          <MaterialCommunityIcons name="lightbulb-on-outline" size={24} color={theme.primary} />
          <View style={styles.tipContent}>
            <AutoText style={styles.tipText} numberOfLines={0}>
              Tip: Uploading images will increase chances of early request confirmation and help partners estimate the scrap quantity accurately.
            </AutoText>
          </View>
        </View>

        {/* Add Note Section */}
        <TouchableOpacity
          style={styles.addNoteButton}
          onPress={() => setShowNoteInput(!showNoteInput)}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="note-text-outline" size={20} color={theme.primary} />
          <AutoText style={styles.addNoteText}>
            {note ? note : 'Add a note'}
          </AutoText>
          <MaterialCommunityIcons
            name={showNoteInput ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={theme.primary}
          />
        </TouchableOpacity>

        {showNoteInput && (
          <View style={styles.noteInputContainer}>
            <AutoText style={styles.noteInputLabel}>Your note</AutoText>
            <TextInput
              style={styles.noteInput}
              placeholder="Add any additional details about your scrap items..."
              placeholderTextColor={theme.textSecondary}
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        )}

        {/* Bottom Spacing */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Continue Button */}
      {uploadedImages.length > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleContinue}
            activeOpacity={0.8}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <AutoText style={styles.continueButtonText}>
                Continue
              </AutoText>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Image Viewer Modal */}
      <Modal
        visible={showImageViewer}
        transparent={true}
        animationType="fade"
        onRequestClose={closeImageViewer}
      >
        <View style={styles.imageViewerContainer}>
          <StatusBar barStyle="light-content" />
          {selectedImageIndex !== null && uploadedImages[selectedImageIndex] && (
            <>
              <TouchableOpacity
                style={[styles.imageViewerCloseButton, { top: insets.top + 10 }]}
                onPress={closeImageViewer}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="close" size={28} color="#FFFFFF" />
              </TouchableOpacity>
              
              <Image
                source={{ uri: uploadedImages[selectedImageIndex].uri }}
                style={styles.fullScreenImage}
                resizeMode="contain"
              />
              
              <View style={[styles.imageViewerActions, { bottom: insets.bottom + 20 }]}>
                <TouchableOpacity
                  style={styles.imageViewerRemoveButton}
                  onPress={() => {
                    if (selectedImageIndex !== null) {
                      const currentIndex = selectedImageIndex;
                      removeImage(currentIndex);
                      if (uploadedImages.length === 1) {
                        closeImageViewer();
                      } else if (currentIndex < uploadedImages.length - 1) {
                        // Stay on same index (which will show next image)
                        setSelectedImageIndex(currentIndex);
                      } else {
                        // Move to previous image if we removed the last one
                        setSelectedImageIndex(currentIndex - 1);
                      }
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="delete-outline" size={24} color="#FFFFFF" />
                  <AutoText style={styles.imageViewerRemoveText}>Remove</AutoText>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
};

const getStyles = (theme: any, themeName?: string, isDark?: boolean) =>
  ScaledSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: '16@s',
      paddingVertical: '12@vs',
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      backgroundColor: theme.card,
    },
    backButton: {
      width: '40@s',
      height: '40@vs',
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      fontFamily: 'Poppins-SemiBold',
      fontSize: '18@s',
      color: theme.textPrimary,
      textAlign: 'center',
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: '16@s',
      paddingTop: '24@vs',
      paddingBottom: '24@vs',
    },
    title: {
      fontFamily: 'Poppins-Bold',
      fontSize: '24@s',
      color: theme.textPrimary,
      marginBottom: '24@vs',
      lineHeight: '32@vs',
    },
    uploadArea: {
      borderWidth: 2,
      borderColor: theme.border,
      borderStyle: 'dashed',
      borderRadius: '16@ms',
      padding: '32@vs',
      marginBottom: '24@vs',
      backgroundColor: theme.card,
      minHeight: '200@vs',
      alignItems: 'center',
      justifyContent: 'center',
    },
    uploadPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    uploadIconContainer: {
      position: 'relative',
      marginBottom: '16@vs',
    },
    uploadIconBadge: {
      position: 'absolute',
      bottom: -4,
      right: -4,
      width: '32@s',
      height: '32@vs',
      borderRadius: '16@ms',
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: theme.background,
    },
    uploadText: {
      fontFamily: 'Poppins-Medium',
      fontSize: '16@s',
      color: theme.textSecondary,
      marginTop: '8@vs',
      textAlign: 'center',
    },
    uploadSubtext: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: theme.textSecondary,
      marginTop: '4@vs',
      textAlign: 'center',
    },
    uploadedImagesContainer: {
      width: '100%',
    },
    imagesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    uploadedImageWrapper: {
      position: 'relative',
      width: '32%',
      aspectRatio: 1,
      marginBottom: '12@vs',
    },
    uploadedImage: {
      width: '100%',
      height: '100%',
      borderRadius: '12@ms',
    },
    removeImageButton: {
      position: 'absolute',
      top: '1@vs',
      right: '1@s',
   
      borderRadius: '12@ms',
      width: '28@s',
      height: '28@vs',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10,
    },
    addMoreButton: {
      width: '32%',
      aspectRatio: 1,
      borderWidth: 2,
      borderColor: theme.border,
      borderStyle: 'dashed',
      borderRadius: '12@ms',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.card,
      marginBottom: '12@vs',
    },
    addMoreText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: theme.textSecondary,
      marginTop: '4@vs',
    },
    tipContainer: {
      flexDirection: 'row',
      backgroundColor: theme.accent || `${theme.primary}15`,
      borderRadius: '12@ms',
      padding: '16@s',
      marginBottom: '20@vs',
      alignItems: 'flex-start',
    },
    tipContent: {
      flex: 1,
      marginLeft: '12@s',
    },
    tipText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '13@s',
      color: theme.textPrimary,
      lineHeight: '20@vs',
      flexWrap: 'wrap',
      flexShrink: 1,
    },
    addNoteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.card,
      borderRadius: '12@ms',
      padding: '16@s',
      marginBottom: '20@vs',
      borderWidth: 1,
      borderColor: theme.border,
    },
    addNoteText: {
      flex: 1,
      fontFamily: 'Poppins-Medium',
      fontSize: '15@s',
      color: theme.primary,
      marginLeft: '12@s',
    },
    noteInputContainer: {
      marginBottom: '20@vs',
    },
    noteInputLabel: {
      fontFamily: 'Poppins-Medium',
      fontSize: '14@s',
      color: theme.textPrimary,
      marginBottom: '8@vs',
    },
    noteInput: {
      backgroundColor: theme.card,
      borderRadius: '12@ms',
      padding: '16@s',
      borderWidth: 1,
      borderColor: theme.border,
      minHeight: '100@vs',
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textPrimary,
    },
    footer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: theme.card,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingHorizontal: '16@s',
      paddingTop: '12@vs',
      paddingBottom: '24@vs',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 8,
    },
    continueButton: {
      backgroundColor: theme.primary,
      borderRadius: '12@ms',
      paddingVertical: '14@vs',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 5,
    },
    continueButtonText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '16@s',
      color: '#FFFFFF',
    },
    imageTouchable: {
      width: '100%',
      height: '100%',
    },
    imageViewerContainer: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.95)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    imageViewerCloseButton: {
      position: 'absolute',
      top: '50@vs',
      right: '16@s',
      zIndex: 10,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      borderRadius: '20@ms',
      width: '40@s',
      height: '40@vs',
      alignItems: 'center',
      justifyContent: 'center',
    },
    fullScreenImage: {
      width: '100%',
      height: '100%',
    },
    imageViewerActions: {
      position: 'absolute',
      bottom: '40@vs',
      left: 0,
      right: 0,
      alignItems: 'center',
      paddingHorizontal: '16@s',
    },
    imageViewerRemoveButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#EF5350',
      borderRadius: '12@ms',
      paddingHorizontal: '24@s',
      paddingVertical: '12@vs',
      gap: '8@s',
    },
    imageViewerRemoveText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '16@s',
      color: '#FFFFFF',
    },
  });

export default UploadImagesScreen;

