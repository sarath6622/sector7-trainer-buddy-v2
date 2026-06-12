import 'package:flutter/material.dart';

/// Shown while AuthController restores a session on cold start.
/// The router redirects away once auth status resolves.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}
