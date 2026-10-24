window.addEventListener(
  "unhandledrejection",
  (event) => {
    const reason = event.reason;
    const isAbort =
      reason &&
      (reason.name === "AbortError" || /signal is aborted/i.test(reason.message || ""));

    if (isAbort) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  },
  true
);