import ActivityKit
import Foundation

/// Mirrors the `live_activities` plugin's pipe: the Flutter side stores the
/// dynamic content map in the shared App Group `UserDefaults`, keyed by
/// `"<attributes.id>_<key>"`. The `ContentState` is intentionally empty — every
/// field is read back dynamically via `prefixedKey`, so the schema lives in Dart
/// (`LiveSessionContent.toActivityData`) without a duplicated Swift model.
struct LiveActivitiesAppAttributes: ActivityAttributes, Identifiable {
  public typealias LiveDeliveryData = ContentState

  public struct ContentState: Codable, Hashable {}

  var id = UUID()
}

extension LiveActivitiesAppAttributes {
  func prefixedKey(_ key: String) -> String {
    "\(id)_\(key)"
  }
}
