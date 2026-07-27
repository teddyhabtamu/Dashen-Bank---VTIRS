# VTIRS Task Backlog

This document turns the current VTIRS implementation into a work order.
The goal is to finish the gaps one by one, in a dependency-safe order, without reworking areas that are already in place.

## Current State Summary

The codebase already has a strong baseline:

- React + TypeScript client with routed pages for dashboard, vehicles, registrations, insurance, documents, search, reports, audit, notifications, users, roles, and settings.
- Express + Prisma backend with auth, RBAC, vehicle CRUD, registration lifecycle, insurance data, document upload and preview, dashboard metrics, search, audit logs, notifications, and system settings.
- Prisma schema already contains the main domain models needed for VTIRS: vehicles, registrations, insurances, documents, images, assignments, branches, departments, drivers, manufacturers, models, users, roles, permissions, notifications, audit logs, and settings.

The remaining work is mostly about closing product gaps, normalizing the reference-data flow, tightening data integrity, and making the enterprise workflows complete.

## Work Order

### 1. Reference Data Administration

Goal: make the lookup entities manageable from the UI instead of relying on seed data or backend-only routes.

Current gap:

- The backend exposes branches, departments, drivers, and manufacturers through lookup endpoints, but the product does not yet have a complete administration experience for all of them.
- Vehicle creation can add branches, departments, and drivers inline, but there is no dedicated master-data workspace for maintenance and lifecycle control.
- Manufacturers and vehicle models exist in the schema, but there is no end-to-end UI for keeping them clean and synchronized with vehicles.

Work items:

- Build admin screens for branches, departments, drivers, manufacturers, and vehicle models.
- Add create, update, deactivate, and delete flows where the data model allows it.
- Add duplicate prevention rules for codes and names.
- Keep the lookup data used by vehicle forms and search filters in sync with the admin screens.
- Make sure every master-data change is audited.

Acceptance criteria:

- Admin users can manage all reference data without touching the database directly.
- Active values appear in vehicle forms and filters immediately after refresh.
- Duplicate branches, departments, drivers, manufacturers, and models are blocked.

### 2. Vehicle Registry Normalization

Goal: make the vehicle master record fully aligned with the domain model and remove ambiguity in how core vehicle attributes are stored.

Current gap:

- The vehicle schema stores make and model as free text, while the schema also contains manufacturer and vehicle model tables that are not yet part of the main vehicle entry workflow.
- Vehicle registration is functional, but the data entry experience still needs stronger normalization around vehicle identity and reference data.
- The dashboard and search layers already depend on accurate vehicle master data, so this is a foundational task.

Work items:

- Decide whether make/model should remain free text or be normalized to manufacturer/model lookups.
- If normalized, connect the vehicle form and backend validation to the manufacturer and vehicle model tables.
- Add stronger validation for plate number, engine number, chassis number, year, and ownership fields.
- Keep duplicate detection for plate, engine, and chassis numbers strict across create and update flows.
- Review whether acquisition, purchase cost, and owner defaults should be prefilled from settings or lookup data.

Acceptance criteria:

- Vehicle identity fields are stored consistently and validated at the API boundary.
- Duplicate vehicle identifiers are rejected with clear field-level errors.
- The vehicle form matches the real data model, not just the UI layout.

### 3. Vehicle List and Detail Completion

Goal: finish the registry UX so it feels like an enterprise fleet console rather than a partial CRUD page.

Current gap:

- The list page exists and supports search, filtering, pagination, and bulk operations, but it still needs final tuning for advanced registry workflows.
- The detail page shows core sections, assignments, registration, insurance, and documents, but it should be checked against the full spec for completeness and readability.

Work items:

- Review the vehicle list for missing columns, filters, and bulk actions.
- Add any missing quick actions for status changes, assignment handoff, or record review.
- Improve empty states and loading states so operators understand what the screen is doing.
- Check whether vehicle history, activity, and linked records should be more visible from the detail page.
- Verify that the edit flow preserves all fields and returns to the right location after save.

