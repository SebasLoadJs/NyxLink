/** Session IDs are opaque single path components, not arbitrary URL fragments. */
export function isSessionId(value: unknown): value is string {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export function sessionPath(sessionId: unknown): string {
    if (!isSessionId(sessionId)) throw new TypeError('Invalid backend session ID');
    return '/v4/sessions/' + encodeURIComponent(sessionId);
}

export function playerPath(sessionId: unknown, guildId: unknown): string {
    if (typeof guildId !== 'string' || !/^\d{17,20}$/.test(guildId)) throw new TypeError('Invalid guild ID');
    return sessionPath(sessionId) + '/players/' + guildId;
}
