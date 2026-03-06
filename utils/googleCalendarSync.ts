export interface GoogleCalendarItem {
    id: string;
    summary: string;
    description?: string;
    primary?: boolean;
    accessRole: string; // "owner", "writer", etc.
}

interface InternalEvent {
    title: string;
    start: string; // ISO string Date
    end: string;   // ISO string Date
    description?: string;
    location?: string;
}

/**
 * Fetches the user's Google Calendars that they have write access to.
 */
export async function fetchUserCalendars(accessToken: string): Promise<GoogleCalendarItem[]> {
    if (!accessToken) throw new Error("No Google Access Token provided");

    const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch calendars: ${response.statusText}`);
    }

    const data = await response.json();

    // Filter out calendars they can't write to
    const writableCalendars = data.items.filter(
        (cal: GoogleCalendarItem) => cal.accessRole === "owner" || cal.accessRole === "writer"
    );

    return writableCalendars;
}

/**
 * Syncs (creates) an event to the specified Google Calendar.
 * Returns the Google Event ID.
 */
export async function syncEventToGoogle(
    accessToken: string,
    calendarId: string,
    event: InternalEvent
): Promise<string> {
    if (!accessToken) throw new Error("No Google Access Token provided");

    const googleEvent = {
        summary: event.title,
        description: event.description || "",
        location: event.location || "",
        start: {
            dateTime: new Date(event.start).toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        end: {
            dateTime: new Date(event.end).toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
    };

    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(googleEvent),
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(`Failed to sync to Google Calendar: ${errData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.id; // Return the Google Event ID to store back in our DB
}

/**
 * Updates an existing synced event in Google Calendar.
 */
export async function updateEventInGoogle(
    accessToken: string,
    calendarId: string,
    googleEventId: string,
    event: InternalEvent
): Promise<void> {
    if (!accessToken || !googleEventId) return;

    const googleEvent = {
        summary: event.title,
        description: event.description || "",
        location: event.location || "",
        start: {
            dateTime: new Date(event.start).toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        end: {
            dateTime: new Date(event.end).toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
    };

    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`, {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(googleEvent),
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(`Failed to update Google Calendar event: ${errData.error?.message || response.statusText}`);
    }
}

export interface ImportedGoogleEvent {
    googleEventId: string;
    title: string;
    start: string;
    end: string;
    description: string;
    location: string;
}

/**
 * Fetches events from a Google Calendar within a date range.
 * Used for Google → Cadenza import.
 */
export async function fetchEventsFromGoogle(
    accessToken: string,
    calendarId: string,
    timeMin: string,
    timeMax: string
): Promise<ImportedGoogleEvent[]> {
    if (!accessToken) throw new Error("No Google Access Token provided");

    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set('timeMin', new Date(timeMin).toISOString());
    url.searchParams.set('timeMax', new Date(timeMax).toISOString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '500');

    const response = await fetch(url.toString(), {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
        },
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(`Failed to fetch Google Calendar events: ${errData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return (data.items || []).map((item: any) => ({
        googleEventId: item.id,
        title: item.summary || 'Imported Event',
        start: item.start?.dateTime || item.start?.date || '',
        end: item.end?.dateTime || item.end?.date || '',
        description: item.description || '',
        location: item.location || '',
    }));
}

/**
 * Removes a synced event from Google Calendar using its Google Event ID.
 */
export async function removeEventFromGoogle(
    accessToken: string,
    calendarId: string,
    googleEventId: string
): Promise<void> {
    if (!accessToken || !googleEventId) return;

    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`, {
        method: "DELETE",
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok && response.status !== 410) { // 410 Gone means it's already deleted
        throw new Error(`Failed to delete event from Google Calendar: ${response.statusText}`);
    }
}
