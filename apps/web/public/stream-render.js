export function createFrameBatcher(
  render,
  schedule = (callback) => requestAnimationFrame(callback),
) {
  let pending;
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    if (pending === undefined) return;
    const value = pending;
    pending = undefined;
    render(value);
  };

  return {
    request(value) {
      pending = value;
      if (scheduled) return;
      scheduled = true;
      schedule(flush);
    },
    flush() {
      if (!scheduled) return;
      flush();
    },
  };
}
