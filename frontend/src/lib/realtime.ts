type RealtimeStateLike = {
  recentEventIds: string[];
  lastEventAt?: string | null;
};

type RealtimeEventLike = {
  id: string;
  occurredAt?: string;
};

export function applyRealtimeEvent(
  state: RealtimeStateLike,
  event: RealtimeEventLike,
): RealtimeStateLike {
  const nextIds = [event.id, ...state.recentEventIds.filter((id) => id !== event.id)].slice(0, 10);
  return {
    ...state,
    recentEventIds: nextIds,
    lastEventAt: event.occurredAt ?? new Date().toISOString(),
  };
}

export type RealtimeSubscriber = {
  subscribe: (
    onEvent: (event: RealtimeEventLike) => void,
    onStatus?: (connected: boolean) => void,
  ) => () => void;
};

export function createRealtimeSubscriber(): RealtimeSubscriber {
  return {
    subscribe: (_onEvent, onStatus) => {
      onStatus?.(true);
      return () => onStatus?.(false);
    },
  };
}
