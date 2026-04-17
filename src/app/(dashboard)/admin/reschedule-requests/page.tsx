import { RescheduleReviewPage } from '@/components/reschedule/RescheduleReviewPage';

export default function AdminRescheduleRequestsPage() {
  return (
    <RescheduleReviewPage
      title="Reschedule Requests"
      subtitle="Review and action client reschedule requests for this branch"
      apiListUrl="/api/admin/reschedule-requests"
      apiBase="/api/admin/reschedule-requests"
      showTrainer={true}
    />
  );
}
