/// Online/offline detection that drives the offline workout sync flush.
///
/// Wraps `connectivity_plus`, which reports the *network interface* (wifi /
/// cellular / none) — not true server reachability. That's enough to (a) skip
/// pointless POSTs while there's no network and (b) kick a flush the moment a
/// connection returns. A "connected but server unreachable" call still fails
/// gracefully in the sync engine and stays `pending` for the next attempt.
library;

import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class ConnectivityService {
  ConnectivityService([Connectivity? connectivity])
      : _connectivity = connectivity ?? Connectivity();

  final Connectivity _connectivity;

  static bool _hasNetwork(List<ConnectivityResult> results) =>
      results.any((r) => r != ConnectivityResult.none);

  /// Current best-effort online state.
  Future<bool> isOnline() async {
    try {
      return _hasNetwork(await _connectivity.checkConnectivity());
    } catch (_) {
      // If the platform channel misbehaves, assume online so we still attempt
      // the write rather than silently queueing forever.
      return true;
    }
  }

  /// Emits `true` when a network interface is available, `false` otherwise.
  /// De-duplicated so a wifi→cellular hop (both "online") doesn't spam a flush.
  Stream<bool> get onlineChanges => _connectivity.onConnectivityChanged
      .map(_hasNetwork)
      .distinct();
}

final connectivityServiceProvider =
    Provider<ConnectivityService>((ref) => ConnectivityService());
