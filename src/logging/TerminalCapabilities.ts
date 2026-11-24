const palette: Record<string, string> = {
    '30': '30;36;48', '31': '239;68;68', '32': '34;197;94', '33': '245;158;11',
    '34': '96;165;250', '35': '167;139;250', '36': '34;211;238', '37': '226;232;240',
    '90': '100;116;139', '91': '248;113;113', '92': '74;222;128', '93': '251;191;36',
    '94': '147;197;253', '95': '192;132;252', '96': '103;232;249', '97': '248;250;252',
};
export function terminalColor(explicit?: boolean): boolean {
    if (process.env.NO_COLOR !== undefined) return false;
    if (explicit !== undefined) return explicit;
    if (process.env.FORCE_COLOR !== undefined) return process.env.FORCE_COLOR !== '0';
    return Boolean(process.stdout.isTTY && !process.env.CI && process.env.TERM !== 'dumb');
}
export function terminalDepth(explicit?: 4 | 24): 4 | 24 {
    return explicit ?? (process.env.FORCE_COLOR === '3' || /^(truecolor|24bit)$/i.test(process.env.COLORTERM ?? '') ? 24 : 4);
}
export function trueColor(text: string): string {
    return text.replace(/\x1b\[(3[0-7]|9[0-7])m/g, (original, code: string) => palette[code] ? `\x1b[38;2;${palette[code]}m` : original);
}
