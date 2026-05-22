const INSTALL_ID_PARAM = /([?&]install_id=)[^&]*/g;

export const redactInstallIdValue = (key, value) => (key === "install_id" && value !== undefined ? "redacted" : value);

export const redactInstallId = (value) => String(value).replace(INSTALL_ID_PARAM, "$1redacted");
