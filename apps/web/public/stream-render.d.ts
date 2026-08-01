export type FrameScheduler = (callback: () => void) => void;

export declare function createFrameBatcher<T>(
  render: (value: T) => void,
  schedule?: FrameScheduler,
): {
  request(value: T): void;
  flush(): void;
};
