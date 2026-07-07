import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/feedback/haptics.dart';
import '../../../core/theme/app_theme.dart';
import '../application/auth_controller.dart';

/// Sign-in screen — a Flutter port of the PWA's `(auth)/login` page.
///
/// Like the web login it is **always dark** regardless of the app's theme
/// (the PWA forces `className="dark"` here), so colours are pinned to the
/// brand's dark tokens rather than read from [Theme].
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _showPassword = false;

  // ── Pinned dark palette (Sector 7 dark UI tokens; always dark here) ─────────
  static const _bg = AppTheme.darkCanvas; // page background
  static const _card = AppTheme.darkSurface; // sign-in card
  static const _border = AppTheme.darkBorder; // card / field borders
  static const _fieldFill = Color(0x0AFFFFFF); // white/4% — subtle input fill
  static const _orange = AppTheme.brand; // --primary
  static const _white = AppTheme.darkTextPrimary;
  static const _zinc400 = AppTheme.darkTextSecondary;
  static const _zinc500 = AppTheme.darkTextTertiary;
  static const _zinc600 = Color(0xFF52525B);
  static const _zinc700 = Color(0xFF3F3F46);
  static const _red400 = Color(0xFFF87171);

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  void _submit() {
    FocusScope.of(context).unfocus();
    if (_formKey.currentState?.validate() ?? false) {
      Haptics.primary(); // confirm the tap registered; the result buzzes below
      ref
          .read(authControllerProvider.notifier)
          .login(_email.text, _password.text);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Buzz the outcome of an *interactive* sign-in: success when the credentials
    // land, error when they're rejected. Gated on the prior state being
    // `authenticating` so a silent token-restore on cold start stays quiet.
    ref.listen<AuthState>(authControllerProvider, (prev, next) {
      if (prev?.status != AuthStatus.authenticating) return;
      if (next.status == AuthStatus.authenticated) {
        Haptics.success();
      } else if (next.error != null) {
        Haptics.error();
      }
    });

    final state = ref.watch(authControllerProvider);
    final busy = state.status == AuthStatus.authenticating;

    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 360),
              child: TweenAnimationBuilder<double>(
                duration: const Duration(milliseconds: 400),
                curve: Curves.easeOut,
                tween: Tween(begin: 0, end: 1),
                builder: (context, t, child) => Opacity(
                  opacity: t,
                  child: Transform.translate(
                    offset: Offset(0, (1 - t) * 12),
                    child: child,
                  ),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Brand wordmark (compact, like the PWA's mobile logo).
                    Center(
                      child: Image.asset(
                        'assets/images/sector7-logo.png',
                        width: 160,
                        fit: BoxFit.contain,
                      ),
                    ),
                    const SizedBox(height: 20),
                    _card2(busy, state.error),
                    const SizedBox(height: 16),
                    const Text(
                      'Sector 7 Fitness · Gym & CrossFit',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, color: _zinc700),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _card2(bool busy, String? error) {
    return Container(
      decoration: BoxDecoration(
        color: _card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: _border),
      ),
      padding: const EdgeInsets.all(26),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Sign in to Sector 7',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 21,
                fontWeight: FontWeight.w700,
                color: _white,
                letterSpacing: -0.2,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Enter your credentials to continue',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, color: _zinc500),
            ),
            const SizedBox(height: 24),
            _label('EMAIL'),
            const SizedBox(height: 6),
            _field(
              controller: _email,
              hint: 'you@sector7.com',
              enabled: !busy,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              validator: (v) =>
                  (v == null || !v.contains('@')) ? 'Enter a valid email' : null,
            ),
            const SizedBox(height: 16),
            _label('PASSWORD'),
            const SizedBox(height: 6),
            _field(
              controller: _password,
              hint: 'Enter your password',
              enabled: !busy,
              obscure: !_showPassword,
              autofillHints: const [AutofillHints.password],
              onSubmitted: (_) => _submit(),
              validator: (v) =>
                  (v == null || v.isEmpty) ? 'Enter your password' : null,
              suffix: IconButton(
                onPressed: () =>
                    setState(() => _showPassword = !_showPassword),
                icon: Icon(
                  _showPassword
                      ? Icons.visibility_off_outlined
                      : Icons.visibility_outlined,
                  size: 18,
                  color: _zinc600,
                ),
                splashRadius: 18,
                tooltip: _showPassword ? 'Hide password' : 'Show password',
              ),
            ),
            if (error != null) ...[
              const SizedBox(height: 16),
              _errorBox(error),
            ],
            const SizedBox(height: 20),
            _signInButton(busy),
          ],
        ),
      ),
    );
  }

  Widget _label(String text) => Text(
        text,
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w500,
          color: _zinc400,
          letterSpacing: 1.0,
        ),
      );

  Widget _field({
    required TextEditingController controller,
    required String hint,
    required bool enabled,
    bool obscure = false,
    Widget? suffix,
    TextInputType? keyboardType,
    List<String>? autofillHints,
    void Function(String)? onSubmitted,
    String? Function(String?)? validator,
  }) {
    OutlineInputBorder border(Color c, [double w = 1]) => OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: c, width: w),
        );
    return TextFormField(
      controller: controller,
      enabled: enabled,
      obscureText: obscure,
      keyboardType: keyboardType,
      autocorrect: false,
      enableSuggestions: false,
      autofillHints: autofillHints,
      onFieldSubmitted: onSubmitted,
      validator: validator,
      style: const TextStyle(color: _white, fontSize: 15),
      cursorColor: _orange,
      decoration: InputDecoration(
        isDense: true,
        filled: true,
        fillColor: _fieldFill,
        hintText: hint,
        hintStyle: const TextStyle(color: _zinc600, fontSize: 15),
        suffixIcon: suffix,
        suffixIconConstraints:
            const BoxConstraints(minWidth: 44, minHeight: 44),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        enabledBorder: border(_border),
        focusedBorder: border(_orange.withValues(alpha: 0.6), 1.5),
        errorBorder: border(_red400.withValues(alpha: 0.6)),
        focusedErrorBorder: border(_red400, 1.5),
        errorStyle: const TextStyle(color: _red400, fontSize: 12),
      ),
    );
  }

  Widget _errorBox(String message) => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: const Color(0x1AEF4444), // red/10
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0x33EF4444)), // red/20
        ),
        child: Text(
          message,
          style: const TextStyle(color: _red400, fontSize: 13),
        ),
      );

  Widget _signInButton(bool busy) => SizedBox(
        height: 48,
        child: FilledButton(
          onPressed: busy ? null : _submit,
          style: FilledButton.styleFrom(
            backgroundColor: _orange,
            foregroundColor: Colors.white,
            disabledBackgroundColor: _orange.withValues(alpha: 0.6),
            disabledForegroundColor: Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            textStyle:
                const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          ),
          child: busy
              ? const SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : Row(
                  mainAxisSize: MainAxisSize.min,
                  children: const [
                    Icon(Icons.login_rounded, size: 18),
                    SizedBox(width: 8),
                    Text('Sign in'),
                  ],
                ),
        ),
      );
}
