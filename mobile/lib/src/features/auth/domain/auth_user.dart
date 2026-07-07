/// Mirrors the backend session user from `GET /api/auth/me`:
/// { id, email, role, branchId, firstName, lastName, trainerProfileId, clientProfileId }
///
/// `role` is the computed PRIMARY role (see src/lib/auth.ts computePrimaryRole).
/// Mobile only targets TRAINER and CLIENT; admins use the web console.
class AuthUser {
  const AuthUser({
    required this.id,
    required this.email,
    required this.role,
    required this.branchId,
    required this.firstName,
    required this.lastName,
    this.trainerProfileId,
    this.clientProfileId,
  });

  final String id;
  final String email;
  final String role;
  final String branchId;
  final String firstName;
  final String lastName;
  final String? trainerProfileId;
  final String? clientProfileId;

  String get fullName => '$firstName $lastName';

  AuthUser copyWith({String? firstName, String? lastName}) => AuthUser(
        id: id,
        email: email,
        role: role,
        branchId: branchId,
        firstName: firstName ?? this.firstName,
        lastName: lastName ?? this.lastName,
        trainerProfileId: trainerProfileId,
        clientProfileId: clientProfileId,
      );

  bool get isTrainer =>
      role == 'TRAINER' ||
      role == 'KICKBOXING_TRAINER' ||
      role == 'CROSSFIT_TRAINER';
  bool get isClient => role == 'CLIENT';
  bool get isAdmin => role == 'SUPER_ADMIN' || role == 'BRANCH_ADMIN';

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        id: json['id'] as String,
        email: json['email'] as String,
        role: json['role'] as String,
        branchId: json['branchId'] as String,
        firstName: json['firstName'] as String? ?? '',
        lastName: json['lastName'] as String? ?? '',
        trainerProfileId: json['trainerProfileId'] as String?,
        clientProfileId: json['clientProfileId'] as String?,
      );
}
