import ActivityKit
import SwiftUI
import WidgetKit

/// The App Group the Runner writes the live-session data into. Must match the
/// Runner + widget entitlements and `LiveSessionService._appGroupId` in Dart.
private let appGroupId = "group.com.sector7.sector7_mobile.liveactivities"
private let sharedDefault = UserDefaults(suiteName: appGroupId)!

/// Decoded snapshot of the current live session, read from the shared App Group.
/// Mirrors `LiveSessionContent.toActivityData()`.
@available(iOS 16.1, *)
struct SessionData {
  let personName: String
  let workoutTitle: String
  let statusWord: String
  let statusDetail: String
  let mood: String
  let isResting: Bool
  let isPaused: Bool
  let startedAt: Date
  let restStart: Date
  let restEnd: Date

  init(_ context: ActivityViewContext<LiveActivitiesAppAttributes>) {
    func str(_ k: String) -> String {
      sharedDefault.string(forKey: context.attributes.prefixedKey(k)) ?? ""
    }
    func dbl(_ k: String) -> Double {
      sharedDefault.double(forKey: context.attributes.prefixedKey(k))
    }
    func flag(_ k: String) -> Bool {
      sharedDefault.bool(forKey: context.attributes.prefixedKey(k))
    }
    personName = str("personName")
    workoutTitle = str("workoutTitle")
    statusWord = str("statusWord")
    statusDetail = str("statusDetail")
    mood = str("mood")
    isResting = flag("isResting")
    isPaused = flag("isPaused")
    startedAt = Date(timeIntervalSince1970: dbl("startedAtMs") / 1000)
    restStart = Date(timeIntervalSince1970: dbl("restStartMs") / 1000)
    restEnd = Date(timeIntervalSince1970: dbl("restEndMs") / 1000)
  }

  /// The single mood colour driving the surface — matches the in-app hero card
  /// (green on-track, amber paused, rose needs-attention).
  var moodColor: Color {
    switch mood {
    case "paused": return Color(red: 0.96, green: 0.62, blue: 0.04) // amber 500
    case "idle": return Color(red: 0.98, green: 0.44, blue: 0.52) // rose 400
    default: return Color(red: 0.13, green: 0.77, blue: 0.37) // green 500
    }
  }

  /// True when a rest countdown should self-tick (valid future window, session
  /// not paused).
  var showRest: Bool { isResting && restEnd > restStart && !isPaused }
}

/// The self-ticking timer (rest countdown / elapsed) shared by the lock screen
/// and Dynamic Island. `Text(timerInterval:)` / `style: .timer` update on the
/// lock screen without the app running.
@available(iOS 16.1, *)
struct SessionTimerText: View {
  let data: SessionData

  var body: some View {
    if data.showRest {
      Text(timerInterval: data.restStart...data.restEnd, countsDown: true)
        .monospacedDigit()
        .foregroundStyle(data.moodColor)
    } else if data.isPaused {
      Text("Paused").foregroundStyle(data.moodColor)
    } else {
      Text(data.startedAt, style: .timer)
        .monospacedDigit()
        .foregroundStyle(.white)
    }
  }
}

@available(iOS 16.1, *)
struct Sector7LockScreenView: View {
  let context: ActivityViewContext<LiveActivitiesAppAttributes>

  var body: some View {
    let data = SessionData(context)
    HStack(spacing: 12) {
      RoundedRectangle(cornerRadius: 3)
        .fill(data.moodColor)
        .frame(width: 4)

      VStack(alignment: .leading, spacing: 3) {
        Text(data.workoutTitle.isEmpty ? "Workout" : data.workoutTitle)
          .font(.headline)
          .fontWeight(.bold)
          .lineLimit(1)
        if !data.personName.isEmpty {
          Text(data.personName)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        HStack(spacing: 5) {
          Circle().fill(data.moodColor).frame(width: 6, height: 6)
          Text(data.statusWord)
            .font(.caption2)
            .fontWeight(.bold)
            .foregroundStyle(data.moodColor)
          if !data.statusDetail.isEmpty {
            Text(data.statusDetail)
              .font(.caption2)
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }
        }
        .padding(.top, 1)
      }

      Spacer(minLength: 8)

      VStack(alignment: .trailing, spacing: 1) {
        SessionTimerText(data: data)
          .font(.system(size: 30, weight: .bold, design: .rounded))
        Text(data.showRest ? "REST" : "ELAPSED")
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
    .padding(16)
  }
}

@available(iOS 16.1, *)
struct Sector7SessionLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: LiveActivitiesAppAttributes.self) { context in
      Sector7LockScreenView(context: context)
        .activityBackgroundTint(Color.black.opacity(0.9))
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      let data = SessionData(context)
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading, spacing: 2) {
            Text(data.workoutTitle.isEmpty ? "Workout" : data.workoutTitle)
              .font(.subheadline).fontWeight(.bold).lineLimit(1)
            if !data.personName.isEmpty {
              Text(data.personName).font(.caption2).foregroundStyle(.secondary)
            }
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          SessionTimerText(data: data)
            .font(.system(size: 22, weight: .bold, design: .rounded))
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack(spacing: 5) {
            Circle().fill(data.moodColor).frame(width: 6, height: 6)
            Text(data.statusWord).font(.caption2).fontWeight(.bold)
              .foregroundStyle(data.moodColor)
            if !data.statusDetail.isEmpty {
              Text(data.statusDetail).font(.caption2).foregroundStyle(.secondary)
                .lineLimit(1)
            }
          }
        }
      } compactLeading: {
        Image(systemName: "figure.strengthtraining.traditional")
          .foregroundStyle(data.moodColor)
      } compactTrailing: {
        SessionTimerText(data: data).monospacedDigit().frame(maxWidth: 52)
      } minimal: {
        Image(systemName: "figure.strengthtraining.traditional")
          .foregroundStyle(data.moodColor)
      }
    }
  }
}
