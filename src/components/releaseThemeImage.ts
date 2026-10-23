const cache = new Map<string, Promise<void>>();
const limit = 8;
export function loadThemeImage(url: string, priority = false): Promise<void> {
  const cached = cache.get(url);
  if (cached) {
    cache.delete(url);
    cache.set(url, cached);
    return cached;
  }
  const promise = new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = priority ? "high" : "low";
    image.onload = () => {
      // A decode failure is safe to show only if native loading succeeded.
      if (typeof image.decode === "function")
        void image
          .decode()
          .then(resolve, () =>
            image.naturalWidth
              ? resolve()
              : reject(new Error("image_decode_failed")),
          );
      else resolve();
    };
    image.onerror = () => reject(new Error("image_load_failed"));
    image.src = url;
  });
  cache.set(url, promise);
  if (cache.size > limit) cache.delete(cache.keys().next().value!);
  void promise.catch(() => {
    if (cache.get(url) === promise) cache.delete(url);
  });
  return promise;
}
