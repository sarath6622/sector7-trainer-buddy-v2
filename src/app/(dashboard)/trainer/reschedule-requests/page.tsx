import { RescheduleReviewPage } from '@/components/reschedule/RescheduleReviewPage';

export default function TrainerRescheduleRequestsPage() {
  return (
    <RescheduleReviewPage
      title="Reschedule Requests"
      subtitle="Review reschedule requests from your clients"
      apiListUrl="/api/trainer/reschedule-requests"
      apiBase="/api/trainer/reschedule-requests"
      showTrainer={false}
    />
  );
}
