# Cadenza Management Platform — Standard Operating Procedures (SOP)
**Version:** 1.0
**Last Updated:** 2026-03-04
**Audience:** Administrators, Staff, Super Administrators

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Access & Roles](#2-access--roles)
3. [Logging In](#3-logging-in)
4. [Navigation](#4-navigation)
5. [Calendar Management](#5-calendar-management)
6. [Staff Member Management](#6-staff-member-management)
7. [Student Management](#7-student-management)
8. [Room Management](#8-room-management)
9. [Activity Management](#9-activity-management)
10. [Financial Dashboard](#10-financial-dashboard)
11. [Financial Analysis](#11-financial-analysis)
12. [Manage Lists](#12-manage-lists)
13. [Admin Inbox](#13-admin-inbox)
14. [Document Repository](#14-document-repository)
15. [Hours Reporting](#15-hours-reporting)
16. [Gantt & Blackouts](#16-gantt--blackouts)
17. [Google Calendar Sync](#17-google-calendar-sync)
18. [Settings](#18-settings)
19. [Super Admin](#19-super-admin)
20. [Glossary](#20-glossary)

---

## 1. System Overview

Cadenza is a multi-tenant, cloud-based management platform for music conservatories. It centralizes:

- **Scheduling** — calendar events, recurring lessons, room bookings
- **Staff & Student records** — biographical data, assignments, documents, credentials
- **Financial reporting** — payroll calculations, custom analytics, CSV exports
- **Administrative tools** — task inbox, document repository, hours self-reporting
- **Organizational settings** — localization, Google Calendar sync, school year configuration

All data is scoped to your organization. Multiple organizations can share one deployment; each user has access only to the organizations they are granted.

---

## 2. Access & Roles

| Role | Access Level |
|------|-------------|
| **Viewer** | Calendar only (read-only) |
| **Admin** | All operational views: Calendar, Staff, Students, Rooms, Activities, Inbox, Documents, Financial, Settings |
| **Super Admin** | All Admin views + Super Admin panel (org/user management, data tools, translations) |

Role assignments are managed by a Super Admin in the **Super Admin → Users/Access** panel.

---

## 3. Logging In

1. Navigate to the Cadenza URL provided by your administrator.
2. Click **Sign in with Google**.
3. Authenticate with your Google account.
4. If you have access to multiple organizations, select your organization from the org switcher.

> **If login fails:** Confirm with your Super Admin that your email address has been added to the access list for your organization with the correct role.

---

## 4. Navigation

The sidebar on the left provides access to all sections. On mobile, tap the hamburger icon (☰) to open it.

| Section | Views Included |
|---------|---------------|
| **Operations** | Calendar (includes Gantt sidebar, Power Tools sidebar) |
| **Administration** | Staff Members, Students, Manage (Rooms / Lists), Admin Inbox, Documents |
| **Analytics** | Financial Dashboard, Financial Analysis |
| **System** | Settings, Super Admin (Super Admins only) |

The sidebar can be collapsed on desktop by clicking the collapse toggle at the bottom. The user profile card, dark mode toggle, and logout button are at the bottom of the sidebar.

---

## 5. Calendar Management

### 5.1 View Modes

| Mode | How to Access | Best Use |
|------|--------------|----------|
| **Day** | Click **Day** button | Detailed view of one day |
| **Week** | Click **Week** button | Standard scheduling view |
| **Month** | Click **Month** button | High-level overview |

### 5.2 Creating an Event

1. In **Week** or **Day** view, click on any empty time slot.
2. The **New Event** modal opens.
3. Fill in:
   - **Name** (required)
   - **Date, Start Time, End Time**
   - **Staff Member** (primary assignee)
   - **Room**
   - **Classification** (Individual Lesson, Group Lesson, Masterclass, Rehearsal, Recital, Administrative, Other)
   - **Activity / Subcategory** (if applicable)
4. Optionally configure **Recurrence**:
   - Frequency: Daily, Weekly, Monthly
   - Interval (e.g., every 2 weeks)
   - Until date or number of occurrences
5. Click **Save**.

### 5.3 Editing an Event

1. Click the event on the calendar.
2. Modify fields in the modal.
3. For **recurring events**, choose to update:
   - **This occurrence only**
   - **This and all future occurrences**
   - **All occurrences in the series**
4. Click **Save**.

### 5.4 Moving / Resizing an Event

- **Move**: Drag the event bar to a new time slot or date.
- **Resize**: Drag the bottom handle of the event to extend or shorten duration.
- Releases snap to **15-minute intervals**.

### 5.5 Canceling an Event

1. Click the event to open the modal.
2. Click **Cancel Event**.
3. Choose whether to cancel this occurrence or the series.
4. Canceled events remain visible with a strikethrough unless hidden via filter.

### 5.6 Filtering the Calendar

Use the filter toolbar at the top of the calendar:

| Filter | Effect |
|--------|--------|
| Staff Member | Show only events for selected staff |
| Room | Show only events in selected room |
| Classification | Show only selected classification |
| Position / Tag | Filter by staff position or tag |
| Show Canceled | Toggle visibility of canceled events |
| Show Blackouts | Toggle visibility of blackout periods |
| Overlapping Only | Show only events with room conflicts |

### 5.7 Power Tools (Bulk Operations)

Click the **Power Tools** button (top-right of calendar) to open the sidebar:

- **Bulk Delete**: Select a date range + filters → preview matching events → confirm deletion.
- **CSV Import**: Upload a CSV file with columns `date, start, end, name, teacherId, roomId, classification` to bulk-create events.
- **Marquee Selection**: Click and drag on the calendar grid to select multiple events at once.

---

## 6. Staff Member Management

Navigate to **Staff Members** in the sidebar.

### 6.1 Adding a Staff Member

1. Click **Add Staff Member**.
2. Fill in the required fields across expandable sections:

| Section | Key Fields |
|---------|-----------|
| **Identity** | Full name, Date of Birth, Governmental ID, Employment Type |
| **Contact** | Phone, Email |
| **Position Assignments** | Position name, Category, Rate type (Hourly / Monthly / Per-Event / One-Off), Rate value, Overhead fee, Social benefits, VAT |
| **Position Titles** | Title, Effective start/end dates |
| **Teaching Assignments** | Activity, Subcategory, Date range, Ensemble flag, Roster |
| **Credentials** | Institution, Credential type, Year |
| **Tags** | Multi-select from managed list |
| **Notes** | Free-form notes (timestamped) |
| **Documents** | Upload files (PDF, images, etc.) with a label |
| **Google Calendar** | Enable sync, enter Google Calendar ID |

3. Click **Save**.

### 6.2 Editing a Staff Member

1. Click the staff member card or row.
2. Expand the relevant section.
3. Modify fields.
4. If editing a **Teaching Assignment**, you will be prompted to set an effective date for the transition (the old assignment closes on that date; the new one opens).
5. Click **Save**.

### 6.3 Archiving / Restoring a Staff Member

- **Archive**: Click the **⋯** menu on the staff card → **Archive**. Archived staff are hidden from active lists but their historical data is preserved.
- **Restore**: Toggle **Show Archived** → click the staff card → click **Restore**.

### 6.4 Generating an Hours Report Link

1. Open the staff member.
2. Scroll to **Hours Reports** section.
3. Set **Period Start** and **Period End** dates.
4. Click **Generate Link**.
5. Copy the link and send it to the staff member.

The staff member can open the link without logging in and submit their hours for the period.

---

## 7. Student Management

Navigate to **Students** in the sidebar.

### 7.1 Adding a Student

1. Click **Add Student**.
2. Fill in sections:

| Section | Key Fields |
|---------|-----------|
| **Identity** | Full name, Date of Birth, Governmental ID |
| **Contact** | Phone, Email |
| **Guardians** | Name, Relationship, Phone, Email, Address (add multiple) |
| **Assignments** | Activity, Subcategory, Staff member, Start/end date, Status |
| **Pedagogical Record** | Lesson history, Recital entries, Report cards |
| **Notes** | Free-form notes |
| **Documents** | Upload files with labels |

3. Click **Save**.

### 7.2 Pedagogical Record

| Sub-section | What to Log |
|-------------|------------|
| **Lesson History** | Free-form notes on lesson content and progress |
| **Recital Entries** | Date, event title, repertoire performed, notes |
| **Report Cards** | Date, written assessment content |

### 7.3 Archiving a Student

Click **⋯ → Archive** on the student card. The student's record and history are preserved.

---

## 8. Room Management

Navigate to **Manage → Rooms**.

### 8.1 Adding a Room

1. Click **Add Room**.
2. Enter **Name** and optionally **Itinerary** (equipment list, room description, capacity).
3. Click **Save**.

### 8.2 Room Conflict Detection

Cadenza automatically detects when two non-canceled events are scheduled in the same room at overlapping times. Conflicts generate a notification in **Admin Inbox → Notifications**.

---

## 9. Activity Management

Navigate to **Manage → Activities** (accessed via the Manage view, or embedded in Staff / Student forms).

### 9.1 Activity Types

| Type | Purpose |
|------|---------|
| **Instructional** | Teaching activities (e.g., Piano Lessons, Choir) |
| **Operational** | Administrative or facility activities (e.g., Staff Meeting, Maintenance) |

### 9.2 Adding an Activity

1. Click **Add Activity**.
2. Enter **Name** and select **Type**.
3. Click **Save**.

### 9.3 Adding Subcategories

1. Open an activity.
2. In the **Subcategories** section, click **Add Subcategory**.
3. Enter the subcategory name (e.g., "Beginner", "Advanced", "Group").
4. Click **Save**.

Subcategories can be individually archived without archiving the parent activity.

---

## 10. Financial Dashboard

Navigate to **Financial Dashboard**.

Provides an aggregate view of staff earnings across the organization.

| Metric | Description |
|--------|-------------|
| **Active Hours** | Total non-canceled, billable hours |
| **Canceled Hours** | Hours from canceled events |
| **Hourly Payroll** | Earnings from hourly-rate positions |
| **Global Payroll** | Earnings from fixed-monthly positions |
| **One-Off Payroll** | Earnings from per-event or one-off fees |
| **Grand Total** | Sum of all payroll types |

**Time Period selector**: All Time, This Month, This Week, Today.

Click **Export CSV** to download the current view as a spreadsheet.

---

## 11. Financial Analysis

Navigate to **Financial Analysis**.

### 11.1 Creating a Custom Chart

1. Click **Add Chart**.
2. Configure:
   - **Name**: Label for the chart
   - **Group By**: Teacher, Position, Activity, Tag
   - **Metrics**: Select one or more (hours, payroll, cancellation rate, etc.)
   - **Filters**: Date range, specific teachers/positions/tags
3. Click **Save**.

### 11.2 Comparing Charts

1. Select multiple saved charts using the checkboxes.
2. Click **Compare**.
3. Charts are displayed side-by-side with a merged renderer.

### 11.3 Key Insights (Auto-generated)

Cadenza automatically computes and displays:
- Highest earner
- Cancellation rate
- Activity breakdown
- Position cost distribution

---

## 12. Manage Lists

Navigate to **Manage → Lists**.

Manage the dropdown values used throughout the platform.

| List | Used In |
|------|---------|
| **Positions** | Staff Member position assignments |
| **Tags** | Staff Member tagging and calendar filters |
| **Classifications** | Calendar event classification field |
| **Employment Types** | Staff Member identity section |
| **Absence Reasons** | Hours Report entries |

### 12.1 Adding Items

1. Navigate to the relevant list section.
2. Type the new value in the input field.
3. Click **Add** (or press Enter).

### 12.2 Removing Items

Click the **×** next to any item to remove it.

### 12.3 CSV Import/Export

- **Export**: Click **Download Template** to get a CSV with headers `Type, Value`.
- **Import**: Fill in the template and click **Upload CSV** → confirm import.
- Duplicate values are automatically skipped.

---

## 13. Admin Inbox

Navigate to **Admin Inbox**.

### 13.1 Tabs

| Tab | Contents |
|-----|---------|
| **Tasks** | Manual tasks created by admins; system-flagged items requiring attention |
| **Notifications** | Automated alerts (e.g., room conflicts) |

### 13.2 Room Conflict Notifications

When two events are scheduled in the same room at overlapping times, a notification is automatically created with:
- Names of the conflicting events
- Room name and overlap window
- Link to navigate to the conflicting events on the calendar

### 13.3 Marking Items Done

1. Click on the inbox item to expand it.
2. Click **Mark Done**.
3. The item moves to the completed section (visible via **Show Completed** toggle).

### 13.4 Entity-Aware Expansion

- Tasks linked to **students** display the student names in the expanded view.
- Tasks linked to **staff** display the staff member names.

---

## 14. Document Repository

Navigate to **Documents**.

Provides a unified view of all documents across the organization.

### 14.1 Document Sources

| Tab | Source |
|-----|--------|
| **Staff Documents** | Files uploaded in staff member profiles |
| **Student Documents** | Files uploaded in student profiles |
| **Hours Reports** | Generated hours report forms |
| **Saved Charts** | Financial analysis charts saved for reporting |

### 14.2 Searching Documents

Use the search bar at the top to filter by document label, entity name, or metadata.

### 14.3 Actions

- **Download**: Click the download icon to open or save the file.
- **Navigate to Source**: Click the entity link to jump to the staff or student record the document belongs to.

---

## 15. Hours Reporting

### 15.1 Admin: Generating a Report Link

1. Open **Staff Members** → select a staff member.
2. Scroll to **Hours Reports** section.
3. Set **Period Start** and **Period End**.
4. Click **Generate Link** → copy the URL.
5. Send the URL to the staff member (email, WhatsApp, etc.).

### 15.2 Staff Member: Submitting Hours

1. Open the link received from the admin (no login required).
2. Review the pre-filled calendar events for the period.
3. For each event, confirm or adjust the hours.
4. Add manual entries for work not on the calendar (select type, date, description, hours).
5. Click **Submit**.

The form locks after submission. The admin sees the submission in the Document Repository and in the staff member's profile.

### 15.3 Admin: Reviewing Submissions

1. Navigate to **Documents → Hours Reports**.
2. Click on a submitted report to view the entries.
3. Add **Admin Notes** if needed.
4. Status changes: Pending → Submitted → Reviewed.

---

## 16. Gantt & Blackouts

Access via the **Gantt** button in the Calendar view (opens right-side panel).

### 16.1 Adding a Gantt Block (Semester)

1. Click **Add Block**.
2. Enter **Title** (e.g., "Spring Semester 2026"), **Start Date**, **End Date**, and **Color**.
3. Leave **Blackout** unchecked for a visual-only semester marker.
4. Click **Save**.

### 16.2 Adding a Blackout Period

1. Click **Add Block**.
2. Enter **Title** (e.g., "Passover Break"), **Start Date**, **End Date**.
3. Check **Blackout** → all events in this date range are automatically hidden from the calendar and excluded from financial calculations.
4. Click **Save**.

> **Note:** Blackouts do not delete events — they only hide them. Uncheck Blackout or delete the block to restore visibility.

---

## 17. Google Calendar Sync

Navigate to **Settings → Google Calendar Sync**.

### 17.1 Connecting Google Calendar

1. Click **Connect My Account**.
2. Authenticate via Google OAuth.
3. Select the target Google Calendar from the dropdown.
4. Click **Save**.

> **Important:** Once connected, only the connecting admin's Google account can modify sync settings. Other admins will see the calendar as read-only.

### 17.2 Outbound Sync (Cadenza → Google)

When enabled, new and updated Cadenza events are automatically pushed to the connected Google Calendar. Deletions and cancellations are also synced.

### 17.3 Inbound Import (Google → Cadenza)

1. In **Settings → Google Calendar Sync**, click **Import from Google**.
2. Cadenza fetches events from the past 60 days and the next 60 days.
3. New events are imported; events already imported (matched by `googleEventId`) are skipped.
4. Imported events appear on the Cadenza calendar.

---

## 18. Settings

Navigate to **Settings** (Admin only).

| Setting | Options |
|---------|---------|
| **Language** | English (en-US), Hebrew (he-IL) |
| **Timezone** | System default or custom timezone |
| **Currency** | ₪, $, €, £, ¥, ₹, ₿ |
| **Date Format** | MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD |
| **Time Format** | 12-hour, 24-hour |
| **Default Event Duration** | Minutes (e.g., 60) |
| **Week Number Display** | None, Week Number, Week-of |
| **School Year** | Start date, End date, Label, Enable year boundary markers on calendar |
| **Google Calendar Sync** | Connect account, select calendar, import from Google |

Click **Save** after making changes. A warning appears if you navigate away with unsaved changes.

---

## 19. Super Admin

Navigate to **Super Admin** (Super Admins only).

### 19.1 Organization Management

| Action | Steps |
|--------|-------|
| **Create Org** | Click **New Organization** → enter name → Save |
| **Edit Org** | Click org → update name/slug → Save |
| **Upload Logo** | Click org → upload image in Logo section |
| **Delete Org** | Click org → **Delete** (requires confirmation; irreversible) |
| **Migrate Org** | Use migration panel for atomic slug/name changes with audit trail |

### 19.2 User Access Management

1. Go to **Users/Access** tab.
2. Click **Add User**.
3. Enter email address, select organization, select role (Admin / Viewer).
4. Click **Save**.

**Bulk import**: Download the template CSV, fill in `email, orgId, role` columns, and upload.

### 19.3 Data Management

| Action | Description | Confirmation Required |
|--------|-------------|----------------------|
| **Wipe All Data** | Deletes all events, staff, students, rooms, activities for the org | Triple confirmation required |
| **Regenerate Test Data** | Populates org with sample data (uses existing teachers/rooms/students as seed if available) | Single confirmation |

### 19.4 Translation Overrides

1. Go to **Translations** tab.
2. Find the translation key you want to override (use search).
3. Enter the custom value.
4. Click **Save Override**.

Changes apply immediately across the platform for all users in the organization.

---

## 20. Glossary

| Term | Definition |
|------|-----------|
| **Activity** | A category of work (e.g., Piano Lessons). Has an INSTRUCTIONAL or OPERATIONAL type, and can have subcategories. |
| **Subcategory** | A level within an Activity (e.g., Beginner, Advanced). Used to refine staff assignments and student enrollment. |
| **Teaching Assignment** | A link between a staff member and an Activity/Subcategory, with optional date range and student roster. |
| **Student Assignment** | A link between a student and a staff member's Teaching Assignment, tracking enrollment status and dates. |
| **Position Assignment** | A staff member's compensation role: defines rate type (Hourly, Monthly, Per-Event, One-Off), rate value, overhead, and benefits. |
| **Blackout** | A Gantt block with the Blackout flag enabled. All events within the date range are hidden from the calendar and excluded from reports. |
| **Recurrence Rule** | A rule that generates repeated calendar events (Daily, Weekly, Monthly) with optional end condition. |
| **Exception Edit** | A single modified occurrence of a recurring event series (does not affect other occurrences). |
| **HoursReport** | A self-reporting form generated for a staff member covering a specific date range. Submitted via a token-based URL (no login required). |
| **Admin Inbox Item** | A task or notification in the Admin Inbox. Tasks are manually created; room conflict notifications are auto-generated. |
| **Gantt Block** | A date range marker on the calendar used to represent a semester, holiday, or blackout period. |
| **CalendarSubscription** | A public iCal feed (token-based URL) that allows external calendar apps to subscribe to a filtered view of Cadenza events. |
| **orgId** | The unique identifier for an organization. All data is scoped to this value. |
| **Super Admin** | A privileged role with access to organization management, user access control, data tools, and translation overrides. |
| **BYOK** | Bring Your Own Key — a pattern where users supply their own AI API key (e.g., for AI-assisted assessment summaries). |
| **Google Event ID** | The unique identifier assigned by Google Calendar when an event is synced. Used to prevent duplicate imports. |

---

*This document reflects the state of Cadenza as of Phase 12, QA Run 6 (2026-03-04).*
