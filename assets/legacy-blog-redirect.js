if (/^\/blog(?:\/|$)/.test(window.location.pathname)) {
  const path = window.location.pathname.replace(/^\/blog(?=\/|$)/, "") || "/";
  window.location.replace(`${path}${window.location.search}${window.location.hash}`);
}
