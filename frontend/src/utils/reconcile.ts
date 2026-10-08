import { applyJobEvent, type JobsSnapshot, type SSEEventData } from '@ytdlp/shared';
export function reconcileSnapshot(snapshot: JobsSnapshot, events: SSEEventData[]) {
  return [...events].filter(event => event.sequence > snapshot.sequence)
    .sort((a,b) => a.sequence-b.sequence).reduce(applyJobEvent, snapshot.jobs);
}
