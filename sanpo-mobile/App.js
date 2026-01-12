import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Dimensions,
  Alert
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';

// ■ サーバー設定 (PCのIPアドレスに書き換えてください)
const API_BASE_URL = 'http://192.168.3.4:3000';
const API_URL_UNIFIED = `${API_BASE_URL}/api/unified`;
const API_URL_STT = `${API_BASE_URL}/api/speech-to-text`;

// セッションID生成
const getSessionId = () => {
  return 'mobile-' + Date.now().toString(36);
};
const SESSION_ID = getSessionId();

const { width, height } = Dimensions.get('window');

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState('back');
  const cameraRef = useRef(null);

  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);

  const [chat, setChat] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('待機中');

  useEffect(() => {
    (async () => {
      if (!permission?.granted) await requestPermission();
      await Audio.requestPermissionsAsync();
    })();
  }, []);

  // ■ カメラ撮影 & AI送信
  const takePictureAndSend = async () => {
    if (!cameraRef.current) return;
    try {
      setLoading(true);
      setStatus('撮影中...');

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        base64: true,
      });

      setStatus('AI思考中...');
      await sendToAI('これについて教えて', photo.base64);

    } catch (e) {
      console.error(e);
      setStatus('エラー発生');
      Alert.alert('エラー', e.message);
    } finally {
      setLoading(false);
    }
  };

  // ■ 録音開始
  async function startRecording() {
    try {
      setStatus('聞いています...');
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(newRecording);
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('エラー', 'マイクを起動できませんでした');
    }
  }

  // ■ 録音停止 & 送信
  async function stopRecording() {
    if (!recording) return;

    setStatus('処理中...');
    setIsRecording(false);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      const base64Info = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const res = await fetch(API_URL_STT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: base64Info }),
      });
      const data = await res.json();

      if (data.text) {
        setStatus(`認識: ${data.text}`);
        addMessage(data.text, 'me');
        await sendToAI(data.text);
      } else {
        setStatus('認識失敗');
      }
    } catch (e) {
      console.error(e);
      setStatus('音声認識エラー');
      Alert.alert('エラー', '音声認識に失敗しました');
    }
  }

  // ■ AI統合APIへ送信
  const sendToAI = async (text, imageBase64 = null) => {
    try {
      const payload = {
        sessionId: SESSION_ID,
        text: text,
      };
      if (imageBase64) {
        payload.image = `data:image/jpeg;base64,${imageBase64}`;
      }

      const res = await fetch(API_URL_UNIFIED, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      const answer = data.answer || 'エラーが発生しました';

      addMessage(answer, 'ai');
      Speech.speak(answer, { language: 'ja' });
      setStatus('待機中');

    } catch (e) {
      console.error(e);
      addMessage('通信エラーが発生しました', 'ai');
      setStatus('通信エラー');
    }
  };

  const addMessage = (text, sender) => {
    setChat(prev => [...prev.slice(-3), { text, sender, id: Date.now() }]);
  };

  const toggleCamera = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>読み込み中...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>カメラ権限が必要です</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>権限を許可</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <StatusBar style="light" />

        {/* カメラ全画面 */}
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
        />

        {/* オーバーレイUI */}
        <SafeAreaView style={styles.overlay}>

          {/* ヘッダー */}
          <View style={styles.header}>
            <View style={styles.statusBadge}>
              <View style={[styles.statusDot, loading && styles.statusDotActive]} />
              <Text style={styles.statusText}>{status}</Text>
            </View>
            <View style={styles.badges}>
              {isRecording && (
                <View style={styles.recBadge}>
                  <Text style={styles.badgeText}>REC</Text>
                </View>
              )}
              <View style={styles.liveBadge}>
                <Text style={styles.badgeText}>LIVE</Text>
              </View>
            </View>
          </View>

          {/* チャット表示エリア */}
          <View style={styles.chatContainer}>
            {chat.map((msg) => (
              <View
                key={msg.id}
                style={[
                  styles.chatBubble,
                  msg.sender === 'me' ? styles.chatBubbleMe : styles.chatBubbleAi
                ]}
              >
                <Text style={styles.chatText}>{msg.text}</Text>
              </View>
            ))}
          </View>

          {/* フッター操作部 */}
          <View style={styles.footer}>

            {/* カメラ切替 */}
            <TouchableOpacity style={styles.sideButton} onPress={toggleCamera}>
              <Text style={styles.buttonEmoji}>🔄</Text>
            </TouchableOpacity>

            {/* シャッター */}
            <TouchableOpacity
              style={[styles.shutterButton, loading && styles.shutterButtonDisabled]}
              onPress={takePictureAndSend}
              disabled={loading}
            >
              <View style={styles.shutterInner} />
            </TouchableOpacity>

            {/* マイク */}
            <TouchableOpacity
              style={[styles.sideButton, isRecording && styles.sideButtonRecording]}
              onPressIn={startRecording}
              onPressOut={stopRecording}
            >
              <Text style={styles.buttonEmoji}>🎤</Text>
            </TouchableOpacity>

          </View>
        </SafeAreaView>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 16,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#888',
    marginRight: 8,
  },
  statusDotActive: {
    backgroundColor: '#10b981',
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
  },
  recBadge: {
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  liveBadge: {
    backgroundColor: 'rgba(220, 38, 38, 0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },

  // Chat
  chatContainer: {
    position: 'absolute',
    top: 80,
    right: 16,
    maxWidth: width * 0.75,
    gap: 8,
  },
  chatBubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    maxWidth: '100%',
  },
  chatBubbleMe: {
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
    alignSelf: 'flex-end',
  },
  chatBubbleAi: {
    backgroundColor: 'rgba(39, 39, 42, 0.9)',
    alignSelf: 'flex-end',
  },
  chatText: {
    color: '#fff',
    fontSize: 14,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    paddingBottom: 20,
  },
  sideButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  sideButtonRecording: {
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
  },
  buttonEmoji: {
    fontSize: 24,
  },
  shutterButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f59e0b',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  shutterButtonDisabled: {
    backgroundColor: '#666',
  },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(217, 119, 6, 0.7)',
  },

  // Permission screen
  permissionContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 16,
  },
  permissionButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  text: {
    color: '#fff',
  },
});
