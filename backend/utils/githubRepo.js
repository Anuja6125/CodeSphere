const fs = require("fs");
const path = require("path");

// GitHub host. Override for GitHub Enterprise or for local testing.
const GITHUB_BASE_URL = (process.env.GITHUB_BASE_URL || "https://github.com").replace(/\/$/, "");
// Optional token. Needed for private repos and to avoid rate limits.
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const MAX_ARCHIVE_BYTES = Number(process.env.MAX_REPO_ZIP_MB || 100) * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = Number(process.env.REPO_DOWNLOAD_TIMEOUT_MS || 60000);

const httpError = (status, message) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

/**
 * Accepts:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo.git
 *   https://github.com/owner/repo/tree/branch[/sub/path]
 *   github.com/owner/repo
 *   owner/repo
 * Returns { owner, repo, ref } where ref may be null (default branch).
 */
const parseGithubUrl = (input) => {
    if (typeof input !== "string" || input.trim() === "") {
        throw httpError(400, "Repository URL is required");
    }

    let value = input.trim();

    if (!/^https?:\/\//i.test(value)) {
        value = value.replace(/^git@github\.com:/i, "https://github.com/");
        if (!/^github\.com\//i.test(value) && /^[\w.-]+\/[\w.-]+$/.test(value)) {
            value = `https://github.com/${value}`;
        } else if (/^github\.com\//i.test(value)) {
            value = `https://${value}`;
        }
    }

    let url;
    try {
        url = new URL(value);
    } catch {
        throw httpError(400, "Not a valid URL");
    }

    const allowedHosts = new Set(["github.com", "www.github.com", new URL(GITHUB_BASE_URL).host.toLowerCase()]);
    if (!allowedHosts.has(url.host.toLowerCase())) {
        throw httpError(400, "Only GitHub repository URLs are supported (https://github.com/owner/repo)");
    }

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) {
        throw httpError(400, "URL must look like https://github.com/owner/repo");
    }

    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, "");
    let ref = null;

    if (parts[2] === "tree" && parts[3]) {
        // Branch names may contain "/"; we cannot tell where the branch ends and a sub path
        // begins, so we take the first segment. Simple branch names cover the common case.
        ref = parts[3];
    }

    if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) {
        throw httpError(400, "Owner or repository name contains invalid characters");
    }

    return { owner, repo, ref };
};

const archiveUrls = ({ owner, repo, ref }) => {
    const base = `${GITHUB_BASE_URL}/${owner}/${repo}/archive`;
    if (!ref) {
        return [`${base}/HEAD.zip`];
    }
    // Try as a branch first, then as a tag or commit.
    return [`${base}/refs/heads/${ref}.zip`, `${base}/${ref}.zip`];
};

const fetchArchive = async (url) => {
    const headers = { "User-Agent": "trace-project-inspector" };
    if (GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
    }

    let response;
    try {
        response = await fetch(url, {
            headers,
            redirect: "follow",
            signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
        });
    } catch (error) {
        if (error.name === "TimeoutError") {
            throw httpError(504, "Timed out while downloading the repository archive");
        }
        throw httpError(502, `Could not reach GitHub: ${error.message}`);
    }

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw httpError(502, `GitHub returned ${response.status} while downloading the archive`);
    }

    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_ARCHIVE_BYTES) {
        throw httpError(413, `Repository archive is larger than the ${MAX_ARCHIVE_BYTES / 1024 / 1024} MB limit`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_ARCHIVE_BYTES) {
        throw httpError(413, `Repository archive is larger than the ${MAX_ARCHIVE_BYTES / 1024 / 1024} MB limit`);
    }

    return buffer;
};

/**
 * Downloads the repository as a ZIP into `destinationDir`.
 * Returns { zipPath, bytes, ref, archiveUrl }.
 */
const downloadRepoArchive = async (repoInfo, destinationDir) => {
    const candidates = archiveUrls(repoInfo);

    for (const url of candidates) {
        const buffer = await fetchArchive(url);
        if (!buffer) {
            continue;
        }

        fs.mkdirSync(destinationDir, { recursive: true });
        const zipPath = path.join(destinationDir, `${repoInfo.repo}-${repoInfo.ref || "HEAD"}.zip`);
        fs.writeFileSync(zipPath, buffer);

        return { zipPath, bytes: buffer.length, archiveUrl: url };
    }

    throw httpError(
        404,
        repoInfo.ref
            ? `Repository or branch "${repoInfo.ref}" not found. Private repositories need GITHUB_TOKEN on the backend.`
            : "Repository not found. Private repositories need GITHUB_TOKEN on the backend."
    );
};

module.exports = {
    parseGithubUrl,
    downloadRepoArchive
};