Acceptance criteria:

- The registry supports efficient day-to-day vehicle administration.
- Operators can find, inspect, edit, and triage vehicles without leaving the registry workflow.

### 4. Registration Lifecycle and History

Goal: make registration management complete, traceable, and easy to operate.

Current gap:

- The backend already supports create, renew, suspend, archive, restore, and history tables.
- The remaining work is mostly around the operator experience, consistency, and edge-case handling.

Work items:

- Review the registration detail and history experience for completeness.
- Add or refine registration timeline views so renewals and status changes are easy to read.
- Make sure renewal reminders are visible in the right places.
- Verify the 90, 60, 30, and 7 day reminder windows match the settings values.
- Tighten validation around expiry dates, registration numbers, and lifecycle transitions.

Acceptance criteria:

- Registration changes are fully traceable from creation to renewal, suspension, archive, and restore.
- Reminder windows are driven by settings and behave consistently across dashboard, notifications, and reports.

### 5. Insurance Lifecycle

Goal: bring insurance handling to the same standard as registration handling.

Current gap:

- Insurance CRUD and expiry tracking are present.
- The system still needs final alignment on lifecycle rules, reminders, and visibility.

Work items:

- Confirm insurance create, update, renew, and expiry behaviors are complete.
- Add or refine any insurance history or audit visibility required by Facilities.
- Check that insurance expiring soon and expired states are represented consistently in dashboard, search, and reports.
- Ensure insurance filters and labels match the actual domain vocabulary used by the business.

Acceptance criteria:

- Insurance records are easy to search, review, and renew.
- Expiry risk is visible anywhere the vehicle record is shown.

### 6. Document Management Versioning

Goal: turn document upload into a proper repository with history, not just a file attachment feature.

Current gap:

- Upload, preview, download, and delete are already implemented.
- The schema has a version field, but there is no true version history workflow or restore flow yet.
- The spec asks for version history, browser preview, and document repository behavior that feels enterprise-grade.

Work items:

- Add document version history views per vehicle.
- Decide whether a new upload replaces the latest version, creates a new version entry, or both.
- Add a way to inspect earlier versions and compare metadata.
- Decide whether image uploads should also participate in the same versioning story.
- Improve document category handling so the categories stay consistent across UI and data model.

Acceptance criteria:

- Users can see the historical chain of uploaded documents for a vehicle.
- Versioned documents are understandable and recoverable.

### 7. Search and Discoverability

Goal: make global search fast, broad, and trustworthy for operators.

Current gap:

- Search already works across vehicles, registrations, insurances, and documents.
- The current query surface still misses some business fields from the spec, especially driver-based discovery.

Work items:

- Add search by driver name where possible.
- Consider expanding search coverage to more fields that Facilities uses daily, such as branch, department, and registration office.
- Review ranking and result grouping so the most relevant records rise to the top.
- Add reusable search chips or saved filters if operators need repeated searches.
- Make sure search results clearly separate vehicles, registrations, insurances, and documents.

Acceptance criteria:

- A user can find the correct fleet record with a small number of keystrokes.
- Search results are clearly categorized and useful for both lookup and action.

### 8. Dashboard Parity

Goal: complete the dashboard so it reflects the spec, not only the data already queried by the backend.

Current gap:

- The dashboard already shows the major KPI cards, expiry alerts, recent activity, and several charts.
- The backend also computes model distribution, but the current dashboard UI does not display it.
- The spec also calls for quick search and broader operational visibility.

Work items:

- Add the missing vehicles-by-model chart.
- Review whether quick search should be surfaced directly from the dashboard.
- Check KPI wording against the business spec, especially active, assigned, expired, pending renewal, and insurance expiring counts.
- Make sure the dashboard cards and charts are still readable on smaller screens.

Acceptance criteria:

