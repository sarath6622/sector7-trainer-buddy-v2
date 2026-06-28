import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'haptics.dart';
import 'sound_service.dart';

const _kHapticsKey = 'feedback_haptics_enabled';
const _kSoundKey = 'feedback_sound_enabled';

/// In-memory cache of the user's feedback preferences.
///
/// Haptics and the completion chime fire from many call sites — including
/// `static` helpers and `StatelessWidget`s that have no [WidgetRef] — so the
/// enabled flags live here as plain statics rather than behind a provider.
/// [init] seeds them from [SharedPreferences] once at startup (before runApp)
/// so the very first interaction already respects a saved choice, and
/// [FeedbackPrefsController] keeps them in sync when toggled in Settings.
class FeedbackPrefs {
  FeedbackPrefs._();

  static bool hapticsEnabled = true;
  static bool soundEnabled = true;

  static Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    hapticsEnabled = prefs.getBool(_kHapticsKey) ?? true;
    soundEnabled = prefs.getBool(_kSoundKey) ?? true;
  }
}

/// Settings-screen view of the two feedback toggles.
class FeedbackSettings {
  const FeedbackSettings({required this.haptics, required this.sound});
  final bool haptics;
  final bool sound;

  FeedbackSettings copyWith({bool? haptics, bool? sound}) => FeedbackSettings(
        haptics: haptics ?? this.haptics,
        sound: sound ?? this.sound,
      );
}

/// Reads/writes the persisted [FeedbackPrefs]. Toggling a switch updates the
/// static cache (so every call site picks it up immediately), persists it, and
/// previews the just-enabled channel so the change is felt / heard.
final feedbackSettingsProvider =
    StateNotifierProvider<FeedbackPrefsController, FeedbackSettings>(
  (ref) => FeedbackPrefsController(),
);

class FeedbackPrefsController extends StateNotifier<FeedbackSettings> {
  FeedbackPrefsController()
      : super(FeedbackSettings(
          haptics: FeedbackPrefs.hapticsEnabled,
          sound: FeedbackPrefs.soundEnabled,
        ));

  Future<void> setHaptics(bool value) async {
    if (value == state.haptics) return;
    state = state.copyWith(haptics: value);
    FeedbackPrefs.hapticsEnabled = value;
    if (value) Haptics.primary(); // a confirming buzz the instant it's enabled
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kHapticsKey, value);
  }

  Future<void> setSound(bool value) async {
    if (value == state.sound) return;
    state = state.copyWith(sound: value);
    FeedbackPrefs.soundEnabled = value;
    if (value) SoundService.instance.playComplete(); // preview the chime
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kSoundKey, value);
  }
}
