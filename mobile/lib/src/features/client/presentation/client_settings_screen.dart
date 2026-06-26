import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../auth/application/auth_controller.dart';
import '../../../core/widgets/skeleton.dart';
import '../data/client_repository.dart';
import 'widgets/client_widgets.dart';

/// Client "Settings" — edit own name + phone (the Phase 2 leftover). Reads the
/// current values from `GET /api/client/profile` and saves via PATCH; on success
/// the cached auth user is updated so the Profile tab reflects the new name.
class ClientSettingsScreen extends ConsumerWidget {
  const ClientSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(clientProfileEditProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: profile.when(
        loading: () => const SkeletonList(),
        error: (e, _) => ErrorRetry(
          message: e.toString(),
          onRetry: () => ref.invalidate(clientProfileEditProvider),
        ),
        data: (p) => _SettingsForm(
          firstName: p.firstName,
          lastName: p.lastName,
          phone: p.phone,
        ),
      ),
    );
  }
}

class _SettingsForm extends ConsumerStatefulWidget {
  const _SettingsForm({
    required this.firstName,
    required this.lastName,
    required this.phone,
  });

  final String firstName;
  final String lastName;
  final String? phone;

  @override
  ConsumerState<_SettingsForm> createState() => _SettingsFormState();
}

class _SettingsFormState extends ConsumerState<_SettingsForm> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _first =
      TextEditingController(text: widget.firstName);
  late final TextEditingController _last =
      TextEditingController(text: widget.lastName);
  late final TextEditingController _phone =
      TextEditingController(text: widget.phone ?? '');
  bool _saving = false;

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    final messenger = ScaffoldMessenger.of(context);
    final first = _first.text.trim();
    final last = _last.text.trim();
    final phone = _phone.text.trim();
    try {
      await ref.read(clientRepositoryProvider).updateProfile(
            firstName: first,
            lastName: last,
            // Phone is min-7 on the server; skip it when blank rather than
            // sending an invalid empty string.
            phone: phone.isEmpty ? null : phone,
          );
      ref.read(authControllerProvider.notifier).applyProfileUpdate(
            firstName: first,
            lastName: last,
          );
      ref.invalidate(clientProfileEditProvider);
      messenger.showSnackBar(const SnackBar(content: Text('Profile updated')));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
        children: [
          TextFormField(
            controller: _first,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              labelText: 'First name',
              border: OutlineInputBorder(),
            ),
            validator: (v) =>
                (v == null || v.trim().isEmpty) ? 'First name is required' : null,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _last,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              labelText: 'Last name',
              border: OutlineInputBorder(),
            ),
            validator: (v) =>
                (v == null || v.trim().isEmpty) ? 'Last name is required' : null,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Phone',
              border: OutlineInputBorder(),
            ),
            validator: (v) {
              final t = v?.trim() ?? '';
              if (t.isEmpty) return null; // optional
              if (t.length < 7) return 'Enter a valid phone number';
              return null;
            },
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _saving ? null : _save,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            child: _saving
                ? const SizedBox(
                    height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Save changes'),
          ),
        ],
      ),
    );
  }
}