- The dashboard covers the KPI and chart set described in the product brief.
- The dashboard is useful as a daily operational landing page, not just a summary page.

### 9. Reporting and Export

Goal: make reporting reliable enough for management and audit use.

Current gap:

- The reports page already supports inventory, registration status, registration expiry, insurance expiry, branch, department, age, and cost views.
- The client can export CSV, Excel, and PDF from the current report data.
- The next step is making sure the report content, filters, and totals are complete and accurate.

Work items:

- Validate each report against the intended business definition.
- Review whether any additional report columns or totals are required.
- Make sure branch, department, status, and date filters behave consistently across all report types.
- Decide whether report exports should remain client-generated or move to server-generated files for large data sets.
- Add saved-report or scheduled-report support only if it is still in scope for the current release.

Acceptance criteria:

- Management can export the key fleet reports in the requested formats.
- Report totals and filters remain consistent across UI and export output.

### 10. Notifications and Reminder Delivery

Goal: extend reminders from in-app notices into a real operational notification system.

Current gap:

- In-app notifications already exist for registration and insurance reminders.
- The spec also asks for email notifications and document expiry alerts.
- There is no visible delivery pipeline for outbound email yet.

Work items:

- Add an email delivery layer for the reminder system.
- Define notification templates for registration, insurance, and any other expiry alerts in scope.
- Decide which reminders are user-specific and which are system-wide.
- Add retry, logging, and failure visibility for reminder delivery.
- Review whether document expiry alerts need a new data model before implementation.

Acceptance criteria:

- Reminders can be delivered in-app and by email.
- Reminder failures are visible and do not silently disappear.

### 11. Audit Trail, RBAC, and Settings Hardening

Goal: ensure enterprise controls are dependable, not just present in the menu.

Current gap:

- RBAC, audit logs, and settings screens already exist.
- The work now is mostly about consistency, completeness, and polishing the control flow.

Work items:

- Verify that every create, update, delete, upload, and status transition writes an audit entry.
- Make sure IP address and user agent capture is consistently populated.
- Review whether settings changes should be grouped, validated, and explained more clearly.
- Confirm that all role changes and permission edits are properly constrained.
- Check that protected routes and API permissions stay in sync.

Acceptance criteria:

- Security-sensitive actions are auditable.
- Permissions are enforced consistently in the UI and the backend.

### 12. Security, Validation, Backup, and Release Readiness

Goal: bring the system up to production readiness.

Current gap:

- File upload limits and MIME filtering exist, but the remaining non-functional requirements still need a production plan.
- The product brief includes encryption, backups, validation, and responsiveness as explicit requirements.

Work items:

- Review input validation across all APIs for strict field-level checking.
- Review file handling for storage safety, allowed file types, and file path correctness.
- Define the deployment approach for backups, encryption at rest, and encryption in transit.
- Add more test coverage for vehicle, registration, insurance, document, notification, settings, auth, RBAC, and report flows.
- Add smoke tests or end-to-end checks for the main operator journeys.

Acceptance criteria:

- The system is ready for controlled internal rollout.
- Core workflows have automated test coverage and do not rely on manual verification alone.

## Suggested Execution Order

1. Reference Data Administration
2. Vehicle Registry Normalization
3. Vehicle List and Detail Completion
4. Registration Lifecycle and History
5. Insurance Lifecycle
6. Document Management Versioning
7. Search and Discoverability
8. Dashboard Parity
9. Reporting and Export
10. Notifications and Reminder Delivery
11. Audit Trail, RBAC, and Settings Hardening
12. Security, Validation, Backup, and Release Readiness

## Notes For Future Work

- Some items are already partially implemented in code, so the task here is to finish and align them, not rebuild them from scratch.
- If the team wants a shorter release scope, the best cut line is to defer email delivery, document version restore, and scheduled reporting, while keeping the core registry, search, dashboard, and admin flows complete.