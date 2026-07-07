import SwiftUI
import WidgetKit

/// The widget extension entry point. Only the Live Activity is bundled — there
/// is no home-screen widget. Gated to iOS 16.1+ where ActivityKit exists.
@main
struct Sector7WidgetBundle: WidgetBundle {
  var body: some Widget {
    if #available(iOS 16.1, *) {
      Sector7SessionLiveActivity()
    }
  }
}
