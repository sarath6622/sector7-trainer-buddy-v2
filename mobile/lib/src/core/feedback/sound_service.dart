import 'package:audioplayers/audioplayers.dart';

import 'feedback_prefs.dart';

/// Plays short UI sound effects (currently just the workout "completed" chime).
///
/// Configured as an **ambient** audio session: the chime layers over the user's
/// music (their gym playlist keeps playing — ambient mixes with others by
/// default) and stays silent when the iOS Ring/Silent switch is off. On Android
/// it requests no audio focus, so it never pauses or ducks other apps. All
/// playback is gated by [FeedbackPrefs.soundEnabled] and wrapped so an audio
/// failure can never disrupt the UI.
class SoundService {
  SoundService._();
  static final SoundService instance = SoundService._();

  AudioPlayer? _player;
  bool _ready = false;

  /// Preload the chime once at startup. Fire-and-forget — failures just leave
  /// sound silently disabled.
  Future<void> init() async {
    try {
      final player = AudioPlayer();
      await player.setReleaseMode(ReleaseMode.stop);
      await player.setAudioContext(
        AudioContext(
          // `ambient` already mixes with other audio; passing `mixWithOthers`
          // explicitly is disallowed for this category, so options stays empty.
          iOS: AudioContextIOS(
            category: AVAudioSessionCategory.ambient,
            options: const {},
          ),
          android: const AudioContextAndroid(
            isSpeakerphoneOn: false,
            stayAwake: false,
            contentType: AndroidContentType.sonification,
            usageType: AndroidUsageType.assistanceSonification,
            audioFocus: AndroidAudioFocus.none, // never pause the user's music
          ),
        ),
      );
      await player.setSource(AssetSource('sounds/complete.wav'));
      _player = player;
      _ready = true;
    } catch (_) {
      _ready = false;
    }
  }

  /// Play the "completed" chime, if sounds are enabled and the asset is loaded.
  Future<void> playComplete() async {
    if (!FeedbackPrefs.soundEnabled || !_ready) return;
    final player = _player;
    if (player == null) return;
    try {
      await player.seek(Duration.zero); // restart even if a prior play is mid-flight
      await player.resume();
    } catch (_) {}
  }
}
