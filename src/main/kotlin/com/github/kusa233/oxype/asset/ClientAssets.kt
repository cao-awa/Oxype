package com.github.kusa233.oxype.asset

import java.io.File
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap

/**
 * Content hashes for the files under `client/`.
 *
 * The HTTP layer already serves that folder as static assets, so a client can fetch
 * any file in it. What it cannot do is ask *whether* a file changed without fetching
 * the whole thing: an `<img>` revalidates itself, but a picture kept in `localStorage`
 * to avoid the round trip has no such mechanism. This object answers that question --
 * give it a path, get back a hash -- so a stored copy can be kept only while it still
 * matches the file on disk.
 *
 * Every path is confined to the `client` folder. Absolute paths are refused outright,
 * as are `..` segments and anything that resolves outside the folder once symbolic
 * links are followed: the endpoint exists to describe assets the server already
 * publishes, and a request that names a file elsewhere is not a request this can
 * honestly answer.
 */
object ClientAssets {
    /** Folder the API is confined to, relative to the process working directory. */
    const val ROOT_DIRECTORY = "client"

    /** Longest path accepted, which is far longer than any path this project uses. */
    const val MAX_PATH_LENGTH = 256

    /**
     * Hashes already computed, keyed by relative path.
     *
     * A stored entry also remembers the file's size and modification time, so a file
     * rewritten in place is hashed again rather than reported with its old digest.
     * Entries are capped and evicted by age; a miss only costs one read.
     */
    private val cache = ConcurrentHashMap<String, Entry>()

    /** One remembered digest, with the file identity it was computed from. */
    private class Entry(val size: Long, val modifiedAt: Long, val hash: String)

    /** Why a path was refused. The message is shown to the caller as-is. */
    class Rejected(message: String) : IllegalArgumentException(message)

    /** What the caller asked about one file. */
    class Result(val path: String, val hash: String, val size: Long, val modifiedAt: Long)

    /**
     * Resolves a client-relative path to a file inside [ROOT_DIRECTORY].
     *
     * The checks are ordered from cheapest to most expensive, and every one of them
     * fails closed: anything not positively identified as a plain relative path inside
     * the folder is refused rather than normalised into one.
     *
     * @throws Rejected
     */
    fun resolve(path: String?): String {
        val raw = path?.trim().orEmpty()

        if (raw.isEmpty()) {
            throw Rejected("A path is required")
        }
        if (raw.length > MAX_PATH_LENGTH) {
            throw Rejected("Path must be at most $MAX_PATH_LENGTH characters")
        }
        // Absolute paths are refused rather than reinterpreted. A leading separator is
        // how both Unix and Windows spell "start from the root", and the caller is
        // asking for a file in `client/`, so a path that says otherwise is an error --
        // not something this can silently rewrite into the folder.
        if (raw.startsWith("/") || raw.startsWith("\\")) {
            throw Rejected("Absolute paths are not allowed")
        }
        // A drive letter or a UNC prefix reaches outside the folder just as surely.
        if (raw.length >= 2 && raw[1] == ':' && raw[0].isLetter()) {
            throw Rejected("Absolute paths are not allowed")
        }
        // A backslash is a separator on Windows and an ordinary character everywhere
        // else, so accepting it would mean two different resolutions for one request.
        if (raw.contains('\\')) {
            throw Rejected("Path must use '/' as its separator")
        }
        if (raw.contains("://")) {
            throw Rejected("A URL is not a path")
        }
        // Control characters have no business in a file name and are the usual way to
        // smuggle a truncation past a later check.
        if (raw.any { it.code < 0x20 || it.code == 0x7f }) {
            throw Rejected("Path contains a control character")
        }

        val segments = raw.split('/')
        if (segments.any { it.isEmpty() }) {
            throw Rejected("Path contains an empty segment")
        }
        if (segments.any { it == "." || it == ".." }) {
            throw Rejected("Path must not contain '.' or '..'")
        }

        val root = File(ROOT_DIRECTORY)
        val target = File(root, raw)

        // The textual checks above already exclude the ways out of the folder, but a
        // symbolic link inside `client/` can point anywhere. Comparing canonical paths
        // is the only way to see that, and a link that leaves the folder is refused.
        val rootCanonical = root.canonicalFile
        val targetCanonical = target.canonicalFile
        val rootPath = rootCanonical.path
        val targetPath = targetCanonical.path
        val inside = targetPath == rootPath ||
                targetPath.startsWith(rootPath + File.separator)
        if (!inside) {
            throw Rejected("Path must stay inside the client directory")
        }
        // If the file does not exist, `canonicalFile` still yields an absolute path, so
        // existence has to be checked separately to give the caller a clear answer.
        if (!targetCanonical.isFile) {
            throw Rejected("No such file")
        }

        return raw
    }

    /**
     * Returns the SHA-256 of one client file, hashing it only when it has changed.
     *
     * @throws Rejected when the path is refused or the file is unreadable.
     */
    fun hashOf(path: String?): Result {
        val relative = resolve(path)
        val file = File(ROOT_DIRECTORY, relative)

        val size = file.length()
        val modifiedAt = file.lastModified()

        val remembered = cache[relative]
        if (remembered != null && remembered.size == size && remembered.modifiedAt == modifiedAt) {
            return Result(relative, remembered.hash, size, modifiedAt)
        }

        val digest = try {
            MessageDigest.getInstance("SHA-256")
        } catch (e: Exception) {
            throw Rejected("SHA-256 is unavailable")
        }

        try {
            file.inputStream().use { input ->
                val buffer = ByteArray(8192)
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    digest.update(buffer, 0, read)
                }
            }
        } catch (e: Exception) {
            throw Rejected("The file could not be read")
        }

        val hash = digest.digest().joinToString("") { "%02x".format(it) }
        evictIfFull()
        cache[relative] = Entry(size, modifiedAt, hash)
        return Result(relative, hash, size, modifiedAt)
    }

    /** Drops the oldest entries once the cache has grown past its cap. */
    private fun evictIfFull() {
        if (cache.size < 512) {
            return
        }
        // A hash is cheap to recompute, so the whole map is simply cleared rather than
        // tracking an access order that would cost more than a re-read does.
        cache.clear()
    }

    /** Evicts one path, for a caller that has just replaced the file. */
    fun forget(path: String?) {
        val name = path?.trim().orEmpty()
        if (name.isNotEmpty()) {
            cache.remove(name)
        }
    }
}
