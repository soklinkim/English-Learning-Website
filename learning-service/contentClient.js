// Calls the Content Service with the caller's Authorization header forwarded.
// Returns { status, body }; throws an error with status 503 if Content is unreachable.
async function callContent(path, authorization) {
    const base = process.env.CONTENT_SERVICE_URL;

    if (!base) {
        const error = new Error("CONTENT_SERVICE_URL is not configured");
        error.status = 503;
        throw error;
    }

    let response;
    try {
        response = await fetch(`${base}${path}`, {
            headers: { Authorization: authorization },
            signal: AbortSignal.timeout(5000)
        });
    } catch (err) {
        const error = new Error("Content service is unavailable");
        error.status = 503;
        throw error;
    }

    if (response.status >= 500) {
        const error = new Error("Content service is unavailable");
        error.status = 503;
        throw error;
    }

    const body = await response.json().catch(() => null);
    return { status: response.status, body };
}

module.exports = { callContent };
