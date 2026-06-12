import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../auth/application/auth_controller.dart';

/// Reads from the existing `GET /api/client/dashboard`. The real payload also
/// carries `nextSession`, `activeSession`, recent workouts and progress — model
/// those out as the screen grows. This scaffold maps just the session counts
/// to prove the auth → API → UI loop end-to-end.
class ClientDashboard {
  const ClientDashboard({
    required this.month,
    required this.used,
    required this.remaining,
    required this.nextSessionLabel,
  });

  final String month;
  final int used;
  final int remaining;
  final String? nextSessionLabel;

  factory ClientDashboard.fromJson(Map<String, dynamic> json) {
    final counts = (json['sessionCount'] ?? json['counts'] ?? const {}) as Map?;
    final next = json['nextSession'] as Map?;
    final trainer = (next?['trainer'] as Map?)?['user'] as Map?;
    return ClientDashboard(
      month: (json['month'] ?? '') as String,
      used: (counts?['used'] ?? 0) as int,
      remaining: (counts?['remaining'] ?? 0) as int,
      nextSessionLabel: next == null
          ? null
          : '${next['scheduledDate']} · '
              '${trainer?['firstName'] ?? ''} ${trainer?['lastName'] ?? ''}'.trim(),
    );
  }
}

class ClientRepository {
  ClientRepository(this._api);
  final ApiClient _api;

  Future<ClientDashboard> dashboard() async {
    final data = await _api.get('/client/dashboard') as Map<String, dynamic>;
    return ClientDashboard.fromJson(data);
  }
}

final clientRepositoryProvider = Provider<ClientRepository>(
  (ref) => ClientRepository(ref.watch(apiClientProvider)),
);

final clientDashboardProvider = FutureProvider.autoDispose<ClientDashboard>(
  (ref) => ref.watch(clientRepositoryProvider).dashboard(),
);
