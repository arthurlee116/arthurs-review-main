// A fresh document keeps Studio navigation separate from public analytics.
export function navigateToPublicPage(path: string) {
  location.assign(path);
}
