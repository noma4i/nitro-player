type NitroPlaybackResumeMode = 'automatic' | 'manual';
export type NitroPlaybackPolicy = Readonly<{ group: string; priority: number; resume: NitroPlaybackResumeMode }>;
