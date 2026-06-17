export interface AppTimestamp {
  seconds: number;
  nanoseconds: number;
}

export function fromDateTimestamp(date: Date): AppTimestamp {
  const ms = date.getTime();
  return {
    seconds: Math.floor(ms / 1000),
    nanoseconds: (ms % 1000) * 1_000_000,
  };
}

export function nowTimestamp(): AppTimestamp {
  return fromDateTimestamp(new Date());
}
