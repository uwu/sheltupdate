export const getProxyURL = (url) => `/${url.split("/").slice(2).join("/")}`;
