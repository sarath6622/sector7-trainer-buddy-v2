import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import 'firebase_options.dart';
import 'src/core/flags/force_update_gate.dart';
import 'src/core/theme/app_theme.dart';
import 'src/core/theme/theme_mode_controller.dart';
import 'src/features/auth/application/auth_controller.dart';
import 'src/features/session/data/live_session_service.dart';
import 'src/features/workout/data/workout_repository.dart';
import 'src/features/workout/data/workout_sync_service.dart';
import 'src/routing/app_router.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Offline-first: Inter ships as a bundled asset (see pubspec + assets/fonts).
  // Disable runtime fetching so a font is never pulled over the network — a
  // missing variant surfaces loudly in dev instead of silently fetching.
  GoogleFonts.config.allowRuntimeFetching = false;

  await _initFirebase();

  runApp(const ProviderScope(child: Sector7App()));
}

/// Firebase is best-effort at startup: Crashlytics + Remote Config are nice to
/// have, but a failure here must never stop the app from running — Remote Config
/// then falls back to its in-code defaults (see [ForceUpdateGate]).
Future<void> _initFirebase() async {
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
    // Don't pollute Crashlytics with errors thrown during local development.
    await FirebaseCrashlytics.instance.setCrashlyticsCollectionEnabled(
      !kDebugMode,
    );
    final priorOnError = FlutterError.onError;
    FlutterError.onError = (details) {
      FirebaseCrashlytics.instance.recordFlutterFatalError(details);
      // Keep the console dump / red-screen in debug.
      priorOnError?.call(details);
    };
    WidgetsBinding.instance.platformDispatcher.onError = (error, stack) {
      FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
      return true;
    };
  } catch (e) {
    debugPrint('Firebase init skipped: $e');
  }
}

class Sector7App extends ConsumerStatefulWidget {
  const Sector7App({super.key});

  @override
  ConsumerState<Sector7App> createState() => _Sector7AppState();
}

class _Sector7AppState extends ConsumerState<Sector7App>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Warm the lock-screen surface plumbing (timezone DB, notification channels,
    // ActivityKit App Group) once. Idempotent + fire-and-forget; the live-session
    // binder no-ops until this completes.
    ref.read(liveSessionServiceProvider).init();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Flush queued workout writes whenever the app returns to the foreground —
  /// the trainer often re-opens the app once they're back in wifi range.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        ref.read(authControllerProvider).status == AuthStatus.authenticated) {
      ref.read(workoutSyncServiceProvider).flushPending();
    }
  }

  /// Kick the offline machinery once a session is established: start the
  /// connectivity-driven sync, flush anything left from a prior run, and warm
  /// the exercise-library cache for offline search.
  void _onAuthenticated() {
    ref.read(workoutSyncServiceProvider).start();
    ref.read(workoutSyncServiceProvider).flushPending();
    ref.read(workoutRepositoryProvider).prefetchExerciseLibrary();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<AuthState>(authControllerProvider, (prev, next) {
      if (prev?.status != AuthStatus.authenticated &&
          next.status == AuthStatus.authenticated) {
        _onAuthenticated();
      }
    });

    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeModeProvider);
    return MaterialApp.router(
      title: 'Sector 7',
      debugShowCheckedModeBanner: false,
      // Follows the OS by default; the user can override to Light/Dark in
      // Settings (persisted via [themeModeProvider]).
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: themeMode,
      routerConfig: router,
      // Remote-Config force-update gate wraps every route (fails open).
      builder: (context, child) =>
          ForceUpdateGate(child: child ?? const SizedBox.shrink()),
    );
  }
}
