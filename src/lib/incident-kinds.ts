/**
 * Incident kinds in plain words, for every ops screen that names one (Incidents, Overview, Waiting on me). No imports,
 * so client and server code and the tests can all read it. A kind not listed falls back to its slug with spaces.
 */
export const INCIDENT_KIND_LABEL: Readonly<Record<string, string>> = {
  server_error: "Server error",
  upload_failed: "Upload failed",
  upload_rejected: "Upload refused",
  cron_failed: "Scheduled job failed",
  email_failed: "Email failed",
};

export const incidentKindLabel = (kind: string) => INCIDENT_KIND_LABEL[kind] ?? kind.replace(/_/g, " ");
