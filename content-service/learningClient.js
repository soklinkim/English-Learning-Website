function unavailable(message) {
    const error = new Error(message);
    error.status = 503;
    return error;
}

// Asks the Learning Service whether the calling student is enrolled in a course.
// The caller's Authorization header is forwarded so Learning can identify the student.
async function isEnrolled(courseId, authorization) {
    const base = process.env.LEARNING_SERVICE_URL;

    if (!base) {
        throw unavailable("LEARNING_SERVICE_URL is not configured");
    }

    let response;
    try {
        response = await fetch(`${base}/api/enrollments/check/${courseId}`, {
            headers: { Authorization: authorization },
            signal: AbortSignal.timeout(5000)
        });
    } catch (err) {
        throw unavailable("Learning service is unavailable");
    }

    if (!response.ok) {
        throw unavailable("Learning service is unavailable");
    }

    const body = await response.json();
    return body.enrolled === true;
}

module.exports = { isEnrolled };
